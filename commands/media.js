/**
 * Media sending utilities for commands
 */

const { Sticker, StickerTypes } = (() => {
  try {
    return require('wa-sticker-formatter');
  } catch {
    return { Sticker: null, StickerTypes: null };
  }
})();

const { PACK_NAME, AUTHOR_NAME } = require('../config/stickers');
const { isGifLikeVideo } = require('../utils/gifDetection');

/**
 * Sends media as appropriate type (sticker for images, file for others)
 * @param {object} client - WhatsApp client
 * @param {string} chatId - Chat ID
 * @param {object} media - Media object from database
 */
async function sendMediaByType(client, chatId, media) {
  if (!media) return;

  const filePath = media.file_path;
  const mimetype = media.mimetype || '';

  const isGif = mimetype === 'image/gif' || filePath.endsWith('.gif');
  const isVideo = mimetype.startsWith('video/');
  const isImage = mimetype.startsWith('image/');
  const isAudio = mimetype.startsWith('audio/');

  // GIFs should be sent as animated stickers
  if (isGif) {
    if (typeof client.sendMp4AsSticker === 'function') {
      try {
        await client.sendMp4AsSticker(chatId, filePath, { pack: PACK_NAME, author: AUTHOR_NAME });
        return;
      } catch (e) {
        console.warn('sendMp4AsSticker falhou, tentando sendImageAsStickerGif:', e?.message || e);
      }
    }
    if (typeof client.sendImageAsStickerGif === 'function') {
      await client.sendImageAsStickerGif(chatId, filePath, { pack: PACK_NAME, author: AUTHOR_NAME });
      return;
    }
    const path = require('path');
    await client.sendFile(chatId, filePath, path.basename(filePath));
    return;
  }

  // Videos should be sent as files
  if (isVideo) {
    const path = require('path');
    await client.sendFile(chatId, filePath, path.basename(filePath));
    return;
  }

  // Audio should be sent as files
  if (isAudio) {
    const path = require('path');
    await client.sendFile(chatId, filePath, path.basename(filePath));
    return;
  }

  // Images as stickers
  if (isImage) {
    if (Sticker && StickerTypes) {
      const sticker = new Sticker(filePath, {
        pack: PACK_NAME,
        author: AUTHOR_NAME,
        type: StickerTypes.FULL,
        quality: 70,
      });
      const webpBuf = await sticker.build();
      const dataUrl = `data:image/webp;base64,${webpBuf.toString('base64')}`;
      await client.sendRawWebpAsSticker(chatId, dataUrl, { pack: PACK_NAME, author: AUTHOR_NAME });
      return;
    }
    await client.sendImageAsSticker(chatId, filePath, { pack: PACK_NAME, author: AUTHOR_NAME });
    return;
  }

  // Others
  const path = require('path');
  await client.sendFile(chatId, filePath, path.basename(filePath));
}

/**
 * Sends media in original format (for #ID command)
 * @param {object} client - WhatsApp client
 * @param {string} chatId - Chat ID
 * @param {object} media - Media object from database
 */
async function sendMediaAsOriginal(client, chatId, media) {
  if (!media) {
    throw new Error('Media object is required');
  }

  const filePath = media.file_path;
  const mimetype = media.mimetype || '';

  // Check if file exists
  const fs = require('fs');
  if (!fs.existsSync(filePath)) {
    console.error(`[sendMediaAsOriginal] Arquivo não encontrado: ${filePath}`);
    throw new Error(`Arquivo de mídia não encontrado: ${filePath}`);
  }

  console.log(`[sendMediaAsOriginal] Enviando mídia: ${filePath} (${mimetype})`);

  const isGif = mimetype === 'image/gif' || filePath.endsWith('.gif');
  const isVideo = mimetype.startsWith('video/');
  const isImage = mimetype.startsWith('image/');

  // Check if video is actually a GIF-like animation
  let isGifLikeVideoFile = false;
  if (isVideo && !isGif) {
    try {
      isGifLikeVideoFile = await isGifLikeVideo(filePath, mimetype);
    } catch (error) {
      console.warn(`[sendMediaAsOriginal] Erro ao detectar GIF-like video: ${error.message}`);
      isGifLikeVideoFile = false;
    }
  }

  const shouldSendAsGif = isGif || isGifLikeVideoFile;

  try {
    // GIFs and GIF-like videos should be sent as animated stickers
    if (shouldSendAsGif) {
      if (typeof client.sendMp4AsSticker === 'function') {
        try {
          await client.sendMp4AsSticker(chatId, filePath, { pack: PACK_NAME, author: AUTHOR_NAME });
          console.log('[sendMediaAsOriginal] GIF/GIF-like enviado via sendMp4AsSticker');
          return;
        } catch (e) {
          console.warn('sendMp4AsSticker falhou, tentando sendImageAsStickerGif (se existir):', e?.message || e);
        }
      }
      if ((isGif || isGifLikeVideoFile) && typeof client.sendImageAsStickerGif === 'function') {
        await client.sendImageAsStickerGif(chatId, filePath, { pack: PACK_NAME, author: AUTHOR_NAME });
        console.log('[sendMediaAsOriginal] GIF/GIF-like enviado via sendImageAsStickerGif');
        return;
      }
      // Fallback for GIFs - send as media if it's actually a video file
      if (isVideo) {
        const path = require('path');
        await client.sendFile(chatId, filePath, path.basename(filePath));
        console.log('[sendMediaAsOriginal] GIF-like video enviado via sendFile como media (fallback)');
      } else {
        const path = require('path');
        await client.sendFile(chatId, filePath, path.basename(filePath));
        console.log('[sendMediaAsOriginal] GIF enviado via sendFile como media (fallback)');
      }
      return;
    }

    // Regular videos should be sent as files (not stickers)
    if (isVideo) {
      const path = require('path');
      await client.sendFile(chatId, filePath, path.basename(filePath));
      console.log('[sendMediaAsOriginal] Vídeo enviado via sendFile');
      return;
    }

    // Images can still be sent as stickers since that's expected behavior
    if (isImage) {
      if (Sticker && StickerTypes) {
        try {
          const sticker = new Sticker(filePath, {
            pack: PACK_NAME,
            author: AUTHOR_NAME,
            type: StickerTypes.FULL,
            quality: 70,
          });
          const webpBuf = await sticker.build();
          const dataUrl = `data:image/webp;base64,${webpBuf.toString('base64')}`;
          await client.sendRawWebpAsSticker(chatId, dataUrl, { pack: PACK_NAME, author: AUTHOR_NAME });
          console.log('[sendMediaAsOriginal] Imagem enviada como sticker via wa-sticker-formatter');
          return;
        } catch (stickerError) {
          console.warn(`[sendMediaAsOriginal] Erro ao processar sticker com wa-sticker-formatter: ${stickerError.message}`);
          console.warn('[sendMediaAsOriginal] Tentando fallback para sendImageAsSticker');
          // Fallback to simpler method
        }
      }
      await client.sendImageAsSticker(chatId, filePath, { pack: PACK_NAME, author: AUTHOR_NAME });
      console.log('[sendMediaAsOriginal] Imagem enviada como sticker via sendImageAsSticker');
      return;
    }

    // Audio and others
    const path = require('path');
    await client.sendFile(chatId, filePath, path.basename(filePath));
    console.log('[sendMediaAsOriginal] Arquivo enviado via sendFile');
    
  } catch (error) {
    console.error(`[sendMediaAsOriginal] Erro ao enviar mídia: ${error.message}`);
    throw new Error(`Falha ao enviar mídia: ${error.message}`);
  }
}

module.exports = {
  sendMediaByType,
  sendMediaAsOriginal
};