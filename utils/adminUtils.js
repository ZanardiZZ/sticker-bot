/**
 * Admin utilities for checking admin permissions
 */

const { normalizeJid } = require('./jidUtils');

/**
 * Get environment admin set
 * Checks ADMIN_NUMBER, ADMIN_NUMBERS, and BOT_SUPER_ADMINS
 * @returns {Set<string>} Set of normalized admin JIDs
 */
function getEnvAdminSet() {
  const entries = [];
  if (process.env.ADMIN_NUMBER) {
    entries.push(process.env.ADMIN_NUMBER);
  }
  if (process.env.ADMIN_NUMBERS) {
    entries.push(...process.env.ADMIN_NUMBERS.split(',').map(v => v.trim()));
  }
  if (process.env.BOT_SUPER_ADMINS) {
    entries.push(...process.env.BOT_SUPER_ADMINS.split(',').map(v => v.trim()));
  }
  return new Set(entries
    .map(value => normalizeJid(value))
    .filter(Boolean));
}

/**
 * Determine if the sender metadata on a message indicates admin privileges.
 * @param {object} message - Message object containing sender metadata
 * @returns {boolean} True if the sender appears to be an admin
 */
function senderIsAdminFromMessage(message) {
  const sender = message?.sender;
  if (!sender) return false;

  if (sender.isAdmin === true || sender.isSuperAdmin === true) return true;

  if (typeof sender.admin === 'string') {
    const lowered = sender.admin.toLowerCase();
    if (lowered.includes('admin')) return true;
  }

  if (Array.isArray(sender.labels)) {
    return sender.labels.some(label => typeof label === 'string' && label.toLowerCase().includes('admin'));
  }

  return false;
}

/**
 * Check if a sender is an admin
 * @param {string} senderId - Sender JID/ID
 * @param {object} message - Optional message object for metadata check
 * @returns {boolean} True if sender is admin
 */
function isAdmin(senderId, message) {
  // First check message metadata
  if (message && senderIsAdminFromMessage(message)) {
    return true;
  }

  // Then check environment admin list
  const adminSet = getEnvAdminSet();
  if (!senderId) return false;

  const normalized = normalizeJid(senderId);
  return adminSet.has(normalized);
}

module.exports = {
  getEnvAdminSet,
  senderIsAdminFromMessage,
  isAdmin
};
