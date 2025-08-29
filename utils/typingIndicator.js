/**
 * Typing indicator utility for WhatsApp bot
 * Manages the "digitando" (typing) indicator to show the bot is processing
 */

/**
 * Starts typing indicator and returns a function to stop it
 * @param {Object} client - WhatsApp client instance
 * @param {string} chatId - Chat ID where to show typing
 * @returns {Function} Function to stop typing indicator
 */
async function startTyping(client, chatId) {
  try {
    await client.simulateTyping(chatId, true);
    
    // Return a function to stop typing
    return async () => {
      try {
        await client.simulateTyping(chatId, false);
      } catch (error) {
        console.error('[TYPING] Erro ao parar indicador de digitação:', error.message);
      }
    };
  } catch (error) {
    console.error('[TYPING] Erro ao iniciar indicador de digitação:', error.message);
    // Return a no-op function if starting typing fails
    return async () => {};
  }
}

/**
 * Executes a function while showing typing indicator
 * @param {Object} client - WhatsApp client instance
 * @param {string} chatId - Chat ID where to show typing
 * @param {Function} processFunction - Async function to execute while typing
 * @returns {Promise} Result of the process function
 */
async function withTyping(client, chatId, processFunction) {
  const stopTyping = await startTyping(client, chatId);
  
  try {
    return await processFunction();
  } finally {
    await stopTyping();
  }
}

module.exports = {
  startTyping,
  withTyping
};