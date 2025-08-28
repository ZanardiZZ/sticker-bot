/**
 * Edit command handler
 */

const { normalizeText, parseCommand } = require('../../utils/commandNormalizer');

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
  
  if (command === '#editar' && params.length > 0 && normalizeText(params[0]) === 'id') {
    const mediaId = params[1];
    if (mediaId) {
      taggingMap.set(chatId, mediaId);
      await client.sendText(
        chatId,
        `Modo edição ativado para a mídia ID ${mediaId}.\n\n` +
          'Envie no formato:\n' +
          'descricao: [sua descrição]; tags: tag1, tag2, tag3\n' +
          'Você pode enviar apenas tags OU apenas descrição.\n' +
          `Limite total de ${MAX_TAGS_LENGTH} caracteres.`
      );
    }
    return true;
  }
  
  return false;
}

module.exports = { handleEditCommand };