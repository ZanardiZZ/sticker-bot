/**
 * WhatsApp client initialization and configuration
 * Uses the Baileys WebSocket bridge as the single WhatsApp client
 */

const { createAdapter: createBaileysAdapter } = require('../waAdapter');

// Configuration

/**
 * Creates the appropriate client based on configuration
 * @param {Function} startCallback - Function to call when client is ready
 * @returns {Promise} Promise that resolves to the WhatsApp client
 */
async function createClient(startCallback) {
  console.log('🔗 Iniciando cliente via Baileys WS Adapter...');
  const adapter = await createBaileysAdapter();
  return adapter;
}

/**
 * Initializes the WhatsApp client and starts the bot
 * @param {Function} startCallback - Function to call when client starts
 */
async function initializeBot(startCallback) {
  try {
    console.log('🚀 Iniciando bot em modo: BAILEYS_WS');

    const client = await createClient(startCallback);
    await startCallback(client);
  } catch (error) {
    console.error('❌ Erro ao iniciar cliente:', error);

    throw error;
  }
}

module.exports = {
  createClient,
  initializeBot
};
