#!/usr/bin/env node
/**
 * Integration tests for #top5comandos handler
 */

const { createTestDatabase, createTestTables, assert, assertEqual, runTestSuite } = require('../helpers/testUtils');
const { MockBaileysClient } = require('../helpers/mockBaileysClient');
const { createCommandUsageModel } = require('../../database/models/commandUsage');
const { createTop5CommandsHandler } = require('../../commands/handlers/top5commands');

const tests = [
  {
    name: '#top5comandos should respond with a formatted ranking',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('top5commands-handler');
      await createTestTables(db);
      const commandUsage = createCommandUsageModel(db);

      await commandUsage.incrementCommandUsage('#random', 'user1@c.us');
      await commandUsage.incrementCommandUsage('#random', 'user2@c.us');
      await commandUsage.incrementCommandUsage('#count', 'user1@c.us');
      await commandUsage.incrementCommandUsage('#count', 'user2@c.us');
      await commandUsage.incrementCommandUsage('#tema', 'user3@c.us');

      const replies = [];
      const handler = createTop5CommandsHandler({
        getTopCommands: (limit) => commandUsage.getTopCommands(limit),
        safeReplyFn: async (client, chatId, text) => {
          replies.push({ chatId, text });
        }
      });

      const client = new MockBaileysClient();
      const message = { id: 'msg-1', body: '#top5comandos' };

      await handler(client, message, 'chat-123');

      assertEqual(replies.length, 1, 'Should send a single reply');
      const response = replies[0].text;
      // Determine the expected number of top commands
      const expectedTopCount = 3; // We incremented 3 unique commands above
      assert(response.includes(`Top ${expectedTopCount} comandos mais usados`), 'Response should mention the number of commands returned');
      assert(response.includes('#count'), 'Response should include #count');
      assert(response.includes('#random'), 'Response should include #random');
      assert(!response.includes('undefined'), 'Response should not contain undefined values');

      await cleanup();
    }
  },
  {
    name: '#top5comandos should handle empty history gracefully',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('top5commands-empty');
      await createTestTables(db);
      const commandUsage = createCommandUsageModel(db);

      const replies = [];
      const handler = createTop5CommandsHandler({
        getTopCommands: (limit) => commandUsage.getTopCommands(limit),
        safeReplyFn: async (client, chatId, text) => {
          replies.push({ chatId, text });
        }
      });

      const client = new MockBaileysClient();
      const message = { id: 'msg-2', body: '#top5comandos' };

      await handler(client, message, 'chat-456');

      assertEqual(replies.length, 1, 'Should send a single reply when no data');
      assertEqual(replies[0].text, 'Nenhum comando foi usado ainda.', 'Should warn when there is no history');

      await cleanup();
    }
  }
];

if (require.main === module) {
  runTestSuite('Top5 Commands Handler Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tests };
