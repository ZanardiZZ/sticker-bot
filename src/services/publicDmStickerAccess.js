const { dbHandler } = require('../database/connection');
const { normalizeJid } = require('../utils/jidUtils');

const BASE_DAILY_LIMIT = 10;
const REGISTERED_EXTRA_DAILY_LIMIT = 30;
const COOLDOWN_SECONDS = 10;

function envFlag(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function normalizeIdentity(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return normalizeJid(raw) || raw.toLowerCase();
  } catch (_) {
    return raw.toLowerCase();
  }
}

function identityVariants(value) {
  const normalized = normalizeIdentity(value);
  const bare = normalized.replace(/@[^@]+$/, '');
  return [...new Set([normalized, bare].filter(Boolean))];
}

function configuredPilotIds() {
  return new Set(
    String(process.env.PUBLIC_DM_EXPERIMENTAL_IDS || '')
      .split(',')
      .map(normalizeIdentity)
      .filter(Boolean)
  );
}

function getPublicDmSettings() {
  return {
    enabled: envFlag('PUBLIC_DM_ACCESS_ENABLED', false),
    allowAll: envFlag('PUBLIC_DM_ALLOW_ALL', false),
    baseDailyLimit: BASE_DAILY_LIMIT,
    registeredExtraDailyLimit: REGISTERED_EXTRA_DAILY_LIMIT,
    cooldownSeconds: COOLDOWN_SECONDS,
    totalRegisteredDailyLimit: BASE_DAILY_LIMIT + REGISTERED_EXTRA_DAILY_LIMIT,
    pilotConfigured: configuredPilotIds().size > 0
  };
}

function queryOne(sql, params = []) {
  return dbHandler.get(sql, params);
}

function queryAll(sql, params = []) {
  return dbHandler.all(sql, params);
}

function run(sql, params = []) {
  return dbHandler.run(sql, params);
}

function utcDay(timestamp = Date.now()) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

async function findRegisteredSiteUser(userId) {
  const variants = identityVariants(userId);
  if (!variants.length) return null;
  const users = await queryAll(`
    SELECT id, username, phone_number, whatsapp_jid, whatsapp_verified, status
    FROM users
    WHERE status = 'approved'
      AND (whatsapp_verified = 1 OR whatsapp_jid IS NOT NULL OR phone_number IS NOT NULL)
  `);
  const target = new Set(variants);
  for (const user of users || []) {
    for (const candidate of [user.whatsapp_jid, user.phone_number]) {
      if (identityVariants(candidate).some(value => target.has(value))) {
        return { id: user.id, username: user.username };
      }
    }
  }
  return null;
}

async function getDmRecord(userId) {
  const variants = identityVariants(userId);
  if (!variants.length) return null;
  const placeholders = variants.map(() => '?').join(',');
  return queryOne(
    `SELECT * FROM dm_users WHERE user_id IN (${placeholders}) ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END LIMIT 1`,
    [...variants, variants[0]]
  );
}

async function findActiveEntitlement(userId) {
  const variants = identityVariants(userId);
  if (!variants.length) return null;
  try {
    const placeholders = variants.map(() => '?').join(',');
    const row = await queryOne(
      `SELECT id, user_id, provider, status, granted_at, expires_at
       FROM dm_entitlements
       WHERE user_id IN (${placeholders}) AND status = 'approved' AND expires_at > ?
       ORDER BY expires_at DESC LIMIT 1`,
      [...variants, Math.floor(Date.now() / 1000)]
    );
    return row || null;
  } catch (error) {
    // Payment is an optional layer; a missing/unavailable table must fail closed.
    console.warn('[PUBLIC_DM] entitlement lookup unavailable:', error?.message || error);
    return null;
  }
}

async function evaluateAccess(userId) {
  const settings = getPublicDmSettings();
  const normalizedUserId = normalizeIdentity(userId);
  const dmUser = await getDmRecord(normalizedUserId);
  const registeredUser = await findRegisteredSiteUser(normalizedUserId);
  const entitlement = await findActiveEntitlement(normalizedUserId);
  const pilotIds = configuredPilotIds();
  const pilotAllowed = pilotIds.has(normalizedUserId) || identityVariants(normalizedUserId).some(id => pilotIds.has(id));
  const explicitlyAllowed = Boolean(dmUser && Number(dmUser.allowed) === 1);
  const blocked = Boolean(dmUser && Number(dmUser.blocked) === 1);
  const dailyLimit = settings.baseDailyLimit + (registeredUser ? settings.registeredExtraDailyLimit : 0);
  const eligible = settings.enabled && !blocked && (settings.allowAll || pilotAllowed || explicitlyAllowed || Boolean(entitlement));
  return {
    settings,
    userId: normalizedUserId,
    dmUser,
    registeredUser,
    entitlement,
    blocked,
    eligible,
    dailyLimit,
    source: settings.allowAll ? 'allow_all' : (Boolean(entitlement) ? 'entitlement' : (explicitlyAllowed ? 'dm_users' : (pilotAllowed ? 'pilot' : 'none')))
  };
}

function execute(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbHandler.db.run(sql, params, function onRun(error) {
      if (error) return reject(error);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function read(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbHandler.db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null));
  });
}

async function withImmediateTransaction(callback) {
  await execute('BEGIN IMMEDIATE TRANSACTION');
  try {
    const result = await callback();
    await execute('COMMIT');
    return result;
  } catch (error) {
    try { await execute('ROLLBACK'); } catch (_) { /* preserve original error */ }
    throw error;
  }
}

async function reserveDelivery({ userId, mediaId, messageId, now = Math.floor(Date.now() / 1000) }) {
  const access = await evaluateAccess(userId);
  if (!access.eligible) return { ok: false, reason: access.blocked ? 'blocked' : 'not_allowed', access };
  if (!Number.isInteger(Number(mediaId)) || Number(mediaId) <= 0) {
    return { ok: false, reason: 'invalid_media_id', access };
  }
  const requestId = String(messageId || '').trim();
  if (!requestId) return { ok: false, reason: 'missing_message_id', access };
  const day = utcDay(now * 1000);

  return withImmediateTransaction(async () => {
    const duplicate = await read(
      'SELECT id, status, media_id FROM public_dm_delivery_usage WHERE user_id = ? AND request_message_id = ? LIMIT 1',
      [access.userId, requestId]
    );
    if (duplicate) return { ok: false, reason: 'duplicate', duplicate, access };

    await execute(
      `INSERT INTO public_dm_daily_usage (user_id, quota_day, used_count, last_delivery_at)
       VALUES (?, ?, 0, NULL)
       ON CONFLICT(user_id, quota_day) DO NOTHING`,
      [access.userId, day]
    );
    const usage = await read(
      'SELECT used_count, last_delivery_at FROM public_dm_daily_usage WHERE user_id = ? AND quota_day = ?',
      [access.userId, day]
    );
    if (!usage) throw new Error('public_dm_usage_unavailable');

    if (usage.last_delivery_at && now - Number(usage.last_delivery_at) < access.settings.cooldownSeconds) {
      return {
        ok: false,
        reason: 'cooldown',
        retryAfter: access.settings.cooldownSeconds - (now - Number(usage.last_delivery_at)),
        access,
        usage
      };
    }
    if (Number(usage.used_count) >= access.dailyLimit) {
      return { ok: false, reason: 'daily_limit', access, usage };
    }

    const reservation = await execute(
      `INSERT INTO public_dm_delivery_usage
        (user_id, media_id, request_message_id, status, requested_at, updated_at)
       VALUES (?, ?, ?, 'reserved', ?, ?)`,
      [access.userId, Number(mediaId), requestId, now, now]
    );
    await execute(
      `UPDATE public_dm_daily_usage
       SET used_count = used_count + 1, last_delivery_at = ?
       WHERE user_id = ? AND quota_day = ?`,
      [now, access.userId, day]
    );
    return {
      ok: true,
      reservationId: reservation.lastID,
      access,
      usage: { used_count: Number(usage.used_count) + 1, last_delivery_at: now }
    };
  });
}

async function finalizeDelivery({ reservationId, status, errorCode = null, now = Math.floor(Date.now() / 1000) }) {
  const allowed = new Set(['sent', 'failed', 'uncertain']);
  if (!allowed.has(status)) throw new Error('invalid_public_dm_delivery_status');
  return run(
    `UPDATE public_dm_delivery_usage
     SET status = ?, error_code = ?, updated_at = ?
     WHERE id = ? AND status = 'reserved'`,
    [status, errorCode ? String(errorCode).slice(0, 120) : null, now, reservationId]
  );
}

async function getUsage(userId, day = utcDay()) {
  const access = await evaluateAccess(userId);
  const usage = await queryOne(
    'SELECT user_id, quota_day, used_count, last_delivery_at FROM public_dm_daily_usage WHERE user_id = ? AND quota_day = ?',
    [access.userId, day]
  );
  return { access, usage: usage || { user_id: access.userId, quota_day: day, used_count: 0, last_delivery_at: null } };
}

async function listUsage(limit = 100) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  return queryAll(
    `SELECT u.user_id, u.quota_day, u.used_count, u.last_delivery_at,
            d.allowed, d.blocked, d.note
     FROM public_dm_daily_usage u
     LEFT JOIN dm_users d ON d.user_id = u.user_id
     ORDER BY u.quota_day DESC, u.used_count DESC
     LIMIT ${safeLimit}`
  );
}

module.exports = {
  getPublicDmSettings,
  normalizeIdentity,
  evaluateAccess,
  reserveDelivery,
  finalizeDelivery,
  getUsage,
  listUsage
};
