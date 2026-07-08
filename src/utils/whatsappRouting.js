/**
 * WhatsApp routing helpers for group and DM allowlists.
 */

const { normalizeJid } = require('./jidUtils');

function parseJidCsv(value) {
  if (!value) return new Set();

  return new Set(
    String(value)
      .split(',')
      .map(entry => normalizeJid(entry))
      .filter(Boolean)
  );
}

function getAllowedGroupJids() {
  const entries = new Set();

  // Allow explicit group list from env.
  for (const jid of parseJidCsv(process.env.GROUP_CHAT_ALLOWED_IDS)) {
    entries.add(jid);
  }

  // Backward-compatible fallback: always allow the auto-send group if configured.
  if (process.env.AUTO_SEND_GROUP_ID) {
    entries.add(normalizeJid(process.env.AUTO_SEND_GROUP_ID));
  }

  return entries;
}

function getAllowedDmJids() {
  return parseJidCsv(process.env.STICKER_BOT_ALLOWED_DM_IDS);
}

function isJidAllowed(jid, allowedSet) {
  const normalized = normalizeJid(jid);
  if (!normalized) return false;
  return allowedSet instanceof Set && allowedSet.has(normalized);
}

module.exports = {
  parseJidCsv,
  getAllowedGroupJids,
  getAllowedDmJids,
  isJidAllowed,
};
