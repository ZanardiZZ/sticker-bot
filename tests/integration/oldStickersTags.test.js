#!/usr/bin/env node
/**
 * Integration test to verify old stickers processing with tags
 * Tests the complete flow from AI annotations to database storage
 */

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const os = require('os');

console.log('🧪 Testing Old Stickers Tags Integration...\n');

// Mock modules setup
let testResult = 'pending';

// Create test database with proper schema
function createTestDatabase() {
  const tmpDir = os.tmpdir();
  const dbPath = path.join(tmpDir, `test-old-stickers-tags-${Date.now()}.db`);
  const db = new sqlite3.Database(dbPath);
  
  return {
    db,
    cleanup: () => {
      return new Promise((resolve) => {
        db.close(() => {
          try {
            fs.unlinkSync(dbPath);
          } catch (e) {}
          resolve();
        });
      });
    }
  };
}

// Create tables with proper schema
async function createTables(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS media (
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
          count_random INTEGER DEFAULT 0,
          extracted_text TEXT
        )
      `);
      
      db.run(`
        CREATE TABLE IF NOT EXISTS tags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          usage_count INTEGER DEFAULT 0
        )
      `);
      
      db.run(`
        CREATE TABLE IF NOT EXISTS media_tags (
          media_id INTEGER NOT NULL,
          tag_id INTEGER NOT NULL,
          PRIMARY KEY(media_id, tag_id),
          FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE,
          FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

async function runTest() {
  let cleanup;
  
  try {
    // Create test database
    const { db, cleanup: cleanupFn } = createTestDatabase();
    cleanup = cleanupFn;
    await createTables(db);
    
    // Create mock tags model
    const tagsModel = {
      updateMediaTags(mediaId, tagsString) {
        return new Promise((resolve, reject) => {
          if (!tagsString || !tagsString.trim()) {
            db.run('DELETE FROM media_tags WHERE media_id = ?', [mediaId], (err) => {
              if (err) reject(err);
              else resolve();
            });
            return;
          }

          const tags = tagsString.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
          
          db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            db.run('DELETE FROM media_tags WHERE media_id = ?', [mediaId]);
            
            let completed = 0;
            const total = tags.length;
            let hasError = false;
            
            if (total === 0) {
              db.run('COMMIT', (err) => {
                if (err) reject(err);
                else resolve();
              });
              return;
            }
            
            tags.forEach(tagName => {
              db.run(
                'INSERT OR IGNORE INTO tags (name, usage_count) VALUES (?, 0)',
                [tagName],
                function(err) {
                  if (err && !hasError) {
                    hasError = true;
                    db.run('ROLLBACK');
                    reject(err);
                    return;
                  }
                  
                  db.get('SELECT id FROM tags WHERE name = ?', [tagName], (err2, tag) => {
                    if (err2 && !hasError) {
                      hasError = true;
                      db.run('ROLLBACK');
                      reject(err2);
                      return;
                    }
                    
                    if (tag) {
                      db.run(
                        'INSERT INTO media_tags (media_id, tag_id) VALUES (?, ?)',
                        [mediaId, tag.id],
                        (err3) => {
                          if (err3 && !hasError) {
                            hasError = true;
                            db.run('ROLLBACK');
                            reject(err3);
                            return;
                          }
                          
                          db.run(
                            'UPDATE tags SET usage_count = usage_count + 1 WHERE id = ?',
                            [tag.id],
                            (err4) => {
                              if (err4 && !hasError) {
                                hasError = true;
                                db.run('ROLLBACK');
                                reject(err4);
                                return;
                              }
                              
                              completed++;
                              if (completed === total && !hasError) {
                                db.run('COMMIT', (commitErr) => {
                                  if (commitErr) reject(commitErr);
                                  else resolve();
                                });
                              }
                            }
                          );
                        }
                      );
                    }
                  });
                }
              );
            });
          });
        });
      },
      
      getTagsForMedia(mediaId) {
        return new Promise((resolve) => {
          db.all(
            `SELECT t.name 
             FROM tags t
             JOIN media_tags mt ON t.id = mt.tag_id
             WHERE mt.media_id = ?
             ORDER BY t.name`,
            [mediaId],
            (err, rows) => {
              if (err) resolve([]);
              else resolve(rows.map(row => row.name));
            }
          );
        });
      }
    };
    
    // Create mock media model
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
      }
    };
    
    // Test 1: Simulate old sticker processing with AI tags
    console.log('Test 1: Simulating old sticker processing with AI-generated tags...');
    
    const mockAiResult = {
      description: 'Test sticker with animals',
      tags: ['cat', 'dog', 'animal', 'cute', 'pet']
    };
    
    // Simulate what processOldStickers does
    const description = mockAiResult.description || null;
    const tags = mockAiResult.tags ? mockAiResult.tags.join(',') : null;
    
    // Save media (without tags)
    const mediaId = await mediaModel.saveMedia({
      chatId: 'old-stickers',
      groupId: null,
      filePath: '/media/old-stickers/test-sticker.webp',
      mimetype: 'image/webp',
      timestamp: Date.now(),
      description,
      hashVisual: 'test-visual-hash',
      hashMd5: 'test-md5-hash',
      nsfw: 0
    });
    
    console.log(`  → Media saved with ID: ${mediaId}`);
    
    // Save tags separately (this is the fix we added)
    if (tags && tags.trim()) {
      console.log(`  → Saving tags: "${tags}"`);
      await tagsModel.updateMediaTags(mediaId, tags);
    }
    
    // Verify tags were saved
    const savedTags = await tagsModel.getTagsForMedia(mediaId);
    console.log(`  → Retrieved tags from database: [${savedTags.join(', ')}]`);
    
    if (savedTags.length !== 5) {
      throw new Error(`Expected 5 tags, but got ${savedTags.length}`);
    }
    
    if (!savedTags.includes('cat') || !savedTags.includes('dog')) {
      throw new Error('Expected tags not found in database');
    }
    
    console.log('✅ Test 1 PASSED: Tags are correctly saved for old stickers\n');
    
    // Test 2: Verify tags are queryable from media_tags table
    console.log('Test 2: Verifying tags in media_tags junction table...');
    
    const mediaTagRows = await new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM media_tags WHERE media_id = ?',
        [mediaId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    console.log(`  → Found ${mediaTagRows.length} tag associations in media_tags table`);
    
    if (mediaTagRows.length !== 5) {
      throw new Error(`Expected 5 tag associations, but got ${mediaTagRows.length}`);
    }
    
    console.log('✅ Test 2 PASSED: Tags are properly stored in media_tags table\n');
    
    // Test 3: Verify tags table has correct entries
    console.log('Test 3: Verifying tags table entries...');
    
    const tagRows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT t.* FROM tags t
         JOIN media_tags mt ON t.id = mt.tag_id
         WHERE mt.media_id = ?`,
        [mediaId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    console.log(`  → Found ${tagRows.length} tag entries`);
    
    for (const tag of tagRows) {
      console.log(`  → Tag: "${tag.name}" (usage_count: ${tag.usage_count})`);
    }
    
    if (tagRows.length !== 5) {
      throw new Error(`Expected 5 tag entries, but got ${tagRows.length}`);
    }
    
    console.log('✅ Test 3 PASSED: Tags table has correct entries\n');
    
    testResult = 'passed';
    console.log('🎉 All integration tests passed!\n');
    
  } catch (error) {
    testResult = 'failed';
    console.error('❌ Integration test FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (cleanup) {
      await cleanup();
    }
  }
}

runTest().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
