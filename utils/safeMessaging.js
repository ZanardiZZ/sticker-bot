/**
 * Safe messaging utilities that provide fallback mechanisms
 * for reliable message delivery in WhatsApp client
 */

/**
 * Safe reply function that tries client.reply first, then falls back to client.sendText
 * @param {Object} client - WhatsApp client instance
 * @param {string} chatId - Chat ID to send message to
 * @param {string} message - Message text to send
 * @param {string} [replyToId] - Optional message ID to reply to
 * @returns {Promise<boolean>} - Returns true if message was sent successfully
 */
async function safeReply(client, chatId, message, replyToId = null) {
  try {
    // First try to use client.reply if replyToId is provided
    if (replyToId) {
      await client.reply(chatId, message, replyToId);
      return true;
    } else {
      // If no replyToId, use sendText directly
      await client.sendText(chatId, message);
      return true;
    }
  } catch (replyError) {
    console.error(`[safeReply] client.reply failed:`, replyError.message);
    
    // Try fallback to sendText
    try {
      if (typeof client.sendText === 'function') {
        await client.sendText(chatId, message);
        console.log(`[safeReply] Message sent via sendText fallback`);
        return true;
      } else {
        console.error(`[safeReply] client.sendText not available for fallback`);
        return false;
      }
    } catch (fallbackError) {
      console.error(`[safeReply] Fallback sendText also failed:`, fallbackError.message);
      return false;
    }
  }
}

module.exports = {
  safeReply
};