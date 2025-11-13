#!/usr/bin/env node
/**
 * Unit tests for sticker pack commands
 */

const fs = require('fs');
const path = require('path');
const { createTestDatabase, createTestTables, assert, assertEqual, assertLength } = require('../helpers/testUtils');

// Mock WhatsApp client for testing
class MockWhatsAppClient {
  constructor() {
    this.sentMessages = [];
    this.sentStickers = [];
  }

  async sendText(chatId, text) {
    this.sentMessages.push({ chatId, text, type: 'text' });
  }

  async reply(chatId, message, replyId) {
    this.sentMessages.push({ chatId, message, replyId, type: 'reply' });
  }

  async sendImageAsSticker(chatId, filePath, options) {
    this.sentStickers.push({ chatId, filePath, options, type: 'sticker' });
  }

  async sendRawWebpAsSticker(chatId, dataUrl, options) {
    this.sentStickers.push({ chatId, dataUrl, options, type: 'sticker' });
  }

  reset() {
    this.sentMessages = [];
    this.sentStickers = [];
  }
}

// Helper to insert test media
async function insertTestMedia(db, mediaData) {
  const {
    file_path = '/tmp/test.webp',
    mimetype = 'image/webp',
    description = 'Test media'
  } = mediaData || {};
  
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO media (chat_id, group_id, sender_id, file_path, mimetype, timestamp, description, hash_visual, hash_md5, nsfw)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['test-chat', null, null, file_path, mimetype, Date.now(), description, 'test-hash', 'test-md5', 0],
      function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      }
    );
  });
}

// Create pack tables for tests
async function createPackTables(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS sticker_packs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          created_by TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
          sticker_count INTEGER DEFAULT 0,
          max_stickers INTEGER DEFAULT 30
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS pack_stickers (
          pack_id INTEGER NOT NULL,
          media_id INTEGER NOT NULL,
          position INTEGER NOT NULL,
          added_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
          PRIMARY KEY(pack_id, media_id),
          FOREIGN KEY(pack_id) REFERENCES sticker_packs(id) ON DELETE CASCADE,
          FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

const tests = [
  {
    name: 'createPack creates a new pack',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('pack-create-test');
      await createTestTables(db);
      await createPackTables(db);
      
      const packsModel = require('../../database/models/packs');
      
      // Create a pack
      const packId = await packsModel.createPack('Test Pack', 'A test pack', 'user123');
      
      // Verify pack was created
      const pack = await packsModel.getPackById(packId);
      assert(pack !== null, 'Pack should be created');
      assertEqual(pack.name, 'Test Pack', 'Pack name should match');
      assertEqual(pack.description, 'A test pack', 'Pack description should match');
      assertEqual(pack.sticker_count, 0, 'Initial sticker count should be 0');
      assertEqual(pack.max_stickers, 30, 'Max stickers should be 30');
      
      cleanup();
      console.log('✓ createPack creates a new pack');
    }
  },
  
  {
    name: 'addStickerToPack adds sticker and updates count',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('pack-add-sticker-test');
      await createTestTables(db);
      await createPackTables(db);
      
      const packsModel = require('../../database/models/packs');
      
      // Create a pack and media
      const packId = await packsModel.createPack('Test Pack');
      const media = await insertTestMedia(db, { description: 'Test sticker' });
      
      // Add sticker to pack
      await packsModel.addStickerToPack(packId, media.id);
      
      // Verify pack count updated
      const pack = await packsModel.getPackById(packId);
      assertEqual(pack.sticker_count, 1, 'Sticker count should be 1');
      
      // Verify sticker is in pack
      const stickers = await packsModel.getPackStickers(packId);
      assertLength(stickers, 1, 'Should have 1 sticker in pack');
      assertEqual(stickers[0].id, media.id, 'Sticker ID should match');
      
      cleanup();
      console.log('✓ addStickerToPack adds sticker and updates count');
    }
  },
  
  {
    name: 'addStickerToPack prevents adding to full pack',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('pack-full-test');
      await createTestTables(db);
      await createPackTables(db);
      
      const packsModel = require('../../database/models/packs');
      
      // Create a pack with max_stickers = 2 for testing
      const packId = await packsModel.createPack('Small Pack');
      
      // Manually set max_stickers to 2
      await new Promise((resolve) => {
        db.run('UPDATE sticker_packs SET max_stickers = 2 WHERE id = ?', [packId], resolve);
      });
      
      // Add 2 stickers
      const media1 = await insertTestMedia(db, { file_path: '/tmp/test1.webp' });
      const media2 = await insertTestMedia(db, { file_path: '/tmp/test2.webp' });
      await packsModel.addStickerToPack(packId, media1.id);
      await packsModel.addStickerToPack(packId, media2.id);
      
      // Try to add a third sticker - should fail
      const media3 = await insertTestMedia(db, { file_path: '/tmp/test3.webp' });
      let error = null;
      try {
        await packsModel.addStickerToPack(packId, media3.id);
      } catch (e) {
        error = e;
      }
      
      assert(error !== null, 'Should throw error when pack is full');
      assertEqual(error.message, 'PACK_FULL', 'Error message should be PACK_FULL');
      
      cleanup();
      console.log('✓ addStickerToPack prevents adding to full pack');
    }
  },
  
  {
    name: 'suggestPackName suggests numbered pack name',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('pack-suggest-test');
      await createTestTables(db);
      await createPackTables(db);
      
      const packsModel = require('../../database/models/packs');
      
      // Create packs with numbered names
      await packsModel.createPack('MyPack');
      await packsModel.createPack('MyPack (2)');
      await packsModel.createPack('MyPack (3)');
      
      // Get suggestion
      const suggestion = await packsModel.suggestPackName('MyPack');
      assertEqual(suggestion, 'MyPack (4)', 'Should suggest MyPack (4)');
      
      cleanup();
      console.log('✓ suggestPackName suggests numbered pack name');
    }
  },
  
  {
    name: 'listPacks returns all packs',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('pack-list-test');
      await createTestTables(db);
      await createPackTables(db);
      
      const packsModel = require('../../database/models/packs');
      
      // Create multiple packs
      await packsModel.createPack('Pack A', 'Description A');
      await packsModel.createPack('Pack B', 'Description B');
      await packsModel.createPack('Pack C', 'Description C');
      
      // List all packs
      const packs = await packsModel.listPacks();
      assertLength(packs, 3, 'Should return 3 packs');
      
      cleanup();
      console.log('✓ listPacks returns all packs');
    }
  },
  
  {
    name: 'listPacks filters by search term',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('pack-search-test');
      await createTestTables(db);
      await createPackTables(db);
      
      const packsModel = require('../../database/models/packs');
      
      // Create packs
      await packsModel.createPack('Animals Pack', 'Cute animals');
      await packsModel.createPack('Food Pack', 'Delicious food');
      await packsModel.createPack('Anime Pack', 'Anime characters');
      
      // Search for "ani"
      const results = await packsModel.listPacks('ani');
      assertLength(results, 2, 'Should return 2 packs matching "ani"');
      
      cleanup();
      console.log('✓ listPacks filters by search term');
    }
  }
];

// Run tests
async function runTests() {
  console.log('Running sticker pack command tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      await test.fn();
      passed++;
    } catch (error) {
      console.error(`✗ ${test.name}`);
      console.error(error);
      failed++;
    }
  }
  
  console.log(`\nTests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  runTests();
}

module.exports = { tests };
