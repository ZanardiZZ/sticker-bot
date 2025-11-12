#!/usr/bin/env node
/**
 * Unit tests for media model
 */

const path = require('path');
const { createTestDatabase, createTestTables, insertTestMedia, assert, assertEqual, assertLength, runTestSuite } = require('../helpers/testUtils');
const { countMediaBySenderWithDb } = require('../../database/models/media');

// Mock the database connection for testing
let testDb;
let cleanup;

// Mock the media model by overriding the db connection
function createMediaModel(db) {
  const mediaModel = {
    saveMedia(mediaData) {
      return new Promise((resolve, reject) => {
        const {
          chatId,
          groupId = null,
          senderId = null,
          filePath,
          mimetype,
          timestamp,
          description = null,
          hashVisual,
          hashMd5,
          nsfw = 0
        } = mediaData;

        db.run(
          `INSERT INTO media (chat_id, group_id, sender_id, file_path, mimetype, timestamp, 
                              description, hash_visual, hash_md5, nsfw)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [chatId, groupId, senderId, filePath, mimetype, timestamp, description, hashVisual, hashMd5, nsfw],
          function (err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });
    },

    findByHashVisual(hashVisual) {
      return new Promise((resolve) => {
        db.get(
          'SELECT * FROM media WHERE hash_visual = ? LIMIT 1',
          [hashVisual],
          (err, row) => {
            resolve(err ? null : (row || null));
          }
        );
      });
    },

    findByHashMd5(hashMd5) {
      return new Promise((resolve) => {
        db.get(
          'SELECT * FROM media WHERE hash_md5 = ? LIMIT 1',
          [hashMd5],
          (err, row) => {
            resolve(err ? null : (row || null));
          }
        );
      });
    },

    getRandomSticker() {
      return new Promise((resolve) => {
        db.get(
          'SELECT * FROM media ORDER BY RANDOM() LIMIT 1',
          (err, row) => {
            resolve(err ? null : (row || null));
          }
        );
      });
    },

    updateRandomCount(mediaId) {
      return new Promise((resolve, reject) => {
        db.run(
          'UPDATE media SET count_random = count_random + 1 WHERE id = ?',
          [mediaId],
          function(err) {
            if (err) reject(err);
            else resolve(this.changes);
          }
        );
      });
    },

    getStickerById(mediaId) {
      return new Promise((resolve) => {
        db.get(
          'SELECT * FROM media WHERE id = ?',
          [mediaId],
          (err, row) => {
            resolve(err ? null : (row || null));
          }
        );
      });
    },

    deleteMedia(mediaId) {
      return new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM media WHERE id = ?',
          [mediaId],
          function(err) {
            if (err) reject(err);
            else resolve(this.changes);
          }
        );
      });
    },

    getMediaCount() {
      return new Promise((resolve) => {
        db.get(
          'SELECT COUNT(*) as count FROM media',
          (err, row) => {
            resolve(err ? 0 : row.count);
          }
        );
      });
    },

    getMediaByPage(page = 1, limit = 20) {
      return new Promise((resolve) => {
        const offset = (page - 1) * limit;
        db.all(
          `SELECT m.*, c.display_name 
           FROM media m 
           LEFT JOIN contacts c ON m.sender_id = c.sender_id 
           ORDER BY m.timestamp DESC 
           LIMIT ? OFFSET ?`,
          [limit, offset],
          (err, rows) => {
            resolve(err ? [] : rows);
          }
        );
      });
    }
  };

  return mediaModel;
}

const tests = [
  {
    name: 'Save media successfully',
    fn: async () => {
      const { db, cleanup: cleanupFn } = createTestDatabase('media-save');
      testDb = db;
      cleanup = cleanupFn;
      
      await createTestTables(db);
      const mediaModel = createMediaModel(db);
      
      const mediaData = {
        chatId: 'test-chat-1',
        groupId: 'test-group-1',
        senderId: 'test-sender@c.us',
        filePath: 'test.webp',
        mimetype: 'image/webp',
        timestamp: Date.now(),
        description: 'Test sticker',
        hashVisual: 'test-visual-hash',
        hashMd5: 'test-md5-hash',
        nsfw: 0
      };
      
      const mediaId = await mediaModel.saveMedia(mediaData);
      
      assert(typeof mediaId === 'number', 'Media ID should be a number');
      assert(mediaId > 0, 'Media ID should be greater than 0');
      
      // Verify the media was saved correctly
      const savedMedia = await mediaModel.getStickerById(mediaId);
      assert(savedMedia !== null, 'Saved media should exist');
      assertEqual(savedMedia.chat_id, mediaData.chatId, 'Chat ID should match');
      assertEqual(savedMedia.file_path, mediaData.filePath, 'File path should match');
      assertEqual(savedMedia.mimetype, mediaData.mimetype, 'Mimetype should match');
      
      await cleanup();
    }
  },
  
  {
    name: 'Find media by visual hash',
    fn: async () => {
      const { db, cleanup: cleanupFn } = createTestDatabase('media-visual-hash');
      testDb = db;
      cleanup = cleanupFn;
      
      await createTestTables(db);
      const mediaModel = createMediaModel(db);
      
      // Insert test media
      const testMedia = [
        { hashVisual: 'unique-visual-hash-1', hashMd5: 'md5-1' },
        { hashVisual: 'unique-visual-hash-2', hashMd5: 'md5-2' }
      ];
      
      await insertTestMedia(db, testMedia);
      
      // Test finding by visual hash
      const found1 = await mediaModel.findByHashVisual('unique-visual-hash-1');
      assert(found1 !== null, 'Should find media by visual hash');
      assertEqual(found1.hash_visual, 'unique-visual-hash-1', 'Visual hash should match');
      
      const notFound = await mediaModel.findByHashVisual('non-existent-hash');
      assert(notFound === null, 'Should return null for non-existent hash');
      
      await cleanup();
    }
  },
  
  {
    name: 'Find media by MD5 hash',
    fn: async () => {
      const { db, cleanup: cleanupFn } = createTestDatabase('media-md5-hash');
      testDb = db;
      cleanup = cleanupFn;
      
      await createTestTables(db);
      const mediaModel = createMediaModel(db);
      
      // Insert test media
      const testMedia = [
        { hashVisual: 'visual-1', hashMd5: 'unique-md5-hash-1' },
        { hashVisual: 'visual-2', hashMd5: 'unique-md5-hash-2' }
      ];
      
      await insertTestMedia(db, testMedia);
      
      // Test finding by MD5 hash
      const found1 = await mediaModel.findByHashMd5('unique-md5-hash-1');
      assert(found1 !== null, 'Should find media by MD5 hash');
      assertEqual(found1.hash_md5, 'unique-md5-hash-1', 'MD5 hash should match');
      
      const notFound = await mediaModel.findByHashMd5('non-existent-md5');
      assert(notFound === null, 'Should return null for non-existent MD5');
      
      await cleanup();
    }
  },
  
  {
    name: 'Get random sticker',
    fn: async () => {
      const { db, cleanup: cleanupFn } = createTestDatabase('media-random');
      testDb = db;
      cleanup = cleanupFn;
      
      await createTestTables(db);
      const mediaModel = createMediaModel(db);
      
      // Insert test media
      const testMedia = [
        { hashVisual: 'visual-1', hashMd5: 'md5-1' },
        { hashVisual: 'visual-2', hashMd5: 'md5-2' },
        { hashVisual: 'visual-3', hashMd5: 'md5-3' }
      ];
      
      await insertTestMedia(db, testMedia);
      
      // Test getting random sticker
      const randomSticker = await mediaModel.getRandomSticker();
      assert(randomSticker !== null, 'Should return a random sticker');
      assert(typeof randomSticker.id === 'number', 'Random sticker should have an ID');
      
      // Test with empty database
      await mediaModel.deleteMedia(1);
      await mediaModel.deleteMedia(2);
      await mediaModel.deleteMedia(3);
      
      const noSticker = await mediaModel.getRandomSticker();
      assert(noSticker === null, 'Should return null when no stickers exist');
      
      await cleanup();
    }
  },
  
  {
    name: 'Update random count',
    fn: async () => {
      const { db, cleanup: cleanupFn } = createTestDatabase('media-count-update');
      testDb = db;
      cleanup = cleanupFn;
      
      await createTestTables(db);
      const mediaModel = createMediaModel(db);
      
      // Insert test media
      const testMedia = [{ hashVisual: 'visual-1', hashMd5: 'md5-1' }];
      await insertTestMedia(db, testMedia);
      
      // Get initial count
      const initialSticker = await mediaModel.getStickerById(1);
      const initialCount = initialSticker.count_random;
      
      // Update count
      const changes = await mediaModel.updateRandomCount(1);
      assertEqual(changes, 1, 'Should update one record');
      
      // Verify count was incremented
      const updatedSticker = await mediaModel.getStickerById(1);
      assertEqual(updatedSticker.count_random, initialCount + 1, 'Count should be incremented by 1');
      
      // Update again
      await mediaModel.updateRandomCount(1);
      const doubleUpdatedSticker = await mediaModel.getStickerById(1);
      assertEqual(doubleUpdatedSticker.count_random, initialCount + 2, 'Count should be incremented by 2');
      
      await cleanup();
    }
  },
  
  {
    name: 'Delete media',
    fn: async () => {
      const { db, cleanup: cleanupFn } = createTestDatabase('media-delete');
      testDb = db;
      cleanup = cleanupFn;
      
      await createTestTables(db);
      const mediaModel = createMediaModel(db);
      
      // Insert test media
      const testMedia = [
        { hashVisual: 'visual-1', hashMd5: 'md5-1' },
        { hashVisual: 'visual-2', hashMd5: 'md5-2' }
      ];
      
      await insertTestMedia(db, testMedia);
      
      // Verify media exists
      let sticker1 = await mediaModel.getStickerById(1);
      assert(sticker1 !== null, 'Sticker 1 should exist initially');
      
      // Delete media
      const changes = await mediaModel.deleteMedia(1);
      assertEqual(changes, 1, 'Should delete one record');
      
      // Verify media was deleted
      sticker1 = await mediaModel.getStickerById(1);
      assert(sticker1 === null, 'Sticker 1 should be deleted');
      
      // Verify other media still exists
      const sticker2 = await mediaModel.getStickerById(2);
      assert(sticker2 !== null, 'Sticker 2 should still exist');
      
      await cleanup();
    }
  },
  
  {
    name: 'Get media count',
    fn: async () => {
      const { db, cleanup: cleanupFn } = createTestDatabase('media-count');
      testDb = db;
      cleanup = cleanupFn;
      
      await createTestTables(db);
      const mediaModel = createMediaModel(db);
      
      // Initially no media
      let count = await mediaModel.getMediaCount();
      assertEqual(count, 0, 'Initial count should be 0');
      
      // Insert test media
      const testMedia = [
        { hashVisual: 'visual-1', hashMd5: 'md5-1' },
        { hashVisual: 'visual-2', hashMd5: 'md5-2' },
        { hashVisual: 'visual-3', hashMd5: 'md5-3' }
      ];
      
      await insertTestMedia(db, testMedia);
      
      // Check count after insertion
      count = await mediaModel.getMediaCount();
      assertEqual(count, 3, 'Count should be 3 after inserting 3 media');
      
      await cleanup();
    }
  },
  
  {
    name: 'Get media by page',
    fn: async () => {
      const { db, cleanup: cleanupFn } = createTestDatabase('media-pagination');
      testDb = db;
      cleanup = cleanupFn;
      
      await createTestTables(db);
      const mediaModel = createMediaModel(db);
      
      // Insert test media with different timestamps
      const testMedia = [];
      for (let i = 1; i <= 25; i++) {
        testMedia.push({
          hashVisual: `visual-${i}`,
          hashMd5: `md5-${i}`,
          timestamp: Date.now() - (i * 1000) // Older timestamps for higher i
        });
      }
      
      await insertTestMedia(db, testMedia);
      
      // Test first page
      const page1 = await mediaModel.getMediaByPage(1, 10);
      assertLength(page1, 10, 'Page 1 should have 10 items');
      
      // Test second page
      const page2 = await mediaModel.getMediaByPage(2, 10);
      assertLength(page2, 10, 'Page 2 should have 10 items');
      
      // Test third page (should have remaining 5 items)
      const page3 = await mediaModel.getMediaByPage(3, 10);
      assertLength(page3, 5, 'Page 3 should have 5 items');
      
      // Test empty page
      const page4 = await mediaModel.getMediaByPage(4, 10);
      assertLength(page4, 0, 'Page 4 should be empty');
      
      // Verify ordering (most recent first)
      assert(page1[0].timestamp >= page1[9].timestamp, 'Results should be ordered by timestamp DESC');

      await cleanup();
    }
  },
  {
    name: 'countMediaBySender returns total media for a sender',
    fn: async () => {
      const { db, cleanup: cleanupFn } = createTestDatabase('media-count-by-sender');
      testDb = db;
      cleanup = cleanupFn;

      await createTestTables(db);

      await insertTestMedia(db, [
        { senderId: 'user1@c.us' },
        { senderId: 'user1@c.us' },
        { senderId: 'user2@c.us' }
      ]);

      const totalUser1 = await countMediaBySenderWithDb(db, 'user1@c.us');
      assertEqual(totalUser1, 2, 'Should count media rows belonging to the sender');

      const totalUser2 = await countMediaBySenderWithDb(db, 'user2@c.us');
      assertEqual(totalUser2, 1, 'Should count media rows for a different sender');

      const totalUnknown = await countMediaBySenderWithDb(db, 'unknown@c.us');
      assertEqual(totalUnknown, 0, 'Should return 0 when sender has no media');

      await cleanup();
    }
  }
];

async function main() {
  try {
    await runTestSuite('Media Model Tests', tests);
  } catch (error) {
    console.error('Test suite failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { tests };