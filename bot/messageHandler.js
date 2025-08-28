/**
 * Message handling pipeline for the bot
 */

const { handleCommand, handleTaggingMode, taggingMap } = require('../commands');
const { normalizeText } = require('../utils/commandNormalizer');
const { logReceivedMessage } = require('./logging');
const { upsertContactFromMessage } = require('./contacts');
const { processIncomingMedia } = require('../mediaProcessor');

/**
 * Main message handler that processes all incoming messages
 * @param {Object} client - WhatsApp client instance
 * @param {Object} message - Incoming message object
 */
async function handleMessage(client, message) {
  await logReceivedMessage(client, message);
  
  // Update contact information
  try { 
    upsertContactFromMessage(message);
  } catch (e) {
    console.error('[bot] upsertContactFromMessage error:', e);
  }
  
  try {
    const chatId = message.from;
    
    // 1) Try to handle command via commands module (includes validation)
    const commandHandled = await handleCommand(client, message, chatId);
    if (commandHandled) return;

    // 2) Modo edição de tags (if activated for this chat)
    if (message.type === 'chat' && message.body && taggingMap.has(chatId)) {
      const handled = await handleTaggingMode(client, message, chatId);
      if (handled) return;
    }

    // 3) Sem comando -> só processa se for mídia
    if (!message.isMedia) return;
    await processIncomingMedia(client, message);
    
  } catch (e) {
    console.error('Erro ao processar mensagem:', e);
    if (e?.response?.data) console.error('Detalhes resposta:', e.response.data);
    try { 
      await client.sendText(message.from, 'Erro ao processar sua mensagem.'); 
    } catch {}
  }
}

/**
 * Sets up message handling for the client
 * @param {Object} client - WhatsApp client instance
 */
function setupMessageHandler(client) {
  client.onMessage(handleMessage);
}

module.exports = {
  handleMessage,
  setupMessageHandler
};