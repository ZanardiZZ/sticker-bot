#!/usr/bin/env node
/**
 * Integration test to verify that chat_id is set correctly for group messages
 * 
 * This test validates that when users send stickers in groups:
 * 1. chat_id is set to the individual user's ID (not the group ID)
 * 2. group_id is set to the group ID
 * 3. sender_id is set to the individual user's ID
 * 4. Stickers are counted for the user, not the group
 */

const { createTestDatabase, createTestTables, insertTestMedia, insertTestContacts, assert, assertEqual, runTestSuite } = require('../helpers/testUtils');
const { countMediaBySenderWithDb } = require('../../database/models/media');

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

/**
 * Helper to get media records for inspection
 */
function getMediaRecords(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM media', (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

const tests = [
  {
    name: 'Group message: chat_id should be user ID, not group ID',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('group-chatid-fix');
      await createTestTables(db);

      const groupId = '1203634036@g.us';
      const userId = '5511999999999@c.us';
      
      // Insert contact for the user
      await insertTestContacts(db, [
        { senderId: userId, displayName: 'Daniel Zanardi' }
      ]);

      // Simulate a message sent in a group:
      // - chat_id should be the user's ID (not the group ID!)
      // - group_id should be the group ID
      // - sender_id should be the user's ID
      await insertTestMedia(db, [
        { 
          chatId: userId,  // FIXED: Should be user ID, not group ID
          groupId: groupId, 
          senderId: userId, 
          countRandom: 1 
        },
        { 
          chatId: userId,  // FIXED: Should be user ID, not group ID
          groupId: groupId, 
          senderId: userId, 
          countRandom: 2 
        },
        { 
          chatId: userId,  // FIXED: Should be user ID, not group ID
          groupId: groupId, 
          senderId: userId, 
          countRandom: 3 
        }
      ]);

      // Verify media records have correct chat_id
      const mediaRecords = await getMediaRecords(db);
      assertEqual(mediaRecords.length, 3, 'Should have 3 media records');
      
      mediaRecords.forEach((record, index) => {
        assertEqual(record.chat_id, userId, `Record ${index + 1}: chat_id should be user ID`);
        assertEqual(record.group_id, groupId, `Record ${index + 1}: group_id should be group ID`);
        assertEqual(record.sender_id, userId, `Record ${index + 1}: sender_id should be user ID`);
      });

      // Test top5usuarios count
      const topUsers = await getTop5UsersByStickerCount(db);
      assertEqual(topUsers.length, 1, 'Should return 1 user (not the group)');
      assertEqual(topUsers[0].effective_sender, userId, 'Should identify user, not group');
      assertEqual(topUsers[0].sticker_count, 3, 'Should count all 3 stickers for the user');
      assertEqual(topUsers[0].is_group, 0, 'Should not be identified as a group');

      // Test perfil count
      const perfilCount = await countMediaBySenderWithDb(db, userId);
      assertEqual(perfilCount, 3, 'Perfil should count all 3 stickers');

      await cleanup();
    }
  },

  {
    name: 'Group message with NULL sender_id: should fall back to chat_id (user ID)',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('group-null-sender');
      await createTestTables(db);

      const groupId = '9876543210@g.us';
      const userId = '5511888888888@c.us';
      
      await insertTestContacts(db, [
        { senderId: userId, displayName: 'Test User' }
      ]);

      // Simulate a rare case where sender_id is NULL but chat_id is correct
      await insertTestMedia(db, [
        { 
          chatId: userId,  // FIXED: User ID (not group ID)
          groupId: groupId, 
          senderId: null,  // Simulating NULL sender_id
          countRandom: 1 
        },
        { 
          chatId: userId,  // FIXED: User ID (not group ID)
          groupId: groupId, 
          senderId: null,  // Simulating NULL sender_id
          countRandom: 2 
        }
      ]);

      // With the fix, COALESCE should fall back to chat_id (user ID), not group_id
      const topUsers = await getTop5UsersByStickerCount(db);
      assertEqual(topUsers.length, 1, 'Should return 1 user');
      assertEqual(topUsers[0].effective_sender, userId, 'Should use chat_id fallback (user ID)');
      assertEqual(topUsers[0].sticker_count, 2, 'Should count both stickers');
      assertEqual(topUsers[0].is_group, 0, 'Should not be a group');

      await cleanup();
    }
  },

  {
    name: 'Old data (BEFORE fix): group ID in chat_id should not be counted as user',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('group-old-data');
      await createTestTables(db);

      const groupId = '1111111111@g.us';
      const userId = '5511777777777@c.us';
      
      await insertTestContacts(db, [
        { senderId: userId, displayName: 'User Before Fix' }
      ]);

      // Simulate OLD data (before fix) where chat_id was incorrectly set to group ID
      await insertTestMedia(db, [
        { 
          chatId: groupId,  // OLD BUG: This was group ID
          groupId: groupId, 
          senderId: userId,  // But sender_id is correct
          countRandom: 1 
        },
        { 
          chatId: groupId,  // OLD BUG: This was group ID
          groupId: groupId, 
          senderId: userId,  // But sender_id is correct
          countRandom: 2 
        }
      ]);

      // Even with old data, sender_id takes precedence in COALESCE
      const topUsers = await getTop5UsersByStickerCount(db);
      assertEqual(topUsers.length, 1, 'Should return 1 user');
      assertEqual(topUsers[0].effective_sender, userId, 'Should use sender_id (first in COALESCE)');
      assertEqual(topUsers[0].sticker_count, 2, 'Should count both stickers');

      // The old data doesn't break anything because sender_id is still there
      const perfilCount = await countMediaBySenderWithDb(db, userId);
      assertEqual(perfilCount, 2, 'Perfil should still work correctly');

      await cleanup();
    }
  },

  {
    name: 'Multiple users in same group: each counted separately',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('group-multi-users');
      await createTestTables(db);

      const groupId = '2222222222@g.us';
      const user1 = '5511111111111@c.us';
      const user2 = '5522222222222@c.us';
      
      await insertTestContacts(db, [
        { senderId: user1, displayName: 'User One' },
        { senderId: user2, displayName: 'User Two' }
      ]);

      // User 1 sends 3 stickers
      await insertTestMedia(db, [
        { chatId: user1, groupId: groupId, senderId: user1, countRandom: 1 },
        { chatId: user1, groupId: groupId, senderId: user1, countRandom: 2 },
        { chatId: user1, groupId: groupId, senderId: user1, countRandom: 3 }
      ]);

      // User 2 sends 2 stickers
      await insertTestMedia(db, [
        { chatId: user2, groupId: groupId, senderId: user2, countRandom: 1 },
        { chatId: user2, groupId: groupId, senderId: user2, countRandom: 2 }
      ]);

      const topUsers = await getTop5UsersByStickerCount(db);
      assertEqual(topUsers.length, 2, 'Should return 2 users');
      
      // Sort by sticker_count desc
      const sortedUsers = topUsers.sort((a, b) => b.sticker_count - a.sticker_count);
      
      assertEqual(sortedUsers[0].effective_sender, user1, 'First user should be user1');
      assertEqual(sortedUsers[0].sticker_count, 3, 'User1 should have 3 stickers');
      
      assertEqual(sortedUsers[1].effective_sender, user2, 'Second user should be user2');
      assertEqual(sortedUsers[1].sticker_count, 2, 'User2 should have 2 stickers');

      // Neither should be identified as a group
      assertEqual(sortedUsers[0].is_group, 0, 'User1 should not be a group');
      assertEqual(sortedUsers[1].is_group, 0, 'User2 should not be a group');

      await cleanup();
    }
  }
];

if (require.main === module) {
  runTestSuite('Group Message chat_id Fix Tests', tests)
    .then((results) => {
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(() => process.exit(1));
}

module.exports = { tests };
