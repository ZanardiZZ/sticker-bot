/**
 * WhatsApp client initialization and configuration
 * Supports both direct mode and socket mode connections
 */

const { create } = require('@open-wa/wa-automate');
const { SocketClient } = require('@open-wa/wa-automate-socket-client');
const { createAdapter: createBaileysAdapter } = require('../waAdapter');

// Configuration
const USE_SOCKET_MODE = process.env.USE_SOCKET_MODE === 'true';
const USE_BAILEYS = process.env.USE_BAILEYS === 'true';
const SOCKET_HOST = process.env.SOCKET_HOST || 'localhost';
const SOCKET_PORT = process.env.SOCKET_PORT || 8002; // padrão do tutorial e socket-client
const SOCKET_API_KEY = process.env.SOCKET_API_KEY || 'your_api_key';

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
    executablePath: process.env.CHROME_EXECUTABLE_PATH || '/usr/bin/google-chrome',
    restartOnCrash: startCallback,
  });
}

/**
 * Creates and configures the WhatsApp client via socket connection
 * @returns {Promise} Promise that resolves to the WhatsApp client
 */
async function createSocketClient() {
  console.log('🔌 Iniciando cliente via socket...');
  const client = await SocketClient.connect(
    `http://${SOCKET_HOST}:${SOCKET_PORT}`,
    SOCKET_API_KEY
  );
  console.log("Socket Connected! ID:", client.socket.id);
  return client;
}

/**
 * Creates the appropriate client based on configuration
 * @param {Function} startCallback - Function to call when client is ready
 * @returns {Promise} Promise that resolves to the WhatsApp client
 */
async function createClient(startCallback) {
  if (USE_BAILEYS) {
    console.log('🔗 Iniciando cliente via Baileys WS Adapter...');
    const adapter = await createBaileysAdapter();
    return adapter;
  } else if (USE_SOCKET_MODE) {
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
  const mode = USE_BAILEYS ? 'BAILEYS_WS' : (USE_SOCKET_MODE ? 'SOCKET' : 'DIRETO');
  console.log(`🚀 Iniciando bot em modo: ${mode}`);

  if (USE_SOCKET_MODE && !USE_BAILEYS) {
      console.log('💡 Certifique-se de que o servidor socket esteja rodando: npx @open-wa/wa-automate --socket -p 8002 -k your_api_key');
    }

    const client = await createClient(startCallback);
    await startCallback(client);
  } catch (error) {
    console.error('❌ Erro ao iniciar cliente:', error);

    if (USE_SOCKET_MODE) {
      console.error('💡 Verifique se o servidor socket está rodando em', `${SOCKET_HOST}:${SOCKET_PORT}`);
      console.error('💡 Execute: npx @open-wa/wa-automate --socket -p 8002 -k your_api_key');
    } else if (error.message && error.message.includes('Failed to launch the browser process')) {
      console.error('💡 Erro de lançamento do navegador detectado:');
      console.error('   - Verifique se o Chrome está instalado no sistema');
      console.error('   - Configure CHROME_EXECUTABLE_PATH no .env se necessário');
      console.error('   - Caminhos comuns: /usr/bin/google-chrome, /usr/bin/chromium');
      console.error('   - Ou reinstale com: npx puppeteer browsers install chrome');
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