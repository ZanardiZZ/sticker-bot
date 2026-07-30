process.env.PUBLIC_DM_ACCESS_ENABLED = '1';
process.env.PUBLIC_DM_ALLOW_ALL = '0';

require('../../src/database');
const { dbHandler } = require('../../src/database/connection');
const access = require('../../src/services/publicDmStickerAccess');

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const userId = 'unit-public-dm-access@c.us';
const registeredId = 'unit-public-dm-registered@c.us';
const now = 2100000000;

async function run(sql, params = []) {
  return dbHandler.run(sql, params);
}

async function cleanup() {
  await run('DELETE FROM public_dm_delivery_usage WHERE user_id IN (?, ?)', [userId, registeredId]);
  await run('DELETE FROM public_dm_daily_usage WHERE user_id IN (?, ?)', [userId, registeredId]);
  await run('DELETE FROM dm_users WHERE user_id IN (?, ?)', [userId, registeredId]);
  await run('DELETE FROM users WHERE username IN (?, ?)', ['unit-public-dm', 'unit-public-dm-registered']);
}

const tests = [
  {
    name: 'reserves an approved DM request and enforces cooldown/deduplication',
    fn: async () => {
      await cleanup();
      await run('INSERT INTO dm_users(user_id, allowed, blocked, note, last_activity, created_at, updated_at) VALUES (?,1,0,?,?,?,?)', [userId, 'test', now, now, now]);
      const first = await access.reserveDelivery({ userId, mediaId: 17940, messageId: 'unit-message-1', now });
      const cooldown = await access.reserveDelivery({ userId, mediaId: 17940, messageId: 'unit-message-2', now: now + 1 });
      const duplicate = await access.reserveDelivery({ userId, mediaId: 17940, messageId: 'unit-message-1', now: now + 11 });
      assert(first.ok === true, 'first request should reserve');
      assert(cooldown.reason === 'cooldown' && cooldown.retryAfter === 9, 'cooldown should be 10 seconds');
      assert(duplicate.reason === 'duplicate', 'same WhatsApp message must not reserve twice');
      await access.finalizeDelivery({ reservationId: first.reservationId, status: 'failed', now: now + 12 });
    }
  },
  {
    name: 'adds exactly 30 daily deliveries for a registered site user',
    fn: async () => {
      await cleanup();
      await run('INSERT INTO users(username,password_hash,role,created_at,status,whatsapp_verified,whatsapp_jid) VALUES (?, ?, ?, ?, ?, 1, ?)', ['unit-public-dm-registered', 'test-only', 'user', now, 'approved', registeredId]);
      await run('INSERT INTO dm_users(user_id, allowed, blocked, note, last_activity, created_at, updated_at) VALUES (?,1,0,?,?,?,?)', [registeredId, 'test', now, now, now]);
      const evaluated = await access.evaluateAccess(registeredId);
      assert(evaluated.registeredUser, 'site user should be recognized');
      assert(evaluated.dailyLimit === 40, 'registered user limit must be 10 + 30');
    }
  },
  {
    name: 'fails closed for an unapproved DM',
    fn: async () => {
      await cleanup();
      const evaluated = await access.evaluateAccess('unit-public-dm-denied@c.us');
      assert(evaluated.eligible === false, 'unapproved user must not be eligible');
    }
  }
];

module.exports = { tests, cleanup };
