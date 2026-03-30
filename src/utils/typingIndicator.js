/**
 * Typing indicator utility for WhatsApp bot
 * Manages the "digitando" (typing) indicator to show the bot is processing
 */

/**
 * Starts typing indicator (fire-and-forget to avoid blocking)
 * @param {Object} client - WhatsApp client instance
 * @param {string} chatId - Chat ID where to show typing
 * @returns {Function} Function to stop typing indicator
 */
function startTyping(client, chatId) {
  // Fire-and-forget: don't await the typing indicator
  client.simulateTyping(chatId, true).catch((error) => {
    console.error('[TYPING] Erro ao iniciar indicador de digitação:', error.message);
  });

  return () => {
    client.simulateTyping(chatId, false).catch((error) => {
      console.error('[TYPING] Erro ao parar indicador de digitação:', error.message);
    });
  };
}

/**
 * Executes a function while showing typing indicator
 * @param {Object} client - WhatsApp client instance
 * @param {string} chatId - Chat ID where to show typing
 * @param {Function} processFunction - Async function to execute while typing
 * @returns {Promise} Result of the process function
 */
async function withTyping(client, chatId, processFunction) {
  const stopTyping = startTyping(client, chatId);

  try {
    return await processFunction();
  } finally {
    stopTyping();
  }
}

module.exports = {
  startTyping,
  withTyping
};
