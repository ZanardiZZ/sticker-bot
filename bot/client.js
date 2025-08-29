/**
 * WhatsApp client initialization and configuration
 * Supports both direct mode and socket mode connections
 */

const { create } = require('@open-wa/wa-automate');
const { WhatsAppSocketClient } = require('./socketClient');

// Configuration
const USE_SOCKET_MODE = process.env.USE_SOCKET_MODE === 'true';
const SOCKET_HOST = process.env.SOCKET_HOST || 'localhost';
const SOCKET_PORT = process.env.SOCKET_PORT || 3001;

/**
 * Creates and configures the WhatsApp client (direct mode)
 * @param {Function} startCallback - Function to call when client is ready
 * @returns {Promise} Promise that resolves to the WhatsApp client
 */
async function createDirectClient(startCallback) {
  console.log('🔗 Iniciando cliente direto...');
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
 * Creates and configures the WhatsApp client via socket connection
 * @returns {Promise} Promise that resolves to the WhatsApp client
 */
async function createSocketClient() {
  console.log('🔌 Iniciando cliente via socket...');
  const socketClient = new WhatsAppSocketClient(SOCKET_HOST, SOCKET_PORT);
  await socketClient.connect();
  return socketClient.getClient();
}

/**
 * Creates the appropriate client based on configuration
 * @param {Function} startCallback - Function to call when client is ready
 * @returns {Promise} Promise that resolves to the WhatsApp client
 */
async function createClient(startCallback) {
  if (USE_SOCKET_MODE) {
    return await createSocketClient();
  } else {
    return await createDirectClient(startCallback);
  }
}

/**
 * Initializes the WhatsApp client and starts the bot
 * @param {Function} startCallback - Function to call when client starts
 */
async function initializeBot(startCallback) {
  try {
    console.log(`🚀 Iniciando bot em modo: ${USE_SOCKET_MODE ? 'SOCKET' : 'DIRETO'}`);
    
    if (USE_SOCKET_MODE) {
      console.log('💡 Certifique-se de que o servidor socket esteja rodando: npm run socket-server');
    }
    
    const client = await createClient(startCallback);
    await startCallback(client);
  } catch (error) {
    console.error('❌ Erro ao iniciar cliente:', error);
    
    if (USE_SOCKET_MODE) {
      console.error('💡 Verifique se o servidor socket está rodando em', `${SOCKET_HOST}:${SOCKET_PORT}`);
      console.error('💡 Execute: npm run socket-server');
    }
    
    throw error;
  }
}

module.exports = {
  createClient,
  createDirectClient,
  createSocketClient,
  initializeBot
};