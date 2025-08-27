/**
 * Count command handler
 */

const { countMedia } = require('../../database');

/**
 * Handles the #count command
 * @param {object} client - WhatsApp client
 * @param {string} chatId - Chat ID
 */
async function handleCountCommand(client, chatId) {
  try {
    const count = await countMedia();
    await client.sendText(chatId, `Total de mídias salvas: ${count}`);
  } catch (err) {
    console.error('Erro no comando #count:', err);
    await client.sendText(chatId, 'Erro ao contar mídias.');
  }
}

module.exports = { handleCountCommand };