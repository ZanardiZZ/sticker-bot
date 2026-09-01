const { getTotalReactionCount } = require('../database/models/reactions');

const notifiedMilestones = new Map();

function getReactionNotificationConfig(env = process.env) {
  const enabled = ['1', 'true', 'yes', 'on'].includes(String(env.REACTION_NOTIFICATIONS_ENABLED || '').toLowerCase());
  const threshold = Math.min(Math.max(Number.parseInt(env.REACTION_NOTIFICATION_THRESHOLD, 10) || 10, 2), 1000);
  const cooldownMs = Math.min(Math.max(Number.parseInt(env.REACTION_NOTIFICATION_COOLDOWN_MS, 10) || 86400000, 60000), 30 * 86400000);
  return { enabled, threshold, cooldownMs };
}

function shouldNotifyReactionMilestone({ count, threshold, key, now = Date.now(), cooldownMs }) {
  if (!Number.isInteger(count) || count < threshold || count % threshold !== 0) return false;
  const last = notifiedMilestones.get(key);
  if (last && now - last < cooldownMs) return false;
  notifiedMilestones.set(key, now);
  for (const [storedKey, timestamp] of notifiedMilestones) {
    if (now - timestamp > cooldownMs * 2) notifiedMilestones.delete(storedKey);
  }
  return true;
}

async function maybeNotifyReactionMilestone(client, { chatId, mediaId }) {
  const config = getReactionNotificationConfig();
  if (!config.enabled || !client || !chatId || !mediaId) return false;
  const count = await getTotalReactionCount(mediaId);
  const key = `${chatId}:${mediaId}:${count}`;
  if (!shouldNotifyReactionMilestone({ ...config, count, key })) return false;
  await client.sendText(chatId, `🔥 A figurinha #${mediaId} atingiu ${count} reações!`);
  return true;
}

module.exports = { getReactionNotificationConfig, shouldNotifyReactionMilestone, maybeNotifyReactionMilestone };
