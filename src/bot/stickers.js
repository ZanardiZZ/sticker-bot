/**
 * Sticker sending and conversion utilities
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const mime = require('mime-types');
const crypto = require('crypto');
const { PACK_NAME, AUTHOR_NAME } = require('../../config/stickers');
const { linkMessageToMedia } = require('../database/models/reactions');
const { BOT_MEDIA_DIR, BOT_TEMP_DIR } = require('../paths');

const MEDIA_DIR = BOT_MEDIA_DIR;
const FIXED_WEBP_DIR = path.join(BOT_TEMP_DIR, 'fixed-webp');

// Conditional loading for FFmpeg
let ffmpeg = null;
try {
  ffmpeg = require('fluent-ffmpeg');
} catch (error) {
  console.warn('[init] FFmpeg não disponível:', error.message);
  console.warn('[init] Funcionalidades de conversão de vídeo serão desabilitadas');
}

const { Sticker, StickerTypes } = require('../utils/stickerFormatter');

/**
 * Ensures directory exists, creating it if necessary
 * @param {string} dir - Directory path
 */
function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Detects if a WebP buffer is animated (VP8X with ANIM bit)
 * @param {Buffer} buf - WebP buffer
 * @returns {boolean} True if animated
 */
function isAnimatedWebpBuffer(buf) {
  try {
    if (!buf || buf.length < 21) return false;
    const riff = buf.slice(0, 4).toString('ascii') === 'RIFF';
    const webp = buf.slice(8, 12).toString('ascii') === 'WEBP';
    const vp8x = buf.slice(12, 16).toString('ascii') === 'VP8X';
    const hasAnimBit = vp8x && (buf[20] & 0x10) === 0x10;
    const hasAnimChunk = buf.indexOf('ANIM') !== -1 || buf.indexOf('ANMF') !== -1;
    return riff && webp && (hasAnimBit || hasAnimChunk);
  } catch { return false; }
}

/**
 * Detects if a WebP file is animated
 * @param {string} filePath - Path to WebP file
 * @returns {boolean} True if animated
 */
async function isAnimatedWebpFile(filePath) {
  try {
    const fd = await fsp.open(filePath, 'r');
    const { buffer } = await fd.read(Buffer.alloc(32), 0, 32, 0);
    await fd.close();
    return isAnimatedWebpBuffer(buffer);
  } catch { return false; }
}

/**
 * Converts video/gif to MP4 format optimized for stickers
 * @param {string} inputPath - Input file path
 * @returns {Promise<string>} Output MP4 file path
 */
async function convertToMp4ForSticker(inputPath) {
  // Check if FFmpeg is available
  if (!ffmpeg) {
    console.warn('[Sticker] FFmpeg não disponível, não é possível converter vídeo para sticker');
    throw new Error('FFmpeg não disponível - conversão de vídeo para sticker desabilitada');
  }
  
  const outDir = path.join(MEDIA_DIR, 'tmp');
  ensureDirSync(outDir);
  const outPath = path.join(outDir, `stk-${Date.now()}.mp4`);
  const vf = "scale=512:-2:flags=lanczos:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black,fps=15,format=yuv420p";
  
  await new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noAudio()
      .videoFilters(vf)
      .duration(6)
      .outputOptions(['-movflags', '+faststart'])
      .on('end', resolve)
      .on('error', reject)
      .save(outPath);
  });
  
  return outPath;
}

/**
 * Normalizes static WebP stickers into a WhatsApp-friendly format (cached by hash)
 * so malformed files don't render as placeholders on the client.
 * Animated WebPs are returned untouched.
 */
async function ensureSafeWebpSticker(filePath) {
  const originalBuffer = await fsp.readFile(filePath);
  const animated = isAnimatedWebpBuffer(originalBuffer);

  if (animated) {
    return { buffer: originalBuffer, animated: true, filePath };
  }

  try {
    ensureDirSync(FIXED_WEBP_DIR);
  } catch (dirErr) {
    console.warn('[Sticker] Falha ao preparar cache de WebP:', dirErr.message);
  }

  const hash = crypto.createHash('md5').update(originalBuffer).digest('hex');
  const cachedPath = path.join(FIXED_WEBP_DIR, `${hash}.webp`);

  if (fs.existsSync(cachedPath)) {
    try {
      const cachedBuffer = await fsp.readFile(cachedPath);
      if (cachedBuffer.length > 0) {
        return { buffer: cachedBuffer, animated: false, filePath: cachedPath };
      }
    } catch (readErr) {
      console.warn('[Sticker] Falha ao ler WebP do cache:', readErr.message);
    }
  }

  try {
    const sticker = new Sticker(originalBuffer, {
      pack: PACK_NAME,
      author: AUTHOR_NAME,
      type: StickerTypes.FULL,
      quality: 80,
    });
    const rebuiltBuffer = await sticker.build();
    await fsp.writeFile(cachedPath, rebuiltBuffer);
    return { buffer: rebuiltBuffer, animated: false, filePath: cachedPath };
  } catch (rebuildErr) {
    console.warn('[Sticker] Falha ao reconstruir WebP, enviando original:', rebuildErr.message);
    return { buffer: originalBuffer, animated: false, filePath };
  }
}

/**
 * Sends raw WebP as sticker
 * @param {Object} client - WhatsApp client
 * @param {string} chatId - Chat ID
 * @param {string} filePath - WebP file path
 * @returns {Promise<string|null>} messageId or null
 */
async function sendRawWebp(client, chatId, filePath, extraOptions = {}) {
  const buf = await fsp.readFile(filePath);
  const base64 = buf.toString('base64');
  const withHeader = `data:image/webp;base64,${base64}`;
  const animatedFlag = typeof extraOptions.animated === 'boolean'
    ? extraOptions.animated
    : isAnimatedWebpBuffer(buf);
  const response = await client.sendRawWebpAsSticker(chatId, withHeader, {
    pack: PACK_NAME,
    author: AUTHOR_NAME,
    ...extraOptions,
    animated: animatedFlag,
  });
  return response?.messageId || null;
}

/**
 * Sends a media file as a sticker, handling different formats appropriately
 * @param {Object} client - WhatsApp client instance
 * @param {string} chatId - Chat ID to send to
 * @param {Object} media - Media record from database
 */
async function sendStickerForMediaRecord(client, chatId, media) {
  if (!media) {
    throw new Error('No media provided to send as sticker');
  }

  const filePath = media.file_path;

  // Verify file exists before attempting to send
  if (!fs.existsSync(filePath)) {
    throw new Error(`Media file not found: ${filePath}`);
  }

  const mimetype = media.mimetype || mime.lookup(filePath) || '';

  // Helpers
  const isGif = mimetype === 'image/gif' || filePath.endsWith('.gif');
  const isImage = mimetype.startsWith('image/');
  const isWebp = mimetype === 'image/webp' || filePath.endsWith('.webp');
  const isVideo = mimetype.startsWith('video/');

  let messageId = null;

  try {
    // 1) WebP → enviar utilizando caminho otimizado
    if (isWebp) {
      const { filePath: safePath, animated } = await ensureSafeWebpSticker(filePath);
      messageId = await sendRawWebp(client, chatId, safePath, { animated });

      if (!messageId) {
        throw new Error('Failed to send WebP sticker - no messageId returned');
      }

      console.log(`[Sticker] Successfully sent WebP ${animated ? '(animated)' : '(static)'} for media ${media.id}`);

      // Link message to media for reaction tracking
      if (media.id) {
        try {
          await linkMessageToMedia(messageId, media.id, chatId);
        } catch (linkErr) {
          console.warn('[Sticker] Failed to link message to media:', linkErr.message);
        }
      }
      return;
    }

    // 2) GIF/Video → tentar sticker animado via conversão
    if (isGif || isVideo) {
      // Preferir mp4 como fonte
      let mp4Path = filePath;
      if (!isVideo) {
        // Converter GIF para MP4 otimizado
        try {
          mp4Path = await convertToMp4ForSticker(filePath);
        } catch (conversionError) {
          console.warn('[Sticker] Erro na conversão para MP4:', conversionError.message);
          console.warn('[Sticker] Enviando GIF original como fallback');
          // Use o arquivo original se a conversão falhar
        }
      }

      if (typeof client.sendMp4AsSticker === 'function') {
        try {
          const response = await client.sendMp4AsSticker(chatId, mp4Path, { pack: PACK_NAME, author: AUTHOR_NAME });
          messageId = response?.messageId || null;

          if (!messageId) {
            throw new Error('sendMp4AsSticker returned no messageId');
          }

          console.log(`[Sticker] Successfully sent MP4/GIF as animated sticker for media ${media.id}`);

          // Link message to media for reaction tracking
          if (media.id) {
            try {
              await linkMessageToMedia(messageId, media.id, chatId);
            } catch (linkErr) {
              console.warn('[Sticker] Failed to link message to media:', linkErr.message);
            }
          }
          return;
        } catch (e) {
          console.warn('sendMp4AsSticker falhou, tentando sendImageAsStickerGif (se existir):', e?.message || e);
        }
      }
      if (isGif && typeof client.sendImageAsStickerGif === 'function') {
        const response = await client.sendImageAsStickerGif(chatId, filePath, { author: AUTHOR_NAME, pack: PACK_NAME });
        messageId = response?.messageId || null;

        if (!messageId) {
          throw new Error('sendImageAsStickerGif returned no messageId');
        }

        console.log(`[Sticker] Successfully sent GIF as animated sticker for media ${media.id}`);

        // Link message to media for reaction tracking
        if (media.id) {
          try {
            await linkMessageToMedia(messageId, media.id, chatId);
          } catch (linkErr) {
            console.warn('[Sticker] Failed to link message to media:', linkErr.message);
          }
        }
        return;
      }
      // Fallback: envia como arquivo
      await client.sendFile(chatId, filePath, 'media');
      console.log(`[Sticker] Sent GIF/Video as file (no animated sticker support) for media ${media.id}`);
      return;
    }

    // 3) Imagem estática → sticker estático com EXIF se disponível
    if (isImage) {
      if (Sticker && StickerTypes) {
        const sticker = new Sticker(filePath, {
          pack: PACK_NAME,
          author: AUTHOR_NAME,
          type: StickerTypes.FULL,
          categories: ['😀','🔥','✨'],
          quality: 70,
        });
        const webpBuf = await sticker.build();
        const withHeader = `data:image/webp;base64,${webpBuf.toString('base64')}`;
        const response = await client.sendRawWebpAsSticker(chatId, withHeader, { pack: PACK_NAME, author: AUTHOR_NAME });
        messageId = response?.messageId || null;

        if (!messageId) {
          throw new Error('sendRawWebpAsSticker (static image) returned no messageId');
        }

        console.log(`[Sticker] Successfully sent static image as sticker for media ${media.id}`);

        // Link message to media for reaction tracking
        if (media.id) {
          try {
            await linkMessageToMedia(messageId, media.id, chatId);
          } catch (linkErr) {
            console.warn('[Sticker] Failed to link message to media:', linkErr.message);
          }
        }
        return;
      }
      const response = await client.sendImageAsSticker(chatId, filePath, { pack: PACK_NAME, author: AUTHOR_NAME });
      messageId = response?.messageId || null;

      if (!messageId) {
        throw new Error('sendImageAsSticker returned no messageId');
      }

      console.log(`[Sticker] Successfully sent image as sticker (fallback method) for media ${media.id}`);

      // Link message to media for reaction tracking
      if (media.id) {
        try {
          await linkMessageToMedia(messageId, media.id, chatId);
        } catch (linkErr) {
          console.warn('[Sticker] Failed to link message to media:', linkErr.message);
        }
      }
      return;
    }

    // 4) Fallback final (não linkamos arquivo)
    await client.sendFile(chatId, filePath, 'media');
  } catch (err) {
    const errMsg = err?.message || String(err);
    // ack_timeout means WPPConnect didn't confirm in time, but the sticker was likely
    // already delivered. Falling back to sendFile would send a duplicate as a raw file.
    if (errMsg.includes('ack_timeout')) {
      console.warn('[Sticker] ack_timeout ao enviar figurinha - sticker provavelmente já foi entregue, ignorando fallback.');
      return;
    }
    console.error('Falha ao enviar mídia como figurinha. Fallback para arquivo. Motivo:', errMsg);
    try {
      await client.sendFile(chatId, filePath, 'media');
      console.log('[Sticker] Sent as file (fallback) instead of sticker');
    } catch (fileErr) {
      // Both sticker and file sending failed - throw exception
      console.error('[Sticker] Failed to send both as sticker and as file:', fileErr?.message || fileErr);
      throw new Error(`Failed to send media ${media.id}: ${errMsg}`);
    }
  }
}

module.exports = {
  sendStickerForMediaRecord,
  isAnimatedWebpBuffer,
  isAnimatedWebpFile,
  ensureDirSync,
  ensureSafeWebpSticker
};
