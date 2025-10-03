/**
 * Edit command handler
 */

const { downloadMediaForMessage } = require('../../utils/mediaDownload');
const { getHashVisual, findByHashVisual } = require('../../database/index.js');
const { normalizeText, parseCommand } = require('../../utils/commandNormalizer');
const { safeReply } = require('../../utils/safeMessaging');

/**
 * Handles the #editar command when replying to media
 * @param {Object} client - WhatsApp client
 * @param {Object} message - Message object
 * @param {string} chatId - Chat ID
 * @param {Map} taggingMap - Tagging mode state map
 * @param {number} MAX_TAGS_LENGTH - Maximum length for tags
 * @returns {boolean} True if handled successfully
 */
async function handleEditReply(client, message, chatId, taggingMap, MAX_TAGS_LENGTH) {
  try {
    const quoted = await client.getQuotedMessage(message.id);
    if (quoted.isMedia) {
      const { buffer } = await downloadMediaForMessage(client, quoted);
      const hv = await getHashVisual(buffer);
      const rec = await findByHashVisual(hv);
      if (rec) {
        taggingMap.set(chatId, rec.id);
        await safeReply(
          client,
          `Modo edição ativado para a mídia ID ${rec.id}.\n\n` +
            'Envie no formato:\n' +
            'descricao: [sua descrição]; tags: tag1, tag2, tag3\n' +
            'Você pode enviar apenas tags OU apenas descrição.\n' +
            `Limite total de ${MAX_TAGS_LENGTH} caracteres.`,
          message.id
        );
        return true;
      }
    }
    await safeReply(client, chatId, 'Não foi possível encontrar o ID da mídia respondida.', message.id);
    return true;
  } catch (err) {
    console.error('Erro ao ativar modo edição via resposta:', err);
    await safeReply(client, chatId, 'Erro ao tentar ativar o modo edição.', message.id);
    return true;
  }
}

/**
 * Handles the #editar command (edit media tags and description)
 * @param {object} client - WhatsApp client
 * @param {object} message - Message object
 * @param {string} chatId - Chat ID
 * @param {Map} taggingMap - Tagging mode state map
 * @param {number} MAX_TAGS_LENGTH - Maximum length for tags
 */
async function handleEditCommand(client, message, chatId, taggingMap, MAX_TAGS_LENGTH) {
  const { command, params } = parseCommand(message.body);
  
  // Handle #editar when replying to media
  if (command === '#editar' && message.hasQuotedMsg) {
    return await handleEditReply(client, message, chatId, taggingMap, MAX_TAGS_LENGTH);
  }
  
  // Handle #editar ID <number> format
  if (command === '#editar' && params.length > 0 && normalizeText(params[0]) === 'id') {
    const mediaId = params[1];
    if (mediaId) {
      taggingMap.set(chatId, mediaId);
      await safeReply(
        client,
        chatId,
        `Modo edição ativado para a mídia ID ${mediaId}.\n\n` +
          'Envie no formato:\n' +
          'descricao: [sua descrição]; tags: tag1, tag2, tag3\n' +
          'Você pode enviar apenas tags OU apenas descrição.\n' +
          `Limite total de ${MAX_TAGS_LENGTH} caracteres.`,
        message.id
      );
    }
    return true;
  }
  
  return false;
}

module.exports = { handleEditCommand };
