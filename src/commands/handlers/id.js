/**
 * ID command handler
 */

const { findById, incrementRandomCount, getTagsForMedia } = require('../../database/index.js');
const { sendMediaAsOriginal } = require('../media');
const { renderInfoMessage, cleanDescriptionTags } = require('../../utils/messageUtils');
const { safeReply } = require('../../utils/safeMessaging');
const { withTyping } = require('../../utils/typingIndicator');

/**
 * Handles the #ID command (send media by ID)
 * @param {object} client - WhatsApp client
 * @param {object} message - Message object
 * @param {string} chatId - Chat ID
 */
async function handleIdCommand(client, message, chatId) {
  const parts = message.body.split(' ');
  if (parts.length !== 2) return { handled: false, status: 'invalid' };
  const mediaId = parts[1];

  try {
    const media = await findById(mediaId);
    if (!media) {
      await safeReply(client, chatId, 'Mídia não encontrada para o ID fornecido.', message.id);
      return { handled: true, status: 'not_found' };
    }

    await incrementRandomCount(media.id);
    
    let sentOk = false;

    // Try to send the media first
    try {
      await withTyping(client, chatId, () => sendMediaAsOriginal(client, chatId, media));
      console.log(`[handleIdCommand] Mídia ${mediaId} enviada com sucesso`);
      sentOk = true;
    } catch (mediaError) {
      console.error(`[handleIdCommand] Erro ao enviar mídia ${mediaId}:`, mediaError.message);
      // Never expose transport, filesystem, or provider errors to WhatsApp users.
      await safeReply(client, chatId, 'Não foi possível enviar esta figurinha agora. Tente novamente mais tarde.', message.id);
      return { handled: true, status: 'failed', errorCode: 'media_send_failed' };
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

    // Send description message using safeReply (removes the complex fallback logic)
    if (sentOk) {
      await safeReply(client, chatId, responseMessage, message.id);
      console.log(`[handleIdCommand] Mensagem de descrição enviada para mídia ${media.id}`);
    }
    return { handled: true, status: 'sent', mediaId: media.id };
    
  } catch (err) {
    console.error('Erro geral no comando #ID:', err);
    await safeReply(client, chatId, 'Erro ao processar comando #ID.', message.id);
    return { handled: true, status: 'uncertain', errorCode: 'id_command_error' };
  }
}

module.exports = { handleIdCommand };
