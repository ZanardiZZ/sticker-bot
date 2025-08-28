/**
 * Sticker sending and conversion utilities
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const mime = require('mime-types');
const { PACK_NAME, AUTHOR_NAME } = require('../config/stickers');

const MEDIA_DIR = path.resolve(__dirname, '..', 'media');

// Conditional loading for FFmpeg
let ffmpeg = null;
try {
  ffmpeg = require('fluent-ffmpeg');
} catch (error) {
  console.warn('[init] FFmpeg não disponível:', error.message);
  console.warn('[init] Funcionalidades de conversão de vídeo serão desabilitadas');
}

// wa-sticker-formatter é opcional
let Sticker, StickerTypes;
try {
  ({ Sticker, StickerTypes } = require('wa-sticker-formatter'));
} catch (e) {
  console.warn('[init] wa-sticker-formatter não encontrado, usando fallback do open-wa. Instale com: npm i wa-sticker-formatter');
}

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
    const animBit = (buf[20] & 0x10) === 0x10; // bit 5
    return riff && webp && vp8x && animBit;
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
 * Sends raw WebP as sticker
 * @param {Object} client - WhatsApp client
 * @param {string} chatId - Chat ID
 * @param {string} filePath - WebP file path
 */
async function sendRawWebp(client, chatId, filePath) {
  const base64 = (await fsp.readFile(filePath)).toString('base64');
  const withHeader = `data:image/webp;base64,${base64}`;
  await client.sendRawWebpAsSticker(chatId, withHeader, {
    pack: PACK_NAME,
    author: AUTHOR_NAME,
  });
}

/**
 * Sends a media file as a sticker, handling different formats appropriately
 * @param {Object} client - WhatsApp client instance
 * @param {string} chatId - Chat ID to send to
 * @param {Object} media - Media record from database
 */
async function sendStickerForMediaRecord(client, chatId, media) {
  if (!media) return;
  
  const filePath = media.file_path;
  const mimetype = media.mimetype || mime.lookup(filePath) || '';

  // Helpers
  const isGif = mimetype === 'image/gif' || filePath.endsWith('.gif');
  const isImage = mimetype.startsWith('image/');
  const isWebp = mimetype === 'image/webp' || filePath.endsWith('.webp');
  const isVideo = mimetype.startsWith('video/');

  try {
    // 1) Animado WebP → enviar como sticker animado (raw webp)
    if (isWebp && await isAnimatedWebpFile(filePath)) {
      await sendRawWebp(client, chatId, filePath);
      return;
    }

    // 2) GIF/Video → tentar sticker animado via open-wa
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
          await client.sendMp4AsSticker(chatId, mp4Path, { pack: PACK_NAME, author: AUTHOR_NAME });
          return;
        } catch (e) {
          console.warn('sendMp4AsSticker falhou, tentando sendImageAsStickerGif (se existir):', e?.message || e);
        }
      }
      if (isGif && typeof client.sendImageAsStickerGif === 'function') {
        await client.sendImageAsStickerGif(chatId, filePath, { author: AUTHOR_NAME, pack: PACK_NAME });
        return;
      }
      // Fallback: envia como arquivo
      await client.sendFile(chatId, filePath, 'media');
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
        await client.sendRawWebpAsSticker(chatId, withHeader, { pack: PACK_NAME, author: AUTHOR_NAME });
        return;
      }
      await client.sendImageAsSticker(chatId, filePath, { pack: PACK_NAME, author: AUTHOR_NAME });
      return;
    }

    // 4) Fallback final
    await client.sendFile(chatId, filePath, 'media');
  } catch (err) {
    console.error('Falha ao enviar mídia como figurinha. Fallback para arquivo. Motivo:', err?.message || err);
    try {
      await client.sendFile(chatId, filePath, 'media');
    } catch {}
  }
}

module.exports = {
  sendStickerForMediaRecord,
  isAnimatedWebpBuffer,
  isAnimatedWebpFile,
  ensureDirSync
};