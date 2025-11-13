#!/usr/bin/env node
/**
 * Integration test for LID mapping consistency between perfil and top5usuarios commands
 * 
 * This test validates that both commands use the same effective_sender resolution logic
 * when dealing with LID (Local Identifier) to PN (Phone Number) mappings.
 */

const { createTestDatabase, createTestTables, insertTestMedia, insertTestContacts, assert, assertEqual, runTestSuite } = require('../helpers/testUtils');
const { MockBaileysClient } = require('../helpers/mockBaileysClient');
const { countMediaBySenderWithDb } = require('../../database/models/media');
const { createPerfilHandler } = require('../../commands/handlers/perfil');

/**
 * Helper to insert LID mapping
 */
function insertLidMapping(db, lid, pn) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO lid_mapping (lid, pn) VALUES (?, ?)',
      [lid, pn],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

/**
 * Helper to get top 5 users with same logic as production
 */
function getTop5UsersByStickerCount(db) {
  return new Promise((resolve) => {
    db.all(
      `WITH stats AS (
         SELECT
           CASE
             WHEN COALESCE(m.sender_id, m.chat_id, m.group_id) LIKE '%@lid'
               THEN COALESCE(NULLIF(lm.pn, ''), m.chat_id, m.group_id, m.sender_id)
             ELSE COALESCE(m.sender_id, m.chat_id, m.group_id)
           END AS effective_sender,
           MAX(m.group_id) AS group_id,
           MAX(m.chat_id) AS chat_id,
           COUNT(m.id) AS sticker_count,
           SUM(COALESCE(m.count_random, 0)) AS total_usos
         FROM media m
         LEFT JOIN lid_mapping lm ON lm.lid = COALESCE(m.sender_id, m.chat_id, m.group_id)
         WHERE COALESCE(m.sender_id, m.chat_id, m.group_id) IS NOT NULL
           AND COALESCE(m.sender_id, m.chat_id, m.group_id) <> ''
           AND NOT (
             COALESCE(m.sender_id, m.chat_id) LIKE '%bot%' OR
             (m.sender_id = m.chat_id AND m.group_id IS NULL)
           )
         GROUP BY effective_sender
         HAVING effective_sender LIKE '%@%'
         ORDER BY sticker_count DESC
         LIMIT 5
       )
       SELECT 
         (
           SELECT COALESCE(NULLIF(TRIM(c.display_name), ''), '')
           FROM contacts c
           WHERE REPLACE(REPLACE(LOWER(TRIM(c.sender_id)), '@s.whatsapp.net', ''), '@c.us', '') =
                 REPLACE(REPLACE(LOWER(TRIM(s.effective_sender)), '@s.whatsapp.net', ''), '@c.us', '')
           ORDER BY c.updated_at DESC
           LIMIT 1
         ) AS display_name,
         s.effective_sender,
         s.group_id,
         CASE WHEN s.effective_sender LIKE '%@g.us' THEN 1 ELSE 0 END AS is_group,
         s.sticker_count,
         s.total_usos
       FROM stats s
       ORDER BY s.sticker_count DESC, s.effective_sender`,
      (err, rows) => {
        resolve(err ? [] : rows);
      }
    );
  });
}

const tests = [
  {
    name: 'LID mapping: perfil and top5usuarios should return same sticker count',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('lid-mapping-consistency');
      await createTestTables(db);

      // User has both LID and PN in the system
      const lid = '123456789@lid';
      const pn = '5511999999999@c.us';
      
      // Create LID mapping
      await insertLidMapping(db, lid, pn);
      
      // Insert contact with PN
      await insertTestContacts(db, [
        { senderId: pn, displayName: 'Test User' }
      ]);

      // Insert media with LID (simulating messages from WhatsApp using LID)
      await insertTestMedia(db, [
        { senderId: lid, chatId: 'chat1@c.us', countRandom: 5 },
        { senderId: lid, chatId: 'chat2@c.us', countRandom: 3 },
        { senderId: lid, chatId: 'chat3@c.us', countRandom: 7 }
      ]);

      // Test 1: Check top5usuarios count
      const topUsers = await getTop5UsersByStickerCount(db);
      assertEqual(topUsers.length, 1, 'Should return 1 user');
      assertEqual(topUsers[0].effective_sender, pn, 'Should resolve LID to PN');
      assertEqual(topUsers[0].sticker_count, 3, 'Should count all 3 stickers from LID');

      // Test 2: Check perfil count using PN (what user sees in their profile)
      const perfilCount = await countMediaBySenderWithDb(db, pn);
      assertEqual(perfilCount, 3, 'Perfil should count all 3 stickers when queried with PN');

      // Test 3: Verify the counts match
      assertEqual(perfilCount, topUsers[0].sticker_count, 
        'Perfil and top5usuarios should return the same sticker count');

      await cleanup();
    }
  },

  {
    name: 'LID mapping: User with mixed LID and PN entries should be counted correctly',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('lid-mapping-mixed');
      await createTestTables(db);

      const lid = '987654321@lid';
      const pn = '5511888888888@c.us';
      
      await insertLidMapping(db, lid, pn);
      await insertTestContacts(db, [
        { senderId: pn, displayName: 'Mixed User' }
      ]);

      // Insert media with both LID and PN (can happen during migration)
      await insertTestMedia(db, [
        { senderId: lid, chatId: 'chat1@c.us', countRandom: 2 },
        { senderId: lid, chatId: 'chat2@c.us', countRandom: 4 },
        { senderId: pn, chatId: 'chat3@c.us', countRandom: 6 }
      ]);

      const topUsers = await getTop5UsersByStickerCount(db);
      const perfilCount = await countMediaBySenderWithDb(db, pn);

      // Both LID entries should be mapped to PN, plus the direct PN entry
      assertEqual(topUsers.length, 1, 'Should group all entries under one user');
      assertEqual(topUsers[0].sticker_count, 3, 'Should count all 3 media entries');
      assertEqual(perfilCount, 3, 'Perfil should count all 3 entries');
      assertEqual(perfilCount, topUsers[0].sticker_count, 'Counts should match');

      await cleanup();
    }
  },

  {
    name: 'LID mapping: User without mapping falls back to chat_id grouping',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('lid-no-mapping');
      await createTestTables(db);

      const lid = 'orphan123@lid';
      const chatId = 'samechat@c.us'; // Use same chat_id for both
      
      await insertTestContacts(db, [
        { senderId: chatId, displayName: 'Orphan LID User' }
      ]);

      await insertTestMedia(db, [
        { senderId: lid, chatId: chatId, countRandom: 1 },
        { senderId: lid, chatId: chatId, countRandom: 2 }
      ]);

      const topUsers = await getTop5UsersByStickerCount(db);
      
      // When there's no LID mapping, the query falls back to chat_id
      // This is the current behavior in getTop5UsersByStickerCount
      assertEqual(topUsers.length, 1, 'Should return one user (grouped by chat_id)');
      assertEqual(topUsers[0].effective_sender, chatId, 'Should fall back to chat_id when no LID mapping');
      assertEqual(topUsers[0].sticker_count, 2, 'Should count both stickers');
      
      // Test that perfil uses the same logic
      const perfilCountByChatId = await countMediaBySenderWithDb(db, chatId);
      assertEqual(perfilCountByChatId, 2, 'Perfil should count both when queried by chat_id');
      assertEqual(perfilCountByChatId, topUsers[0].sticker_count, 'Counts should match');

      await cleanup();
    }
  },

  {
    name: 'LID mapping: perfil command integration test',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('lid-perfil-integration');
      await createTestTables(db);

      const lid = '555444333@lid';
      const pn = '5511777777777@c.us';
      
      await insertLidMapping(db, lid, pn);
      await insertTestContacts(db, [
        { senderId: pn, displayName: 'Integration User' }
      ]);

      await insertTestMedia(db, [
        { senderId: lid, chatId: 'chat1@c.us', countRandom: 10 },
        { senderId: lid, chatId: 'chat2@c.us', countRandom: 20 },
        { senderId: pn, chatId: 'chat3@c.us', countRandom: 30 }
      ]);

      const replies = [];
      const handler = createPerfilHandler({
        getContact: (senderId) => new Promise((resolve, reject) => {
          db.get('SELECT * FROM contacts WHERE sender_id = ?', [senderId], (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          });
        }),
        countMediaBySender: (senderId) => countMediaBySenderWithDb(db, senderId),
        getUserCommandUsage: async () => [],
        getTotalCommands: async () => 0,
        safeReplyFn: async (client, chatId, text) => {
          replies.push({ chatId, text });
        }
      });

      const client = new MockBaileysClient();
      const message = { id: 'msg-1', body: '#perfil', from: pn };
      const context = { resolvedSenderId: pn };

      await handler(client, message, 'chat-123', context);

      assertEqual(replies.length, 1, 'Should send a single reply');
      const response = replies[0].text;

      assert(response.includes('Integration User'), 'Should include display name');
      assert(response.includes('• Figurinhas enviadas: 3'), 
        'Should count all 3 stickers (2 from LID + 1 from PN)');

      await cleanup();
    }
  }
];

if (require.main === module) {
  runTestSuite('LID Mapping Consistency Tests', tests)
    .then((results) => {
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(() => process.exit(1));
}

module.exports = { tests };
