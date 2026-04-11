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
  if (!client || typeof client.simulateTyping !== 'function' || !chatId) {
    return () => {};
  }

  const safetyTimeoutMs = Number(process.env.TYPING_MAX_DURATION_MS || 45000);
  let stopped = false;

  // Fire-and-forget: don't block command flow
  client.simulateTyping(chatId, true).catch((error) => {
    console.error('[TYPING] Erro ao iniciar indicador de digitação:', error.message);
  });

  const timer = setTimeout(() => {
    if (stopped) return;
    stopped = true;
    client.simulateTyping(chatId, false).catch((error) => {
      console.error('[TYPING] Erro no safety-stop do indicador de digitação:', error.message);
    });
  }, Math.max(5000, safetyTimeoutMs));

  if (typeof timer.unref === 'function') timer.unref();

  return () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
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
