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
      await client.reply(chatId, 'Mídia não encontrada para o ID fornecido.', message.id);
      return;
    }

    await incrementRandomCount(media.id);
    
    // Try to send the media first
    try {
      await sendMediaAsOriginal(client, chatId, media);
      console.log(`[handleIdCommand] Mídia ${mediaId} enviada com sucesso`);
    } catch (mediaError) {
      console.error(`[handleIdCommand] Erro ao enviar mídia ${mediaId}:`, mediaError.message);
      // Inform user about media sending failure
      await client.reply(chatId, `⚠️ Erro ao enviar a mídia (ID: ${mediaId}): ${mediaError.message}`, message.id);
      // Don't return here - still send the info message
    }

    // Small delay to help with socket mode timing (avoid race conditions)
    await new Promise(resolve => setTimeout(resolve, 100));

    // Get tags and prepare response message
    const tags = await getTagsForMedia(media.id);
    const cleanMediaInfo = cleanDescriptionTags(media.description, tags);
    
    // Use imported renderInfoMessage function
    const responseMessage = renderInfoMessage({ 
      description: cleanMediaInfo.description, 
      tags: cleanMediaInfo.tags, 
      id: media.id 
    });

    // Send description message with specific error handling for socket mode
    try {
      await client.reply(chatId, responseMessage, message.id);
      console.log(`[handleIdCommand] Mensagem de descrição enviada com sucesso para mídia ${media.id}`);
    } catch (replyError) {
      console.error(`[handleIdCommand] Erro ao enviar descrição para mídia ${media.id}:`, replyError.message);
      // Try alternative sending method if reply fails
      try {
        if (typeof client.sendText === 'function') {
          await client.sendText(chatId, responseMessage);
          console.log(`[handleIdCommand] Descrição enviada via sendText como fallback para mídia ${media.id}`);
        } else {
          console.error(`[handleIdCommand] client.sendText não disponível para fallback`);
        }
      } catch (fallbackError) {
        console.error(`[handleIdCommand] Fallback também falhou:`, fallbackError.message);
      }
    }
    
  } catch (err) {
    console.error('Erro geral no comando #ID:', err);
    await client.reply(chatId, 'Erro ao processar comando #ID.', message.id);
  }
}

module.exports = { handleIdCommand };