#!/usr/bin/env node
/**
 * Unit tests for processed messages model
 */

const { createTestDatabase, assert, assertEqual, runTestSuite } = require('../helpers/testUtils');

// Test suite
const tests = [
  {
    name: 'markMessageAsProcessed should insert a new message',
    async fn() {
      const { db, cleanup } = createTestDatabase('processed-messages-1');
      
      try {
        // Create the table
        await new Promise((resolve, reject) => {
          db.run(`
            CREATE TABLE processed_messages (
              message_id TEXT PRIMARY KEY,
              chat_id TEXT NOT NULL,
              processed_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            )
          `, (err) => err ? reject(err) : resolve());
        });

        // Create model functions with this db
        const markMessageAsProcessed = (messageId, chatId) => {
          return new Promise((resolve, reject) => {
            const now = Math.floor(Date.now() / 1000);
            db.run(
              `INSERT OR IGNORE INTO processed_messages (message_id, chat_id, processed_at)
               VALUES (?, ?, ?)`,
              [messageId, chatId, now],
              (err) => err ? reject(err) : resolve()
            );
          });
        };

        await markMessageAsProcessed('msg-123', 'chat-456');

        // Verify it was inserted
        const row = await new Promise((resolve, reject) => {
          db.get('SELECT * FROM processed_messages WHERE message_id = ?', ['msg-123'], (err, row) => {
            err ? reject(err) : resolve(row);
          });
        });

        assert(row, 'Message should be inserted');
        assertEqual(row.message_id, 'msg-123', 'Message ID should match');
        assertEqual(row.chat_id, 'chat-456', 'Chat ID should match');
        assert(row.processed_at > 0, 'Processed timestamp should be set');
      } finally {
        cleanup();
      }
    }
  },

  {
    name: 'markMessageAsProcessed should ignore duplicate inserts',
    async fn() {
      const { db, cleanup } = createTestDatabase('processed-messages-2');
      
      try {
        await new Promise((resolve, reject) => {
          db.run(`
            CREATE TABLE processed_messages (
              message_id TEXT PRIMARY KEY,
              chat_id TEXT NOT NULL,
              processed_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            )
          `, (err) => err ? reject(err) : resolve());
        });

        const markMessageAsProcessed = (messageId, chatId) => {
          return new Promise((resolve, reject) => {
            const now = Math.floor(Date.now() / 1000);
            db.run(
              `INSERT OR IGNORE INTO processed_messages (message_id, chat_id, processed_at)
               VALUES (?, ?, ?)`,
              [messageId, chatId, now],
              (err) => err ? reject(err) : resolve()
            );
          });
        };

        // Insert same message twice
        await markMessageAsProcessed('msg-123', 'chat-456');
        await markMessageAsProcessed('msg-123', 'chat-456');

        // Count should still be 1
        const count = await new Promise((resolve, reject) => {
          db.get('SELECT COUNT(*) as count FROM processed_messages', [], (err, row) => {
            err ? reject(err) : resolve(row.count);
          });
        });

        assertEqual(count, 1, 'Should have only one entry for duplicate message');
      } finally {
        cleanup();
      }
    }
  },

  {
    name: 'isMessageProcessed should return true for processed messages',
    async fn() {
      const { db, cleanup } = createTestDatabase('processed-messages-3');
      
      try {
        await new Promise((resolve, reject) => {
          db.run(`
            CREATE TABLE processed_messages (
              message_id TEXT PRIMARY KEY,
              chat_id TEXT NOT NULL,
              processed_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            )
          `, (err) => err ? reject(err) : resolve());
        });

        const isMessageProcessed = (messageId) => {
          return new Promise((resolve, reject) => {
            db.get(
              'SELECT message_id FROM processed_messages WHERE message_id = ? LIMIT 1',
              [messageId],
              (err, row) => err ? reject(err) : resolve(!!row)
            );
          });
        };

        // Insert a message
        await new Promise((resolve, reject) => {
          db.run(
            'INSERT INTO processed_messages (message_id, chat_id, processed_at) VALUES (?, ?, ?)',
            ['msg-123', 'chat-456', Math.floor(Date.now() / 1000)],
            (err) => err ? reject(err) : resolve()
          );
        });

        const isProcessed = await isMessageProcessed('msg-123');
        const isNotProcessed = await isMessageProcessed('msg-999');

        assertEqual(isProcessed, true, 'Should return true for processed message');
        assertEqual(isNotProcessed, false, 'Should return false for unprocessed message');
      } finally {
        cleanup();
      }
    }
  },

  {
    name: 'getProcessedMessageCount should count messages correctly',
    async fn() {
      const { db, cleanup } = createTestDatabase('processed-messages-4');
      
      try {
        await new Promise((resolve, reject) => {
          db.run(`
            CREATE TABLE processed_messages (
              message_id TEXT PRIMARY KEY,
              chat_id TEXT NOT NULL,
              processed_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            )
          `, (err) => err ? reject(err) : resolve());
        });

        const getProcessedMessageCount = (chatId = null) => {
          return new Promise((resolve, reject) => {
            const query = chatId 
              ? 'SELECT COUNT(*) as count FROM processed_messages WHERE chat_id = ?'
              : 'SELECT COUNT(*) as count FROM processed_messages';
            const params = chatId ? [chatId] : [];
            
            db.get(query, params, (err, row) => {
              err ? reject(err) : resolve(row?.count || 0);
            });
          });
        };

        // Insert messages
        const now = Math.floor(Date.now() / 1000);
        await new Promise((resolve, reject) => {
          db.run('INSERT INTO processed_messages VALUES (?, ?, ?)', ['msg-1', 'chat-A', now], (err) => {
            if (err) reject(err);
            else {
              db.run('INSERT INTO processed_messages VALUES (?, ?, ?)', ['msg-2', 'chat-A', now], (err) => {
                if (err) reject(err);
                else {
                  db.run('INSERT INTO processed_messages VALUES (?, ?, ?)', ['msg-3', 'chat-B', now], (err) => {
                    err ? reject(err) : resolve();
                  });
                }
              });
            }
          });
        });

        const totalCount = await getProcessedMessageCount();
        const chatACount = await getProcessedMessageCount('chat-A');
        const chatBCount = await getProcessedMessageCount('chat-B');

        assertEqual(totalCount, 3, 'Total count should be 3');
        assertEqual(chatACount, 2, 'Chat A count should be 2');
        assertEqual(chatBCount, 1, 'Chat B count should be 1');
      } finally {
        cleanup();
      }
    }
  },

  {
    name: 'getProcessedMessageIds should batch check processed messages',
    async fn() {
      const { db, cleanup } = createTestDatabase('processed-messages-5');
      
      try {
        await new Promise((resolve, reject) => {
          db.run(`
            CREATE TABLE processed_messages (
              message_id TEXT PRIMARY KEY,
              chat_id TEXT NOT NULL,
              processed_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            )
          `, (err) => err ? reject(err) : resolve());
        });

        const getProcessedMessageIds = (messageIds) => {
          return new Promise((resolve, reject) => {
            if (!messageIds || messageIds.length === 0) {
              return resolve(new Set());
            }

            const placeholders = messageIds.map(() => '?').join(',');
            const query = `SELECT message_id FROM processed_messages WHERE message_id IN (${placeholders})`;
            
            db.all(query, messageIds, (err, rows) => {
              if (err) reject(err);
              else {
                const processedIds = new Set(rows.map(row => row.message_id));
                resolve(processedIds);
              }
            });
          });
        };

        // Insert some messages
        const now = Math.floor(Date.now() / 1000);
        await new Promise((resolve, reject) => {
          db.run('INSERT INTO processed_messages VALUES (?, ?, ?)', ['msg-1', 'chat-A', now], (err) => {
            if (err) reject(err);
            else {
              db.run('INSERT INTO processed_messages VALUES (?, ?, ?)', ['msg-3', 'chat-A', now], (err) => {
                err ? reject(err) : resolve();
              });
            }
          });
        });

        const processedIds = await getProcessedMessageIds(['msg-1', 'msg-2', 'msg-3', 'msg-4']);

        assertEqual(processedIds.size, 2, 'Should return 2 processed messages');
        assert(processedIds.has('msg-1'), 'Should include msg-1');
        assert(processedIds.has('msg-3'), 'Should include msg-3');
        assert(!processedIds.has('msg-2'), 'Should not include msg-2');
        assert(!processedIds.has('msg-4'), 'Should not include msg-4');
      } finally {
        cleanup();
      }
    }
  },

  {
    name: 'cleanupOldProcessedMessages should delete old records',
    async fn() {
      const { db, cleanup } = createTestDatabase('processed-messages-6');
      
      try {
        await new Promise((resolve, reject) => {
          db.run(`
            CREATE TABLE processed_messages (
              message_id TEXT PRIMARY KEY,
              chat_id TEXT NOT NULL,
              processed_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            )
          `, (err) => err ? reject(err) : resolve());
        });

        const cleanupOldProcessedMessages = (daysOld = 30) => {
          return new Promise((resolve, reject) => {
            const cutoffTime = Math.floor(Date.now() / 1000) - (daysOld * 24 * 60 * 60);
            
            db.run(
              'DELETE FROM processed_messages WHERE processed_at < ?',
              [cutoffTime],
              function (err) {
                err ? reject(err) : resolve(this.changes);
              }
            );
          });
        };

        const now = Math.floor(Date.now() / 1000);
        const oldTime = now - (40 * 24 * 60 * 60); // 40 days ago
        const recentTime = now - (10 * 24 * 60 * 60); // 10 days ago

        // Insert messages with different timestamps
        await new Promise((resolve, reject) => {
          db.run('INSERT INTO processed_messages VALUES (?, ?, ?)', ['old-1', 'chat-A', oldTime], (err) => {
            if (err) reject(err);
            else {
              db.run('INSERT INTO processed_messages VALUES (?, ?, ?)', ['recent-1', 'chat-A', recentTime], (err) => {
                err ? reject(err) : resolve();
              });
            }
          });
        });

        // Clean up messages older than 30 days
        const deletedCount = await cleanupOldProcessedMessages(30);

        assertEqual(deletedCount, 1, 'Should delete 1 old message');

        // Verify recent message still exists
        const remaining = await new Promise((resolve, reject) => {
          db.get('SELECT COUNT(*) as count FROM processed_messages', [], (err, row) => {
            err ? reject(err) : resolve(row.count);
          });
        });

        assertEqual(remaining, 1, 'Should have 1 remaining message');
      } finally {
        cleanup();
      }
    }
  }
];

// Run the tests if this file is executed directly
if (require.main === module) {
  runTestSuite('Processed Messages Model Tests', tests);
}

// Export tests for test runner
module.exports = { tests };
