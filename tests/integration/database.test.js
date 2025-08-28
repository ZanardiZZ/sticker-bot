#!/usr/bin/env node
/**
 * Integration tests for database modules working together
 */

const path = require('path');
const { createTestDatabase, createTestTables, assert, assertEqual, assertLength, runTestSuite, sleep } = require('../helpers/testUtils');

// We'll test the actual database module integration
// For this we need to temporarily mock the database path

const tests = [
  {
    name: 'Database initialization and table creation',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('integration-init');
      
      // Test that we can create all required tables
      await createTestTables(db);
      
      // Verify tables exist by querying their structure
      const tables = await new Promise((resolve, reject) => {
        db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(r => r.name));
        });
      });
      
      const expectedTables = ['media', 'contacts', 'tags', 'processed_files', 'duplicates'];
      expectedTables.forEach(tableName => {
        assert(tables.includes(tableName), `Table ${tableName} should exist`);
      });
      
      await cleanup();
    }
  },

  {
    name: 'Cross-model data consistency',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('integration-consistency');
      await createTestTables(db);
      
      // Insert media
      const mediaResult = await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO media (chat_id, sender_id, file_path, mimetype, timestamp) VALUES (?, ?, ?, ?, ?)',
          ['test-chat', 'user@c.us', 'test.webp', 'image/webp', Date.now()],
          function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID });
          }
        );
      });
      
      // Insert corresponding contact
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO contacts (sender_id, display_name) VALUES (?, ?)',
          ['user@c.us', 'Test User'],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      // Insert tag for the media
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO tags (media_id, tag) VALUES (?, ?)',
          [mediaResult.lastID, 'test-tag'],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      // Test JOIN query to verify relationships
      const joinResult = await new Promise((resolve, reject) => {
        db.get(`
          SELECT m.id, m.file_path, c.display_name, t.tag
          FROM media m
          LEFT JOIN contacts c ON m.sender_id = c.sender_id
          LEFT JOIN tags t ON m.id = t.media_id
          WHERE m.id = ?
        `, [mediaResult.lastID], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      assert(joinResult !== null, 'JOIN query should return result');
      assertEqual(joinResult.file_path, 'test.webp', 'File path should match');
      assertEqual(joinResult.display_name, 'Test User', 'Display name should match');
      assertEqual(joinResult.tag, 'test-tag', 'Tag should match');
      
      await cleanup();
    }
  },

  {
    name: 'Foreign key relationships and cascading',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('integration-fk');
      await createTestTables(db);
      
      // Insert media
      const mediaResult = await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO media (chat_id, sender_id, file_path, mimetype, timestamp) VALUES (?, ?, ?, ?, ?)',
          ['test-chat', 'user@c.us', 'test.webp', 'image/webp', Date.now()],
          function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID });
          }
        );
      });
      
      // Insert tags for the media
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO tags (media_id, tag) VALUES (?, ?), (?, ?)',
          [mediaResult.lastID, 'tag1', mediaResult.lastID, 'tag2'],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      // Verify tags exist
      const tagsBefore = await new Promise((resolve, reject) => {
        db.all('SELECT tag FROM tags WHERE media_id = ?', [mediaResult.lastID], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      assertLength(tagsBefore, 2, 'Should have 2 tags initially');
      
      // Delete media (in a real app, this would cascade delete tags)
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM media WHERE id = ?', [mediaResult.lastID], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Verify media is deleted
      const mediaAfter = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM media WHERE id = ?', [mediaResult.lastID], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      assert(mediaAfter === undefined, 'Media should be deleted');
      
      // Tags should still exist (no CASCADE DELETE in our schema)
      // In a production system, you might want to add cleanup logic
      const tagsAfter = await new Promise((resolve, reject) => {
        db.all('SELECT tag FROM tags WHERE media_id = ?', [mediaResult.lastID], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      assertLength(tagsAfter, 2, 'Tags should still exist (no CASCADE DELETE)');
      
      await cleanup();
    }
  },

  {
    name: 'Concurrent operations handling',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('integration-concurrent');
      await createTestTables(db);
      
      // Simulate concurrent inserts
      const concurrentPromises = [];
      
      for (let i = 0; i < 10; i++) {
        const promise = new Promise((resolve, reject) => {
          db.run(
            'INSERT INTO media (chat_id, sender_id, file_path, mimetype, timestamp) VALUES (?, ?, ?, ?, ?)',
            [`chat-${i}`, `user${i}@c.us`, `test${i}.webp`, 'image/webp', Date.now()],
            function(err) {
              if (err) reject(err);
              else resolve({ lastID: this.lastID, i });
            }
          );
        });
        concurrentPromises.push(promise);
      }
      
      // Wait for all concurrent operations to complete
      const results = await Promise.all(concurrentPromises);
      
      assertLength(results, 10, 'All concurrent operations should complete');
      
      // Verify all records were inserted
      const count = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM media', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      assertEqual(count, 10, 'Should have 10 media records');
      
      // Verify each record has unique lastID
      const lastIDs = results.map(r => r.lastID);
      const uniqueIDs = [...new Set(lastIDs)];
      assertLength(uniqueIDs, 10, 'All lastIDs should be unique');
      
      await cleanup();
    }
  },

  {
    name: 'Transaction rollback across models',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('integration-transaction');
      await createTestTables(db);
      
      // Start transaction
      await new Promise((resolve, reject) => {
        db.run('BEGIN TRANSACTION', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      let rollbackOccurred = false;
      
      try {
        // Insert media
        const mediaResult = await new Promise((resolve, reject) => {
          db.run(
            'INSERT INTO media (chat_id, sender_id, file_path, mimetype, timestamp) VALUES (?, ?, ?, ?, ?)',
            ['test-chat', 'user@c.us', 'test.webp', 'image/webp', Date.now()],
            function(err) {
              if (err) reject(err);
              else resolve({ lastID: this.lastID });
            }
          );
        });
        
        // Insert contact
        await new Promise((resolve, reject) => {
          db.run(
            'INSERT INTO contacts (sender_id, display_name) VALUES (?, ?)',
            ['user@c.us', 'Test User'],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
        
        // Deliberately cause an error (duplicate contact)
        await new Promise((resolve, reject) => {
          db.run(
            'INSERT INTO contacts (sender_id, display_name) VALUES (?, ?)',
            ['user@c.us', 'Duplicate User'], // This should fail due to PRIMARY KEY constraint
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
        
      } catch (error) {
        // Rollback transaction
        await new Promise((resolve, reject) => {
          db.run('ROLLBACK', (err) => {
            if (err) reject(err);
            else {
              rollbackOccurred = true;
              resolve();
            }
          });
        });
      }
      
      assert(rollbackOccurred, 'Transaction should have been rolled back');
      
      // Verify nothing was committed
      const mediaCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM media', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      const contactsCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM contacts', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      assertEqual(mediaCount, 0, 'No media should be committed after rollback');
      assertEqual(contactsCount, 0, 'No contacts should be committed after rollback');
      
      await cleanup();
    }
  },

  {
    name: 'Database schema migration simulation',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('integration-migration');
      
      // Create initial schema (simplified version)
      await new Promise((resolve, reject) => {
        db.serialize(() => {
          db.run(`
            CREATE TABLE media (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              file_path TEXT NOT NULL,
              timestamp INTEGER NOT NULL
            )
          `);
          
          db.run(`
            CREATE TABLE contacts (
              sender_id TEXT PRIMARY KEY,
              display_name TEXT
            )
          `, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
      
      // Insert test data
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO media (file_path, timestamp) VALUES (?, ?)',
          ['test.webp', Date.now()],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      // Simulate schema migration - add new columns
      await new Promise((resolve, reject) => {
        db.serialize(() => {
          db.run('ALTER TABLE media ADD COLUMN chat_id TEXT');
          db.run('ALTER TABLE media ADD COLUMN sender_id TEXT');
          db.run('ALTER TABLE media ADD COLUMN mimetype TEXT', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
      
      // Update existing data with default values
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE media SET chat_id = ?, sender_id = ?, mimetype = ? WHERE id = ?',
          ['default-chat', 'default@c.us', 'image/webp', 1],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      // Verify migration worked
      const migratedRecord = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM media WHERE id = 1', (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      assert(migratedRecord !== null, 'Migrated record should exist');
      assertEqual(migratedRecord.chat_id, 'default-chat', 'chat_id should be set');
      assertEqual(migratedRecord.sender_id, 'default@c.us', 'sender_id should be set');
      assertEqual(migratedRecord.mimetype, 'image/webp', 'mimetype should be set');
      assert(migratedRecord.file_path === 'test.webp', 'Original data should be preserved');
      
      await cleanup();
    }
  }
];

async function main() {
  try {
    await runTestSuite('Database Integration Tests', tests);
  } catch (error) {
    console.error('Integration test suite failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { tests };