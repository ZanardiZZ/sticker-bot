/**
 * Bot initialization with history recovery
 * Integrates message history recovery on bot startup
 */

const { recoverChatHistory, HISTORY_RECOVERY_CONFIG } = require('../services/messageHistoryRecovery');

/**
 * Initialize history recovery for a specific chat on bot startup
 * @param {Object} client - WhatsApp client instance
 * @param {Function} messageHandler - Message handler function
 * @param {string} chatId - Chat ID to recover history from
 */
async function initializeChatHistoryRecovery(client, messageHandler, chatId) {
  if (!HISTORY_RECOVERY_CONFIG.enabled) {
    console.log('[HistoryInit] History recovery is disabled via config');
    return;
  }

  try {
    console.log(`[HistoryInit] Starting history recovery for chat: ${chatId}`);
    
    // Add a small delay to ensure bot is fully initialized
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const result = await recoverChatHistory(client, chatId, messageHandler);
    
    console.log(`[HistoryInit] History recovery completed for ${chatId}: ${result.recovered} messages recovered, ${result.errors} errors`);
  } catch (error) {
    console.error(`[HistoryInit] Error during history recovery for ${chatId}:`, error.message);
  }
}

/**
 * Initialize history recovery on bot startup
 * Recovers messages from configured chats or auto-send group
 * @param {Object} client - WhatsApp client instance
 * @param {Function} messageHandler - Message handler function
 */
async function initializeHistoryRecovery(client, messageHandler) {
  if (!HISTORY_RECOVERY_CONFIG.enabled) {
    console.log('[HistoryInit] History recovery is disabled via HISTORY_RECOVERY_ENABLED=false');
    return;
  }

  const autoSendGroupId = process.env.AUTO_SEND_GROUP_ID;
  
  // Determine which chats to sync
  let chatsToSync = [];
  
  if (HISTORY_RECOVERY_CONFIG.chatsToSync && HISTORY_RECOVERY_CONFIG.chatsToSync.length > 0) {
    // Use explicitly configured chats
    chatsToSync = HISTORY_RECOVERY_CONFIG.chatsToSync;
    console.log(`[HistoryInit] History recovery will sync ${chatsToSync.length} configured chats`);
  } else if (autoSendGroupId) {
    // Default to auto-send group if no specific chats configured
    chatsToSync = [autoSendGroupId];
    console.log(`[HistoryInit] History recovery will sync auto-send group: ${autoSendGroupId}`);
  } else {
    console.log('[HistoryInit] No chats configured for history recovery. Set HISTORY_SYNC_CHATS or AUTO_SEND_GROUP_ID');
    return;
  }

  // Start recovery in background (non-blocking)
  setImmediate(async () => {
    console.log('[HistoryInit] Starting background history recovery process...');
    
    for (const chatId of chatsToSync) {
      try {
        await initializeChatHistoryRecovery(client, messageHandler, chatId);
        
        // Add delay between chats to avoid overwhelming the system
        if (chatsToSync.indexOf(chatId) < chatsToSync.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error) {
        console.error(`[HistoryInit] Failed to recover history for ${chatId}:`, error.message);
      }
    }
    
    console.log('[HistoryInit] Background history recovery process completed');
  });
}

/**
 * Setup periodic history sync (optional)
 * @param {Object} client - WhatsApp client instance
 * @param {Function} messageHandler - Message handler function
 * @param {number} intervalHours - Interval in hours between syncs
 */
function setupPeriodicHistorySync(client, messageHandler, intervalHours = 24) {
  if (!HISTORY_RECOVERY_CONFIG.enabled) {
    return;
  }

  const intervalMs = intervalHours * 60 * 60 * 1000;
  
  console.log(`[HistorySync] Setting up periodic history sync every ${intervalHours} hours`);
  
  setInterval(async () => {
    console.log('[HistorySync] Starting periodic history sync...');
    
    try {
      await initializeHistoryRecovery(client, messageHandler);
    } catch (error) {
      console.error('[HistorySync] Error during periodic sync:', error.message);
    }
  }, intervalMs);
}

module.exports = {
  initializeHistoryRecovery,
  initializeChatHistoryRecovery,
  setupPeriodicHistorySync
};
