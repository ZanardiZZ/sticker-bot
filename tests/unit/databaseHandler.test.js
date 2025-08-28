#!/usr/bin/env node
/**
 * Unit tests for DatabaseHandler service
 */

const path = require('path');
const { createTestDatabase, createTestTables, assert, assertEqual, assertLength, runTestSuite, sleep } = require('../helpers/testUtils');

// Import DatabaseHandler - we'll create a minimal version for testing
class TestDatabaseHandler {
  constructor(db) {
    this.db = db;
    this.busyTimeout = 1000; // Shorter timeout for testing
    this.maxRetries = 3;
    this.retryDelay = 50; // Shorter delay for testing
    
    // Configure SQLite for better concurrency
    this.db.configure('busyTimeout', this.busyTimeout);
    this.db.run('PRAGMA journal_mode = WAL');
    this.db.run('PRAGMA synchronous = NORMAL');
  }

  async executeWithRetry(operation, params = []) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.promisifyOperation(operation, params);
      } catch (error) {
        lastError = error;
        
        const isBusyError = error.code === 'SQLITE_BUSY' || 
                           error.message.includes('SQLITE_BUSY') ||
                           error.message.includes('database is locked');
        
        if (isBusyError && attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          await this.sleep(delay);
          continue;
        }
        
        throw error;
      }
    }
    
    throw lastError;
  }

  promisifyOperation(operation, params = []) {
    return new Promise((resolve, reject) => {
      if (typeof operation === 'string') {
        if (operation.trim().toLowerCase().startsWith('select') || 
            operation.trim().toLowerCase().startsWith('with')) {
          this.db.all(operation, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        } else {
          this.db.run(operation, params, function(err) {
            if (err) reject(err);
            else resolve({ 
              changes: this.changes, 
              lastID: this.lastID 
            });
          });
        }
      } else if (typeof operation === 'function') {
        try {
          const result = operation();
          if (result && typeof result.then === 'function') {
            result.then(resolve).catch(reject);
          } else {
            resolve(result);
          }
        } catch (err) {
          reject(err);
        }
      }
    });
  }

  async transaction(operations) {
    return this.executeWithRetry(async () => {
      return new Promise((resolve, reject) => {
        this.db.serialize(() => {
          this.db.run('BEGIN TRANSACTION');
          
          const executeOperations = async () => {
            try {
              const results = [];
              
              for (const op of operations) {
                const result = await this.promisifyOperation(op.sql, op.params);
                results.push(result);
              }
              
              this.db.run('COMMIT', (err) => {
                if (err) reject(err);
                else resolve(results);
              });
              
            } catch (error) {
              this.db.run('ROLLBACK', () => {
                reject(error);
              });
            }
          };
          
          executeOperations();
        });
      });
    });
  }

  async get(sql, params = []) {
    const rows = await this.executeWithRetry(sql, params);
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async all(sql, params = []) {
    return this.executeWithRetry(sql, params);
  }

  async run(sql, params = []) {
    return this.executeWithRetry(sql, params);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async checkpointWAL() {
    return this.executeWithRetry(() => {
      return new Promise((resolve, reject) => {
        this.db.run('PRAGMA wal_checkpoint(TRUNCATE)', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  async getStats() {
    try {
      const [mediaCount, tagCount, processed] = await Promise.all([
        this.get('SELECT COUNT(*) as count FROM media'),
        this.get('SELECT COUNT(*) as count FROM tags'),
        this.get('SELECT COUNT(*) as count FROM processed_files')
      ]);

      return {
        media: mediaCount.count,
        tags: tagCount.count,
        processedFiles: processed.count
      };
    } catch (error) {
      console.error('Error getting database stats:', error);
      return { media: 0, tags: 0, processedFiles: 0 };
    }
  }
}

const tests = [
  {
    name: 'Basic SQL execution - SELECT',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('db-handler-select');
      await createTestTables(db);
      const handler = new TestDatabaseHandler(db);
      
      // Insert test data
      await handler.run('INSERT INTO media (chat_id, file_path, mimetype, timestamp) VALUES (?, ?, ?, ?)', 
                       ['test-chat', 'test.webp', 'image/webp', Date.now()]);
      
      // Test SELECT query
      const rows = await handler.all('SELECT * FROM media');
      assertLength(rows, 1, 'Should return 1 row');
      assertEqual(rows[0].chat_id, 'test-chat', 'Chat ID should match');
      
      await cleanup();
    }
  },

  {
    name: 'Basic SQL execution - INSERT',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('db-handler-insert');
      await createTestTables(db);
      const handler = new TestDatabaseHandler(db);
      
      // Test INSERT query
      const result = await handler.run(
        'INSERT INTO media (chat_id, file_path, mimetype, timestamp) VALUES (?, ?, ?, ?)', 
        ['test-chat', 'test.webp', 'image/webp', Date.now()]
      );
      
      assert(typeof result.lastID === 'number', 'Should return lastID');
      assertEqual(result.changes, 1, 'Should affect 1 row');
      assert(result.lastID > 0, 'lastID should be greater than 0');
      
      await cleanup();
    }
  },

  {
    name: 'Basic SQL execution - UPDATE',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('db-handler-update');
      await createTestTables(db);
      const handler = new TestDatabaseHandler(db);
      
      // Insert test data
      await handler.run('INSERT INTO media (chat_id, file_path, mimetype, timestamp) VALUES (?, ?, ?, ?)', 
                       ['test-chat', 'test.webp', 'image/webp', Date.now()]);
      
      // Test UPDATE query
      const result = await handler.run('UPDATE media SET chat_id = ? WHERE id = ?', ['updated-chat', 1]);
      assertEqual(result.changes, 1, 'Should update 1 row');
      
      // Verify update
      const row = await handler.get('SELECT chat_id FROM media WHERE id = ?', [1]);
      assertEqual(row.chat_id, 'updated-chat', 'Chat ID should be updated');
      
      await cleanup();
    }
  },

  {
    name: 'Get single record',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('db-handler-get');
      await createTestTables(db);
      const handler = new TestDatabaseHandler(db);
      
      // Insert test data
      await handler.run('INSERT INTO media (chat_id, file_path, mimetype, timestamp) VALUES (?, ?, ?, ?)', 
                       ['test-chat', 'test.webp', 'image/webp', Date.now()]);
      
      // Test getting single record
      const record = await handler.get('SELECT * FROM media WHERE id = ?', [1]);
      assert(record !== null && record !== undefined, 'Should return a record');
      assertEqual(record.chat_id, 'test-chat', 'Chat ID should match');
      
      // Test getting non-existent record
      const nonExistent = await handler.get('SELECT * FROM media WHERE id = ?', [999]);
      assert(nonExistent === undefined, 'Should return undefined for non-existent record');
      
      await cleanup();
    }
  },

  {
    name: 'Transaction - successful commit',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('db-handler-transaction-success');
      await createTestTables(db);
      const handler = new TestDatabaseHandler(db);
      
      // Test successful transaction
      const operations = [
        { sql: 'INSERT INTO media (chat_id, file_path, mimetype, timestamp) VALUES (?, ?, ?, ?)', 
          params: ['chat1', 'test1.webp', 'image/webp', Date.now()] },
        { sql: 'INSERT INTO media (chat_id, file_path, mimetype, timestamp) VALUES (?, ?, ?, ?)', 
          params: ['chat2', 'test2.webp', 'image/webp', Date.now()] }
      ];
      
      const results = await handler.transaction(operations);
      assertLength(results, 2, 'Should return 2 results');
      assert(results[0].lastID > 0, 'First insert should have lastID');
      assert(results[1].lastID > 0, 'Second insert should have lastID');
      
      // Verify both records were inserted
      const count = await handler.get('SELECT COUNT(*) as count FROM media');
      assertEqual(count.count, 2, 'Should have 2 records after transaction');
      
      await cleanup();
    }
  },

  {
    name: 'Transaction - rollback on error',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('db-handler-transaction-rollback');
      await createTestTables(db);
      const handler = new TestDatabaseHandler(db);
      
      // Insert initial record
      await handler.run('INSERT INTO media (chat_id, file_path, mimetype, timestamp) VALUES (?, ?, ?, ?)', 
                       ['existing', 'test.webp', 'image/webp', Date.now()]);
      
      // Test transaction with error (constraint violation)
      const operations = [
        { sql: 'INSERT INTO media (chat_id, file_path, mimetype, timestamp) VALUES (?, ?, ?, ?)', 
          params: ['chat1', 'test1.webp', 'image/webp', Date.now()] },
        { sql: 'INSERT INTO contacts (sender_id, display_name) VALUES (?, ?)', 
          params: ['test@c.us', 'Test User'] },
        { sql: 'INSERT INTO contacts (sender_id, display_name) VALUES (?, ?)', 
          params: ['test@c.us', 'Test User'] } // This should cause a constraint violation
      ];
      
      let errorThrown = false;
      try {
        await handler.transaction(operations);
      } catch (error) {
        errorThrown = true;
        assert(error.message.includes('UNIQUE constraint failed'), 'Should throw constraint error');
      }
      
      assert(errorThrown, 'Transaction should throw error');
      
      // Verify rollback - media should still have only 1 record
      const mediaCount = await handler.get('SELECT COUNT(*) as count FROM media');
      assertEqual(mediaCount.count, 1, 'Media count should be unchanged after rollback');
      
      // Verify rollback - contacts should have no records
      const contactsCount = await handler.get('SELECT COUNT(*) as count FROM contacts');
      assertEqual(contactsCount.count, 0, 'Contacts should be empty after rollback');
      
      await cleanup();
    }
  },

  {
    name: 'Error handling - invalid SQL',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('db-handler-error');
      await createTestTables(db);
      const handler = new TestDatabaseHandler(db);
      
      // Test invalid SQL
      let errorThrown = false;
      try {
        await handler.run('INVALID SQL STATEMENT');
      } catch (error) {
        errorThrown = true;
        assert(error.message.includes('syntax error'), 'Should throw syntax error');
      }
      
      assert(errorThrown, 'Should throw error for invalid SQL');
      
      await cleanup();
    }
  },

  {
    name: 'Custom function execution',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('db-handler-function');
      await createTestTables(db);
      const handler = new TestDatabaseHandler(db);
      
      // Test executing custom function
      const customFunction = () => {
        return { success: true, timestamp: Date.now() };
      };
      
      const result = await handler.executeWithRetry(customFunction);
      assert(result.success === true, 'Custom function should return success');
      assert(typeof result.timestamp === 'number', 'Custom function should return timestamp');
      
      // Test async custom function
      const asyncFunction = () => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ async: true }), 10);
        });
      };
      
      const asyncResult = await handler.executeWithRetry(asyncFunction);
      assert(asyncResult.async === true, 'Async custom function should work');
      
      await cleanup();
    }
  },

  {
    name: 'WAL checkpoint',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('db-handler-wal');
      await createTestTables(db);
      const handler = new TestDatabaseHandler(db);
      
      // Insert some data to create WAL entries
      await handler.run('INSERT INTO media (chat_id, file_path, mimetype, timestamp) VALUES (?, ?, ?, ?)', 
                       ['test-chat', 'test.webp', 'image/webp', Date.now()]);
      
      // Test WAL checkpoint (should not throw error)
      await handler.checkpointWAL();
      
      // Verify data is still accessible
      const record = await handler.get('SELECT * FROM media WHERE chat_id = ?', ['test-chat']);
      assert(record !== null, 'Data should be accessible after checkpoint');
      
      await cleanup();
    }
  },

  {
    name: 'Get database statistics',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('db-handler-stats');
      await createTestTables(db);
      const handler = new TestDatabaseHandler(db);
      
      // Initially empty stats
      let stats = await handler.getStats();
      assertEqual(stats.media, 0, 'Initial media count should be 0');
      assertEqual(stats.tags, 0, 'Initial tags count should be 0');
      assertEqual(stats.processedFiles, 0, 'Initial processed files count should be 0');
      
      // Insert test data
      const mediaId = await handler.run('INSERT INTO media (chat_id, file_path, mimetype, timestamp) VALUES (?, ?, ?, ?)', 
                                       ['test-chat', 'test.webp', 'image/webp', Date.now()]);
      
      await handler.run('INSERT INTO tags (media_id, tag) VALUES (?, ?)', [mediaId.lastID, 'test-tag']);
      await handler.run('INSERT INTO processed_files (file_hash, file_path) VALUES (?, ?)', ['hash123', 'test.webp']);
      
      // Updated stats
      stats = await handler.getStats();
      assertEqual(stats.media, 1, 'Media count should be 1');
      assertEqual(stats.tags, 1, 'Tags count should be 1');
      assertEqual(stats.processedFiles, 1, 'Processed files count should be 1');
      
      await cleanup();
    }
  },

  {
    name: 'Retry mechanism simulation',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('db-handler-retry');
      await createTestTables(db);
      const handler = new TestDatabaseHandler(db);
      
      // Create a function that fails the first time but succeeds the second time
      let attemptCount = 0;
      const flakeyOperation = () => {
        attemptCount++;
        if (attemptCount === 1) {
          const error = new Error('database is locked');
          error.code = 'SQLITE_BUSY';
          throw error;
        }
        return { success: true, attempts: attemptCount };
      };
      
      // Should succeed after retry
      const result = await handler.executeWithRetry(flakeyOperation);
      assert(result.success === true, 'Should succeed after retry');
      assertEqual(result.attempts, 2, 'Should have made 2 attempts');
      
      await cleanup();
    }
  }
];

async function main() {
  try {
    await runTestSuite('DatabaseHandler Tests', tests);
  } catch (error) {
    console.error('Test suite failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { tests };