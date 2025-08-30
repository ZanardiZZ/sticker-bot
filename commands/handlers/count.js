/**
 * Count command handler
 */

const { countMedia } = require('../../database');
const { safeReply } = require('../../utils/safeMessaging');

/**
 * Handles the #count command
 * @param {object} client - WhatsApp client
 * @param {object} message - Message object
 * @param {string} chatId - Chat ID
 */
async function handleCountCommand(client, message, chatId) {
  try {
    const count = await countMedia();
    await safeReply(client, chatId, `Total de mídias salvas: ${count}`, message.id);
  } catch (err) {
    console.error('Erro no comando #count:', err);
    await safeReply(client, chatId, 'Erro ao contar mídias.', message.id);
  }
}

module.exports = { handleCountCommand };