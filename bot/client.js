/**
 * WhatsApp client initialization and configuration
 */

const { create } = require('@open-wa/wa-automate');

/**
 * Creates and configures the WhatsApp client
 * @param {Function} startCallback - Function to call when client is ready
 * @returns {Promise} Promise that resolves to the WhatsApp client
 */
async function createClient(startCallback) {
  return create({
    sessionId: 'StickerBotSession',
    headless: true,
    qrTimeout: 0,
    authTimeout: 0,
    autoRefresh: true,
    restartOnCrash: startCallback,
  });
}

/**
 * Initializes the WhatsApp client and starts the bot
 * @param {Function} startCallback - Function to call when client starts
 */
async function initializeBot(startCallback) {
  try {
    const client = await createClient(startCallback);
    await startCallback(client);
  } catch (error) {
    console.error('Erro ao iniciar cliente:', error);
  }
}

module.exports = {
  createClient,
  initializeBot
};