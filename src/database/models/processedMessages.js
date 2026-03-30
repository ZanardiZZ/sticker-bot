/**
 * Processed messages model - tracks messages that have been processed
 * to avoid duplicate processing during history recovery
 */

const { db } = require('../connection');

/**
 * Mark a message as processed
 * @param {string} messageId - WhatsApp message ID
 * @param {string} chatId - Chat ID where message was received
 * @returns {Promise<void>}
 */
function markMessageAsProcessed(messageId, chatId) {
  return new Promise((resolve, reject) => {
    if (!messageId || !chatId) {
      return reject(new Error('messageId and chatId are required'));
    }

    const now = Math.floor(Date.now() / 1000);
    
    db.run(
      `INSERT OR IGNORE INTO processed_messages (message_id, chat_id, processed_at)
       VALUES (?, ?, ?)`,
      [messageId, chatId, now],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

/**
 * Check if a message has already been processed
 * @param {string} messageId - WhatsApp message ID
 * @returns {Promise<boolean>}
 */
function isMessageProcessed(messageId) {
  return new Promise((resolve, reject) => {
    if (!messageId) {
      return reject(new Error('messageId is required'));
    }

    db.get(
      'SELECT message_id FROM processed_messages WHERE message_id = ? LIMIT 1',
      [messageId],
      (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      }
    );
  });
}

/**
 * Get count of processed messages
 * @param {string} chatId - Optional chat ID to filter by
 * @returns {Promise<number>}
 */
function getProcessedMessageCount(chatId = null) {
  return new Promise((resolve, reject) => {
    const query = chatId 
      ? 'SELECT COUNT(*) as count FROM processed_messages WHERE chat_id = ?'
      : 'SELECT COUNT(*) as count FROM processed_messages';
    
    const params = chatId ? [chatId] : [];
    
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row?.count || 0);
    });
  });
}

/**
 * Clean up old processed messages (older than specified days)
 * @param {number} daysOld - Number of days to keep
 * @returns {Promise<number>} Number of messages deleted
 */
function cleanupOldProcessedMessages(daysOld = 30) {
  return new Promise((resolve, reject) => {
    const cutoffTime = Math.floor(Date.now() / 1000) - (daysOld * 24 * 60 * 60);
    
    db.run(
      'DELETE FROM processed_messages WHERE processed_at < ?',
      [cutoffTime],
      function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
}

/**
 * Batch check if multiple messages have been processed
 * @param {string[]} messageIds - Array of message IDs to check
 * @returns {Promise<Set<string>>} Set of message IDs that have been processed
 */
function getProcessedMessageIds(messageIds) {
  return new Promise((resolve, reject) => {
    if (!messageIds || messageIds.length === 0) {
      return resolve(new Set());
    }

    const placeholders = messageIds.map(() => '?').join(',');
    const query = `SELECT message_id FROM processed_messages WHERE message_id IN (${placeholders})`;
    
    db.all(query, messageIds, (err, rows) => {
      if (err) reject(err);
      else {
        const processedIds = new Set(rows.map(row => row.message_id));
        resolve(processedIds);
      }
    });
  });
}

module.exports = {
  markMessageAsProcessed,
  isMessageProcessed,
  getProcessedMessageCount,
  cleanupOldProcessedMessages,
  getProcessedMessageIds
};
