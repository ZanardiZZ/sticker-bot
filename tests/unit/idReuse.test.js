#!/usr/bin/env node
/**
 * Unit tests for ID reuse functionality
 */

const path = require('path');
const { createTestDatabase, createTestTables, assert, assertEqual, runTestSuite } = require('../helpers/testUtils');

// Mock the ID reuse functions
function createIdReuseModel(db) {
  const DatabaseHandler = require('../../services/databaseHandler');
  const dbHandler = new DatabaseHandler(db);

  const idReuseModel = {
    async getNextAvailableMediaId() {
      // First check if ID 1 is available (most common case for first gap)
      const firstIdQuery = `SELECT COUNT(*) as count FROM media WHERE id = 1`;
      const firstResult = await dbHandler.get(firstIdQuery);
      
      if (firstResult.count === 0) {
        return 1;
      }
      
      // Find the first gap in the sequence starting from 1
      // We'll check for the smallest missing positive integer
      const gapQuery = `
        SELECT MIN(t1.id + 1) as gap_start
        FROM media t1
        LEFT JOIN media t2 ON t1.id + 1 = t2.id
        WHERE t2.id IS NULL
        AND t1.id + 1 <= (SELECT MAX(id) FROM media)
      `;
      
      const gapResult = await dbHandler.get(gapQuery);
      
      if (gapResult && gapResult.gap_start) {
        return gapResult.gap_start;
      }
      
      // No gaps found - find next sequential ID after the maximum
      const nextIdQuery = `SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM media`;
      const nextResult = await dbHandler.get(nextIdQuery);
      
      return nextResult ? nextResult.next_id : 1;
    },

    async saveMediaWithIdReuse(mediaData) {
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

      // Get the next available ID (reusing deleted IDs if possible)
      const mediaId = await this.getNextAvailableMediaId();
      
      const sql = `
        INSERT INTO media (id, chat_id, group_id, sender_id, file_path, mimetype, timestamp, description, hash_visual, hash_md5, nsfw, count_random)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `;
      
      await dbHandler.run(sql, [
        mediaId,
        chatId,
        groupId,
        senderId,
        filePath,
        mimetype,
        timestamp,
        description,
        hashVisual,
        hashMd5,
        nsfw
      ]);
      
      return mediaId;
    },

    async deleteMediaById(mediaId) {
      const result = await dbHandler.run(`DELETE FROM media WHERE id = ?`, [mediaId]);
      // dbHandler.run returns an object with 'changes' property (sqlite3)
      return result.changes;
    },

    async getMediaIds() {
      return new Promise((resolve, reject) => {
        db.all(`SELECT id FROM media ORDER BY id`, (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => row.id));
        });
      });
    }
  };

  return idReuseModel;
}

const tests = [
  {
    name: 'Get next available ID - empty database',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('id-reuse-empty');
      await createTestTables(db);
      
      const model = createIdReuseModel(db);
      const nextId = await model.getNextAvailableMediaId();
      assertEqual(nextId, 1);
      
      await cleanup();
    }
  },

  {
    name: 'Get next available ID - sequential IDs',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('id-reuse-sequential');
      await createTestTables(db);
      
      const model = createIdReuseModel(db);
      
      // Insert some media with sequential IDs
      await model.saveMediaWithIdReuse({
        chatId: 'chat1',
        filePath: '/path/to/media1.webp',
        mimetype: 'image/webp',
        timestamp: Date.now(),
        hashVisual: 'hash1',
        hashMd5: 'md5hash1'
      });
      
      await model.saveMediaWithIdReuse({
        chatId: 'chat2', 
        filePath: '/path/to/media2.webp',
        mimetype: 'image/webp',
        timestamp: Date.now(),
        hashVisual: 'hash2',
        hashMd5: 'md5hash2'
      });

      const nextId = await model.getNextAvailableMediaId();
      assertEqual(nextId, 3);
      
      await cleanup();
    }
  },

  {
    name: 'Reuse ID after deletion - gap at beginning',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('id-reuse-gap-beginning');
      await createTestTables(db);
      
      const model = createIdReuseModel(db);
      
      // Insert three media items
      const id1 = await model.saveMediaWithIdReuse({
        chatId: 'chat1',
        filePath: '/path/to/media1.webp',
        mimetype: 'image/webp',
        timestamp: Date.now(),
        hashVisual: 'hash1',
        hashMd5: 'md5hash1'
      });
      
      const id2 = await model.saveMediaWithIdReuse({
        chatId: 'chat2',
        filePath: '/path/to/media2.webp', 
        mimetype: 'image/webp',
        timestamp: Date.now(),
        hashVisual: 'hash2',
        hashMd5: 'md5hash2'
      });

      const id3 = await model.saveMediaWithIdReuse({
        chatId: 'chat3',
        filePath: '/path/to/media3.webp',
        mimetype: 'image/webp', 
        timestamp: Date.now(),
        hashVisual: 'hash3',
        hashMd5: 'md5hash3'
      });

      // Delete the first item (creates gap at ID 1)
      await model.deleteMediaById(id1);

      // Next available ID should be the deleted ID
      const nextId = await model.getNextAvailableMediaId();
      assertEqual(nextId, id1);
      
      // Add new media - should use the reused ID
      const newId = await model.saveMediaWithIdReuse({
        chatId: 'chat4',
        filePath: '/path/to/media4.webp',
        mimetype: 'image/webp',
        timestamp: Date.now(),
        hashVisual: 'hash4', 
        hashMd5: 'md5hash4'
      });
      
      assertEqual(newId, id1);
      
      await cleanup();
    }
  },

  {
    name: 'Reuse ID after deletion - gap in middle',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('id-reuse-gap-middle');
      await createTestTables(db);
      
      const model = createIdReuseModel(db);
      
      // Insert three media items
      await model.saveMediaWithIdReuse({
        chatId: 'chat1',
        filePath: '/path/to/media1.webp',
        mimetype: 'image/webp',
        timestamp: Date.now(),
        hashVisual: 'hash1',
        hashMd5: 'md5hash1'
      });
      
      const id2 = await model.saveMediaWithIdReuse({
        chatId: 'chat2',
        filePath: '/path/to/media2.webp',
        mimetype: 'image/webp', 
        timestamp: Date.now(),
        hashVisual: 'hash2',
        hashMd5: 'md5hash2'
      });

      await model.saveMediaWithIdReuse({
        chatId: 'chat3',
        filePath: '/path/to/media3.webp',
        mimetype: 'image/webp',
        timestamp: Date.now(), 
        hashVisual: 'hash3',
        hashMd5: 'md5hash3'
      });

      // Delete the middle item (creates gap at ID 2)
      await model.deleteMediaById(id2);

      // Next available ID should be the deleted ID
      const nextId = await model.getNextAvailableMediaId();
      assertEqual(nextId, id2);
      
      await cleanup();
    }
  },

  {
    name: 'Multiple deletions create multiple gaps - use lowest',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('id-reuse-multiple-gaps');
      await createTestTables(db);
      
      const model = createIdReuseModel(db);
      
      // Insert five media items
      const id1 = await model.saveMediaWithIdReuse({
        chatId: 'chat1',
        filePath: '/path/to/media1.webp',
        mimetype: 'image/webp',
        timestamp: Date.now(),
        hashVisual: 'hash1',
        hashMd5: 'md5hash1'
      });
      
      await model.saveMediaWithIdReuse({
        chatId: 'chat2', 
        filePath: '/path/to/media2.webp',
        mimetype: 'image/webp',
        timestamp: Date.now(),
        hashVisual: 'hash2',
        hashMd5: 'md5hash2'
      });

      const id3 = await model.saveMediaWithIdReuse({
        chatId: 'chat3',
        filePath: '/path/to/media3.webp',
        mimetype: 'image/webp',
        timestamp: Date.now(),
        hashVisual: 'hash3',
        hashMd5: 'md5hash3'
      });

      await model.saveMediaWithIdReuse({
        chatId: 'chat4',
        filePath: '/path/to/media4.webp',
        mimetype: 'image/webp',
        timestamp: Date.now(),
        hashVisual: 'hash4',
        hashMd5: 'md5hash4'
      });

      await model.saveMediaWithIdReuse({
        chatId: 'chat5',
        filePath: '/path/to/media5.webp',
        mimetype: 'image/webp',
        timestamp: Date.now(),
        hashVisual: 'hash5',
        hashMd5: 'md5hash5'
      });

      // Delete items at positions 1 and 3 (creates gaps at IDs 1 and 3)
      await model.deleteMediaById(id1);
      await model.deleteMediaById(id3);

      // Next available ID should be the lowest gap (ID 1)
      const nextId = await model.getNextAvailableMediaId();
      assertEqual(nextId, id1);
      
      await cleanup();
    }
  },

  {
    name: 'Fill gaps completely - revert to sequential',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('id-reuse-fill-gaps');
      await createTestTables(db);
      
      const model = createIdReuseModel(db);
      
      // Insert and delete to create gaps, then fill them
      const id1 = await model.saveMediaWithIdReuse({
        chatId: 'chat1',
        filePath: '/path/to/media1.webp',
        mimetype: 'image/webp',
        timestamp: Date.now(),
        hashVisual: 'hash1',
        hashMd5: 'md5hash1'
      });
      
      await model.saveMediaWithIdReuse({
        chatId: 'chat2',
        filePath: '/path/to/media2.webp',
        mimetype: 'image/webp',
        timestamp: Date.now(),
        hashVisual: 'hash2',
        hashMd5: 'md5hash2'
      });

      // Delete first item to create gap
      await model.deleteMediaById(id1);

      // Fill the gap
      const reuseId = await model.saveMediaWithIdReuse({
        chatId: 'chat3',
        filePath: '/path/to/media3.webp',
        mimetype: 'image/webp',
        timestamp: Date.now(),
        hashVisual: 'hash3',
        hashMd5: 'md5hash3'
      });
      
      assertEqual(reuseId, id1);

      // Now should go to next sequential ID
      const nextId = await model.getNextAvailableMediaId();
      assertEqual(nextId, 3);
      
      await cleanup();
    }
  }
];

module.exports = { tests };