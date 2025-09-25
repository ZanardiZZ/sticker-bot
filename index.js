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
}

// ---- Inicialização
initializeBot(start);
