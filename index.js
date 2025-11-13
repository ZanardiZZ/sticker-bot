require('dotenv').config();

// Initialize log collector to capture bot logs
const { getLogCollector } = require('./utils/logCollector');
const logCollector = getLogCollector(2000);

// ---- Modular bot components
const { initializeBot } = require('./bot/client');
const { scheduleAutoSend } = require('./bot/scheduler');
const { setupMessageHandler, handleMessage } = require('./bot/messageHandler');
const { sendStickerForMediaRecord } = require('./bot/stickers');
const { initContactsTable } = require('./bot/contacts');
const { initializeHistoryRecovery, setupPeriodicHistorySync } = require('./bot/historyRecovery');


/**
 * Main bot start function
 * @param {Object} client - WhatsApp client instance
 */
async function start(client) {
  console.log('🤖 Bot iniciado e aguardando mensagens...');

  // Torna o client acessível globalmente para o painel admin
  global.getCurrentWhatsAppClient = () => client;

  // Certifica que a tabela contacts existe
  initContactsTable();

  // Setup message handling
  setupMessageHandler(client, handleMessage);

  // Schedule automatic sending
  scheduleAutoSend(client, sendStickerForMediaRecord);

  // Initialize message history recovery (runs in background)
  try {
    console.log('[Bot] Initializing message history recovery...');
    await initializeHistoryRecovery(client, handleMessage);
    
    // Setup periodic sync if enabled (default: disabled, can be enabled via HISTORY_PERIODIC_SYNC=true)
    if (process.env.HISTORY_PERIODIC_SYNC === 'true') {
      const syncIntervalHours = parseInt(process.env.HISTORY_SYNC_INTERVAL_HOURS) || 24;
      setupPeriodicHistorySync(client, handleMessage, syncIntervalHours);
    }
  } catch (error) {
    console.error('[Bot] Error initializing history recovery:', error.message);
    console.error('[Bot] Bot will continue without history recovery');
  }
}

// ---- Inicialização
initializeBot(start);
