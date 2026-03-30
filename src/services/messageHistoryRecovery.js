/**
 * Message History Recovery Service
 * Fetches and processes messages from WhatsApp history that were missed
 * when bot was offline or queue was full
 */

const { getProcessedMessageIds } = require('../database');

/**
 * Configuration for history recovery
 */
const HISTORY_RECOVERY_CONFIG = {
  batchSize: parseInt(process.env.HISTORY_BATCH_SIZE) || 10,
  maxMessagesPerChat: parseInt(process.env.HISTORY_MAX_MESSAGES) || 50,
  enabled: process.env.HISTORY_RECOVERY_ENABLED !== 'false', // enabled by default
  chatsToSync: process.env.HISTORY_SYNC_CHATS ? process.env.HISTORY_SYNC_CHATS.split(',') : null, // null = all chats
};

/**
 * Fetch message history for a specific chat
 * @param {Object} client - WhatsApp client instance
 * @param {string} chatId - Chat ID to fetch history from
 * @param {number} limit - Maximum number of messages to fetch
 * @returns {Promise<Array>} Array of messages
 */
async function fetchChatHistory(client, chatId, limit = 50) {
  try {
    // Check if client has the necessary methods
    if (!client || !client.sock) {
      console.warn('[HistoryRecovery] Client or socket not available');
      return [];
    }

    const sock = client.sock;
    
    // Use Baileys' fetchMessagesFromWA method if available
    if (typeof sock.fetchMessagesFromWA === 'function') {
      console.log(`[HistoryRecovery] Fetching up to ${limit} messages from ${chatId}`);
      const messages = await sock.fetchMessagesFromWA(chatId, limit);
      return messages || [];
    }
    
    // Alternative: Use loadMessages if available
    if (typeof sock.loadMessages === 'function') {
      console.log(`[HistoryRecovery] Loading messages from ${chatId} using loadMessages`);
      const messages = await sock.loadMessages(chatId, limit);
      return messages || [];
    }

    console.warn('[HistoryRecovery] No method available to fetch message history');
    return [];
  } catch (error) {
    console.error(`[HistoryRecovery] Error fetching chat history for ${chatId}:`, error.message);
    return [];
  }
}

/**
 * Filter messages that have not been processed yet
 * @param {Array} messages - Array of messages
 * @returns {Promise<Array>} Array of unprocessed messages
 */
async function filterUnprocessedMessages(messages) {
  if (!messages || messages.length === 0) {
    return [];
  }

  try {
    // Extract message IDs
    const messageIds = messages
      .map(msg => msg.id || msg.key?.id)
      .filter(Boolean);

    if (messageIds.length === 0) {
      return messages;
    }

    // Batch check which messages have been processed
    const processedIds = await getProcessedMessageIds(messageIds);

    // Filter out processed messages
    const unprocessedMessages = messages.filter(msg => {
      const messageId = msg.id || msg.key?.id;
      return messageId && !processedIds.has(messageId);
    });

    console.log(`[HistoryRecovery] Filtered ${messages.length} messages: ${unprocessedMessages.length} unprocessed, ${processedIds.size} already processed`);
    
    return unprocessedMessages;
  } catch (error) {
    console.error('[HistoryRecovery] Error filtering unprocessed messages:', error);
    // On error, return all messages to be safe
    return messages;
  }
}

/**
 * Process messages in batches to avoid overwhelming the system
 * @param {Array} messages - Array of messages to process
 * @param {Function} processingFunction - Function to process each message
 * @param {number} batchSize - Number of messages to process at once
 */
async function processBatch(messages, processingFunction, batchSize = 10) {
  const batches = [];
  
  // Split messages into batches
  for (let i = 0; i < messages.length; i += batchSize) {
    batches.push(messages.slice(i, i + batchSize));
  }

  console.log(`[HistoryRecovery] Processing ${messages.length} messages in ${batches.length} batches of ${batchSize}`);

  let successCount = 0;
  let errorCount = 0;

  // Process each batch sequentially
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`[HistoryRecovery] Processing batch ${i + 1}/${batches.length} (${batch.length} messages)`);

    // Process messages in batch concurrently
    const results = await Promise.allSettled(
      batch.map(message => processingFunction(message))
    );

    // Count successes and failures
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successCount++;
      } else {
        errorCount++;
        console.error(`[HistoryRecovery] Error processing message ${batch[index].id}:`, result.reason);
      }
    });

    // Add delay between batches to avoid rate limiting
    if (i < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`[HistoryRecovery] Batch processing complete: ${successCount} successful, ${errorCount} errors`);
  
  return { successCount, errorCount };
}

/**
 * Recover message history for a specific chat
 * @param {Object} client - WhatsApp client instance
 * @param {string} chatId - Chat ID to recover history from
 * @param {Function} messageHandler - Function to handle each message
 * @returns {Promise<Object>} Recovery statistics
 */
async function recoverChatHistory(client, chatId, messageHandler) {
  if (!HISTORY_RECOVERY_CONFIG.enabled) {
    console.log('[HistoryRecovery] History recovery is disabled');
    return { recovered: 0, errors: 0 };
  }

  console.log(`[HistoryRecovery] Starting history recovery for chat: ${chatId}`);

  try {
    // Fetch message history
    const messages = await fetchChatHistory(client, chatId, HISTORY_RECOVERY_CONFIG.maxMessagesPerChat);
    
    if (messages.length === 0) {
      console.log(`[HistoryRecovery] No messages found for chat ${chatId}`);
      return { recovered: 0, errors: 0 };
    }

    // Filter out already processed messages
    const unprocessedMessages = await filterUnprocessedMessages(messages);

    if (unprocessedMessages.length === 0) {
      console.log(`[HistoryRecovery] All messages already processed for chat ${chatId}`);
      return { recovered: 0, errors: 0 };
    }

    // Process messages in batches
    const { successCount, errorCount } = await processBatch(
      unprocessedMessages,
      messageHandler,
      HISTORY_RECOVERY_CONFIG.batchSize
    );

    console.log(`[HistoryRecovery] History recovery complete for ${chatId}: ${successCount} recovered, ${errorCount} errors`);

    return { recovered: successCount, errors: errorCount };
  } catch (error) {
    console.error(`[HistoryRecovery] Error recovering chat history for ${chatId}:`, error);
    return { recovered: 0, errors: 0 };
  }
}

/**
 * Recover message history for multiple chats
 * @param {Object} client - WhatsApp client instance
 * @param {Array<string>} chatIds - Array of chat IDs to recover history from
 * @param {Function} messageHandler - Function to handle each message
 * @returns {Promise<Object>} Recovery statistics
 */
async function recoverMultipleChatHistories(client, chatIds, messageHandler) {
  if (!HISTORY_RECOVERY_CONFIG.enabled) {
    console.log('[HistoryRecovery] History recovery is disabled');
    return { totalRecovered: 0, totalErrors: 0, chatsProcessed: 0 };
  }

  console.log(`[HistoryRecovery] Starting history recovery for ${chatIds.length} chats`);

  let totalRecovered = 0;
  let totalErrors = 0;
  let chatsProcessed = 0;

  // Process each chat sequentially to avoid overwhelming the system
  for (const chatId of chatIds) {
    const { recovered, errors } = await recoverChatHistory(client, chatId, messageHandler);
    totalRecovered += recovered;
    totalErrors += errors;
    chatsProcessed++;

    // Add delay between chats
    if (chatsProcessed < chatIds.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`[HistoryRecovery] Multi-chat recovery complete: ${totalRecovered} recovered from ${chatsProcessed} chats, ${totalErrors} errors`);

  return { totalRecovered, totalErrors, chatsProcessed };
}

module.exports = {
  fetchChatHistory,
  filterUnprocessedMessages,
  processBatch,
  recoverChatHistory,
  recoverMultipleChatHistories,
  HISTORY_RECOVERY_CONFIG
};
