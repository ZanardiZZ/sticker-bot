/**
 * Random command handler
 */

const { processOldStickers, findById, getMediaWithLowestRandomCount, incrementRandomCount, getTagsForMedia } = require('../../database/index.js');
const { sendMediaByType } = require('../media');
const { renderInfoMessage } = require('../../utils/messageUtils');
const { safeReply } = require('../../utils/safeMessaging');

/**
 * Handles the #random command
 * @param {object} client - WhatsApp client
 * @param {object} message - Message object
 * @param {string} chatId - Chat ID
 */
async function handleRandomCommand(client, message, chatId) {
  try {
    const novasMedias = await processOldStickers();

    let media;
    if (novasMedias.length > 0) {
      const lastMedia = novasMedias[novasMedias.length - 1];
      media = await findById(lastMedia.id);
    } else {
      media = await getMediaWithLowestRandomCount();
    }

    if (!media) {
      await safeReply(client, chatId, 'Nenhuma mídia salva ainda.', message.id);
      return;
    }

    await incrementRandomCount(media.id);
    await sendMediaByType(client, chatId, media);

    const tags = await getTagsForMedia(media.id);
    const infoText = renderInfoMessage(media, tags);
    
    if (infoText.trim()) {
      await safeReply(client, chatId, infoText, message.id);
    }
  } catch (err) {
    console.error('Erro no comando #random:', err);
    await safeReply(client, chatId, 'Erro ao buscar mídia aleatória.', message.id);
  }
}

module.exports = { handleRandomCommand };
