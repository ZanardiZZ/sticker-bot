/**
 * Safe messaging utilities that provide reliable message delivery
 * using client.sendText for WhatsApp client
 */

/**
 * Safe reply function that always uses client.sendText for reliable message delivery
 * @param {Object} client - WhatsApp client instance
 * @param {string} chatId - Chat ID to send message to
 * @param {string} message - Message text to send
 * @param {string} [replyToId] - Optional message ID to reply to (ignored, kept for compatibility)
 * @returns {Promise<boolean>} - Returns true if message was sent successfully
 */
async function safeReply(client, chatId, message, replyToId = null) {
  try {
    // Always use client.sendText for reliable delivery
    if (typeof client.sendText === 'function') {
      await client.sendText(chatId, message);
      return true;
    } else {
      console.error(`[safeReply] client.sendText not available`);
      return false;
    }
  } catch (error) {
    console.error(`[safeReply] sendText failed:`, error.message);
    return false;
  }
}

module.exports = {
  safeReply
};