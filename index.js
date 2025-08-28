require('dotenv').config();

// ---- Modular bot components
const { initializeBot } = require('./bot/client');
const { scheduleAutoSend } = require('./bot/scheduler');
const { setupMessageHandler } = require('./bot/messageHandler');
const { sendStickerForMediaRecord } = require('./bot/stickers');
const { initContactsTable } = require('./bot/contacts');


/**
 * Main bot start function
 * @param {Object} client - WhatsApp client instance
 */
async function start(client) {
  console.log('🤖 Bot iniciado e aguardando mensagens...');
  
  // Certifica que a tabela contacts existe
  initContactsTable();
  
  // Setup message handling
  setupMessageHandler(client);
  
  // Schedule automatic sending
  scheduleAutoSend(client, sendStickerForMediaRecord);
}

// ---- Inicialização
initializeBot(start);
