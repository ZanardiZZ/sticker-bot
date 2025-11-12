#!/usr/bin/env node
/**
 * Integration tests for #perfil handler
 */

const { createTestDatabase, createTestTables, insertTestMedia, assert, assertEqual, runTestSuite } = require('../helpers/testUtils');
const { MockBaileysClient } = require('../helpers/mockBaileysClient');
const { createCommandUsageModel } = require('../../database/models/commandUsage');
const { countMediaBySenderWithDb } = require('../../database/models/media');
const { createPerfilHandler } = require('../../commands/handlers/perfil');

const tests = [
  {
    name: '#perfil should respond with a formatted profile summary',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('perfil-handler');
      await createTestTables(db);

      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO contacts (sender_id, display_name, updated_at) VALUES (?, ?, ?)',
          ['user1@c.us', 'Joana Teste', Math.floor(Date.now() / 1000)],
          (err) => (err ? reject(err) : resolve())
        );
      });

      await insertTestMedia(db, [
        { senderId: 'user1@c.us' },
        { senderId: 'user1@c.us' },
        { senderId: 'user2@c.us' }
      ]);

      const commandUsage = createCommandUsageModel(db);
      await commandUsage.incrementCommandUsage('#random', 'user1@c.us');
      await commandUsage.incrementCommandUsage('#random', 'user1@c.us');
      await commandUsage.incrementCommandUsage('#tema', 'user1@c.us');

      const replies = [];
      const handler = createPerfilHandler({
        getContact: (senderId) => new Promise((resolve, reject) => {
          db.get('SELECT * FROM contacts WHERE sender_id = ?', [senderId], (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          });
        }),
        countMediaBySender: (senderId) => countMediaBySenderWithDb(db, senderId),
        getUserCommandUsage: (senderId) => commandUsage.getUserCommandUsage(senderId),
        getTotalCommands: (senderId) => commandUsage.getTotalCommands(senderId),
        safeReplyFn: async (client, chatId, text) => {
          replies.push({ chatId, text });
        }
      });

      const client = new MockBaileysClient();
      const message = { id: 'msg-1', body: '#perfil', from: 'user1@c.us' };
      const context = { resolvedSenderId: 'user1@c.us' };

      await handler(client, message, 'chat-123', context);

      assertEqual(replies.length, 1, 'Should send a single reply');
      const response = replies[0].text;

      assert(response.includes('Joana Teste'), 'Should include display name');
      assert(response.includes('• Figurinhas enviadas: 2'), 'Should include sticker count');
      assert(response.includes('• Comandos utilizados: 3'), 'Should include total command usage');
      assert(response.includes('#random — 2 usos'), 'Should list command usage details');
      assert(!response.includes('undefined'), 'Response should not contain undefined values');

      await cleanup();
    }
  }
];

if (require.main === module) {
  runTestSuite('Perfil Command Handler Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tests };
