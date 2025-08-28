/**
 * ID command handler
 */

const { findById, incrementRandomCount, getTagsForMedia } = require('../../database');
const { sendMediaAsOriginal } = require('../media');
const { renderInfoMessage, cleanDescriptionTags } = require('../../utils/messageUtils');

/**
 * Handles the #ID command (send media by ID)
 * @param {object} client - WhatsApp client
 * @param {object} message - Message object
 * @param {string} chatId - Chat ID
 */
async function handleIdCommand(client, message, chatId) {
  const parts = message.body.split(' ');
  if (parts.length !== 2) return;
  const mediaId = parts[1];

  try {
    const media = await findById(mediaId);
    if (!media) {
      await client.sendText(chatId, 'Mídia não encontrada para o ID fornecido.');
      return;
    }

    await incrementRandomCount(media.id);
    
    // Use the new function that sends videos as videos, not stickers
    await sendMediaAsOriginal(client, chatId, media);

    // Get tags and prepare response message
    const tags = await getTagsForMedia(media.id);
    const cleanMediaInfo = cleanDescriptionTags(media.description, tags);
    
    // Use imported renderInfoMessage function
    const responseMessage = renderInfoMessage({ 
      description: cleanMediaInfo.description, 
      tags: cleanMediaInfo.tags, 
      id: media.id 
    });

    await client.reply(chatId, responseMessage, message.id);
  } catch (err) {
    console.error('Erro ao buscar mídia pelo ID:', err);
    await client.sendText(chatId, 'Erro ao buscar essa mídia.');
  }
}

module.exports = { handleIdCommand };