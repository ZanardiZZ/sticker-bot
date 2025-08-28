/**
 * Random command handler
 */

const { processOldStickers, findById, getMediaWithLowestRandomCount, incrementRandomCount, getTagsForMedia } = require('../../database');
const { sendMediaByType } = require('../media');
const { renderInfoMessage } = require('../../utils/messageUtils');

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
      await client.sendText(chatId, 'Nenhuma mídia salva ainda.');
      return;
    }

    await incrementRandomCount(media.id);
    await sendMediaByType(client, chatId, media);

    const tags = await getTagsForMedia(media.id);
    const infoText = renderInfoMessage(media, tags);
    
    if (infoText.trim()) {
      await client.sendText(chatId, infoText);
    }
  } catch (err) {
    console.error('Erro no comando #random:', err);
    await client.sendText(chatId, 'Erro ao buscar mídia aleatória.');
  }
}

module.exports = { handleRandomCommand };