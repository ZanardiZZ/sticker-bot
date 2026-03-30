/**
 * Safe messaging utilities that provide reliable message delivery
 * with fallback mechanisms for WhatsApp client
 */

/**
 * Safe reply function that tries client.reply for groups/individual chats, then falls back to simulated reply
 * @param {Object} client - WhatsApp client instance
 * @param {string} chatId - Chat ID to send message to
 * @param {string} responseMessage - Response message text to send
 * @param {Object|string} [originalMessageOrId] - Original message object or message ID for reply
 * @returns {Promise<boolean>} - Returns true if message was sent successfully
 */
async function safeReply(client, chatId, responseMessage, originalMessageOrId = null) {
  // Handle both old signature (replyToId) and new signature (original message object)
  let originalMessage = null;
  let replyToId = null;
  
  if (originalMessageOrId) {
    if (typeof originalMessageOrId === 'object' && originalMessageOrId.id) {
      // New signature: original message object
      originalMessage = originalMessageOrId;
      replyToId = originalMessage.id;
    } else {
      // Old signature: just the message ID
      replyToId = originalMessageOrId;
    }
  }

  //try {
    // Try client.reply for groups (@g.us) and individual chats (@c.us)
  //  if (replyToId && (chatId.endsWith('@c.us') || chatId.endsWith('@g.us'))) {
    //  if (typeof client.reply === 'function') {
      //  await client.reply(chatId, responseMessage, replyToId);
      //  return true;
    //  }
    //}
 // } catch (replyError) {
 //   console.error(`[safeReply] client.reply failed:`, replyError.message);
  //}

  // Fallback to sendText - just send the message directly
  try {
    if (typeof client.sendText === 'function') {
      // Just send the response message directly, no reply simulation
      await client.sendText(chatId, responseMessage);
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