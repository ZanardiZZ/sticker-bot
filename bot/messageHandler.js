/**
 * Message handling pipeline for the bot
 */

const { handleCommand, handleTaggingMode, taggingMap } = require('../commands');
const { normalizeText } = require('../utils/commandNormalizer');
const { logReceivedMessage } = require('./logging');
const { upsertContactFromMessage } = require('./contacts');
const { processIncomingMedia } = require('../mediaProcessor');
const { withTyping } = require('../utils/typingIndicator');
const MediaQueue = require('../services/mediaQueue');

// Create a shared media processing queue with higher retry attempts for media processing
const mediaProcessingQueue = new MediaQueue({ 
  concurrency: 2, // Lower concurrency to reduce resource contention
  retryAttempts: 4, // More retries for media processing failures
  retryDelay: 2000 // Longer delay between retries for resource-intensive operations
});

// Add queue monitoring
mediaProcessingQueue.on('jobAdded', (jobId) => {
  const stats = mediaProcessingQueue.getStats();
  console.log(`[MediaHandler] Media job ${jobId} queued (${stats.waiting} waiting, ${stats.processing} processing)`);
});

mediaProcessingQueue.on('jobRetry', (jobId, attempt, error) => {
  console.log(`[MediaHandler] Media job ${jobId} retry ${attempt}: ${error.message}`);
});

mediaProcessingQueue.on('jobCompleted', (jobId) => {
  const stats = mediaProcessingQueue.getStats();
  console.log(`[MediaHandler] Media job ${jobId} completed (${stats.waiting} waiting, ${stats.processing} processing)`);
});

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
    
    // Queue media processing to avoid resource contention
    await mediaProcessingQueue.add(async () => {
      return await processIncomingMedia(client, message);
    });
    
  } catch (e) {
    console.error('Erro ao processar mensagem:', e);
    if (e?.response?.data) console.error('Detalhes resposta:', e.response.data);
    try { 
      await withTyping(client, message.from, async () => {
        await client.reply(message.from, 'Erro ao processar sua mensagem.', message.id);
      });
    } catch {}
  }
}

/**
 * Sets up message handling for the client
 * @param {Object} client - WhatsApp client instance
 */
function setupMessageHandler(client, handleMessage) {
  if (typeof client.onAnyMessage === "function") {
    client.onAnyMessage(message => handleMessage(client, message));
    console.log("✅ Registrado handler via onAnyMessage");
  } else if (typeof client.onMessage === "function") {
    client.onMessage(message => handleMessage(client, message));
    console.log("✅ Registrado handler via onMessage");
  } else {
    console.error('❌ Nenhum método de listener de mensagem encontrado no client!');
    throw new Error("Client does not support message listeners");
  }
}

module.exports = {
  handleMessage,
  setupMessageHandler
};