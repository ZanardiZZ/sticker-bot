#!/usr/bin/env node
/**
 * Manual integration test for sticker pack commands
 * This creates a test database, adds some media, and tests the pack commands
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Mock client
class MockClient {
  constructor() {
    this.messages = [];
    this.stickers = [];
  }

  async sendText(chatId, text) {
    this.messages.push({ chatId, text });
    console.log(`\n📤 Bot sent: ${text.substring(0, 100)}...`);
  }

  async reply(chatId, text, messageId) {
    this.messages.push({ chatId, text, messageId });
    console.log(`\n📤 Bot replied: ${text.substring(0, 100)}...`);
  }

  async sendImageAsSticker(chatId, filePath, options) {
    this.stickers.push({ chatId, filePath, options });
    console.log(`\n🎨 Bot sent sticker: ${filePath}`);
  }

  async sendRawWebpAsSticker(chatId, dataUrl, options) {
    this.stickers.push({ chatId, dataUrl: dataUrl.substring(0, 50) + '...', options });
    console.log(`\n🎨 Bot sent webp sticker`);
  }

  reset() {
    this.messages = [];
    this.stickers = [];
  }
}

async function setupTestDatabase() {
  const dbPath = path.join(__dirname, '../temp/test-packs-integration.db');
  const tempDir = path.dirname(dbPath);
  
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // Remove old DB if exists
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  
  const db = new sqlite3.Database(dbPath);
  
  // Create tables
  await new Promise((resolve) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE media (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id TEXT NOT NULL,
          group_id TEXT,
          sender_id TEXT,
          file_path TEXT NOT NULL,
          mimetype TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          description TEXT,
          hash_visual TEXT,
          hash_md5 TEXT,
          nsfw INTEGER DEFAULT 0,
          count_random INTEGER DEFAULT 0
        )
      `);

      db.run(`
        CREATE TABLE sticker_packs (
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
        CREATE TABLE pack_stickers (
          pack_id INTEGER NOT NULL,
          media_id INTEGER NOT NULL,
          position INTEGER NOT NULL,
          added_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
          PRIMARY KEY(pack_id, media_id),
          FOREIGN KEY(pack_id) REFERENCES sticker_packs(id) ON DELETE CASCADE,
          FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE
        )
      `, resolve);
    });
  });
  
  // Insert test media
  const mediaIds = [];
  for (let i = 1; i <= 5; i++) {
    const result = await new Promise((resolve) => {
      db.run(
        `INSERT INTO media (chat_id, file_path, mimetype, timestamp, description) VALUES (?, ?, ?, ?, ?)`,
        ['test-chat', `/tmp/test${i}.webp`, 'image/webp', Date.now(), `Test sticker ${i}`],
        function() { resolve(this.lastID); }
      );
    });
    mediaIds.push(result);
  }
  
  console.log(`✅ Test database setup with ${mediaIds.length} media items`);
  return { db, dbPath, mediaIds };
}

// Mock database handler
function createDbHandler(db) {
  return {
    run: (query, params = []) => {
      return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    },
    get: (query, params = []) => {
      return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    },
    all: (query, params = []) => {
      return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }
  };
}

async function testPackCommands() {
  console.log('\n🧪 Testing Sticker Pack Commands Integration\n');
  console.log('=' .repeat(60));
  
  const { db, dbPath, mediaIds } = await setupTestDatabase();
  const client = new MockClient();
  
  // Mock database connection for pack model
  const dbHandler = createDbHandler(db);
  const mockDbModule = {
    db,
    dbHandler
  };
  
  // Override require cache to use our test database
  const packsModelPath = require.resolve('../../src/database/models/packs');
  delete require.cache[packsModelPath];
  require.cache[require.resolve('../../src/database/connection')] = {
    exports: mockDbModule
  };
  
  const packsModel = require('../../src/database/models/packs');
  
  try {
    // Test 1: Create a pack directly
    console.log('\n📦 Test 1: Creating a pack...');
    const packId = await packsModel.createPack('Animals', 'Cute animal stickers', 'user123');
    console.log(`✅ Pack created with ID: ${packId}`);
    
    // Test 2: Add stickers to pack
    console.log('\n📦 Test 2: Adding stickers to pack...');
    for (let i = 0; i < 3; i++) {
      await packsModel.addStickerToPack(packId, mediaIds[i]);
      console.log(`✅ Added sticker ${mediaIds[i]} to pack`);
    }
    
    // Test 3: Verify pack count
    const pack = await packsModel.getPackById(packId);
    console.log(`✅ Pack now has ${pack.sticker_count} stickers`);
    
    // Test 4: List packs
    console.log('\n📦 Test 4: Listing packs...');
    const packs = await packsModel.listPacks();
    console.log(`✅ Found ${packs.length} pack(s):`);
    for (const p of packs) {
      console.log(`   - ${p.name}: ${p.sticker_count}/${p.max_stickers} stickers`);
    }
    
    // Test 5: Get pack stickers
    console.log('\n📦 Test 5: Getting pack stickers...');
    const stickers = await packsModel.getPackStickers(packId);
    console.log(`✅ Retrieved ${stickers.length} stickers from pack`);
    for (const sticker of stickers) {
      console.log(`   - ID ${sticker.id}: ${sticker.description}`);
    }
    
    // Test 6: Test pack full scenario
    console.log('\n📦 Test 6: Testing full pack scenario...');
    await dbHandler.run('UPDATE sticker_packs SET max_stickers = 3 WHERE id = ?', [packId]);
    
    try {
      await packsModel.addStickerToPack(packId, mediaIds[3]);
      console.log('❌ Should have thrown PACK_FULL error');
    } catch (err) {
      if (err.message === 'PACK_FULL') {
        console.log('✅ Correctly rejected sticker when pack is full');
      } else {
        throw err;
      }
    }
    
    // Test 7: Test pack name suggestion
    console.log('\n📦 Test 7: Testing pack name suggestion...');
    const suggestion = await packsModel.suggestPackName('Animals');
    console.log(`✅ Suggested pack name: ${suggestion}`);
    
    // Test 8: Search packs
    console.log('\n📦 Test 8: Testing pack search...');
    await packsModel.createPack('Funny Memes', 'Hilarious memes');
    await packsModel.createPack('Anime Characters', 'Anime stickers');
    
    const searchResults = await packsModel.listPacks('ani');
    console.log(`✅ Search for "ani" found ${searchResults.length} pack(s):`);
    for (const p of searchResults) {
      console.log(`   - ${p.name}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ All integration tests passed!');
    console.log('=' .repeat(60) + '\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  } finally {
    db.close();
    // Cleanup
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  }
}

if (require.main === module) {
  testPackCommands().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { testPackCommands };
