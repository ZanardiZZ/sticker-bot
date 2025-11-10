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

module.exports = {
  getEnvAdminSet
};
