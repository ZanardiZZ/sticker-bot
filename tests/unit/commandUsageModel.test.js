#!/usr/bin/env node
/**
 * Unit tests for command usage model helpers
 */

const { createTestDatabase, createTestTables, assert, assertEqual, runTestSuite } = require('../helpers/testUtils');
const { createCommandUsageModel } = require('../../database/models/commandUsage');

const tests = [
  {
    name: 'incrementCommandUsage creates and updates records',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('command-usage-model');
      await createTestTables(db);
      const { incrementCommandUsage } = createCommandUsageModel(db);

      const initialTimestamp = Math.floor(Date.now() / 1000);

      await incrementCommandUsage('#random', 'user1@c.us');
      await incrementCommandUsage('#random', 'user1@c.us');
      await incrementCommandUsage('#count', 'user1@c.us');

      const rows = await new Promise((resolve, reject) => {
        db.all('SELECT command, user_id, usage_count, last_used FROM command_usage ORDER BY command', (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });

      assertEqual(rows.length, 2, 'Should create two command rows');

      const randomRow = rows.find(row => row.command === '#random');
      const countRow = rows.find(row => row.command === '#count');

      assert(randomRow, 'Random command row should exist');
      assert(countRow, 'Count command row should exist');

      assertEqual(randomRow.usage_count, 2, 'Random command should accumulate usage count');
      assertEqual(countRow.usage_count, 1, 'Count command should have single usage');
      assert(randomRow.last_used >= initialTimestamp, 'last_used should be updated');

      await cleanup();
    }
  },
  {
    name: 'getTopCommands aggregates usage across users and respects limit',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('command-usage-top');
      await createTestTables(db);
      const { incrementCommandUsage, getTopCommands } = createCommandUsageModel(db);

      await incrementCommandUsage('#random', 'user1@c.us');
      await incrementCommandUsage('#random', 'user2@c.us');
      await incrementCommandUsage('#count', 'user1@c.us');
      await incrementCommandUsage('#count', 'user2@c.us');
      await incrementCommandUsage('#count', 'user3@c.us');
      await incrementCommandUsage('#tema', 'user1@c.us');

      const topTwo = await getTopCommands(2);
      assertEqual(topTwo.length, 2, 'Should honor limit parameter');
      assertEqual(topTwo[0].command, '#count', 'Command with higher usage should come first');
      assertEqual(topTwo[0].total_usage, 3, 'Total usage should aggregate across users');
      assertEqual(topTwo[1].command, '#random', 'Second command should be #random');
      assertEqual(topTwo[1].total_usage, 2, 'Random command should aggregate across users');

      const defaultTop = await getTopCommands();
      assert(defaultTop.length >= 3, 'Default top command list should include all commands when limit not exceeded');

      await cleanup();
    }
  },
  {
    name: 'getUserCommandUsage returns per-command stats sorted by usage',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('command-usage-user');
      await createTestTables(db);
      const { incrementCommandUsage, getUserCommandUsage } = createCommandUsageModel(db);

      await incrementCommandUsage('#random', 'user1@c.us');
      await incrementCommandUsage('#random', 'user1@c.us');
      await incrementCommandUsage('#tema', 'user1@c.us');
      await incrementCommandUsage('#count', 'user1@c.us');
      await incrementCommandUsage('#tema', 'user1@c.us');

      const usage = await getUserCommandUsage('user1@c.us');

      assertEqual(usage.length, 3, 'Should return stats for each command used by the user');
      assert(
        usage.every((entry, index) => index === 0 || entry.usage_count <= usage[index - 1].usage_count),
        'Results should be sorted by usage count descending'
      );

      const temaUsage = usage.find((entry) => entry.command === '#tema');
      const randomUsage = usage.find((entry) => entry.command === '#random');
      const countUsage = usage.find((entry) => entry.command === '#count');

      assert(temaUsage, 'Should include #tema stats');
      assertEqual(temaUsage.usage_count, 2, 'Usage count should match aggregated value for #tema');
      assert(randomUsage, 'Should include #random stats');
      assertEqual(randomUsage.usage_count, 2, 'Usage count should match aggregated value for #random');
      assert(countUsage, 'Should include #count stats');
      assertEqual(countUsage.usage_count, 1, 'Usage count should match aggregated value for #count');

      await cleanup();
    }
  },
  {
    name: 'getTotalCommands sums all usages for a user and handles empty results',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('command-usage-total');
      await createTestTables(db);
      const { incrementCommandUsage, getTotalCommands } = createCommandUsageModel(db);

      await incrementCommandUsage('#random', 'user1@c.us');
      await incrementCommandUsage('#random', 'user1@c.us');
      await incrementCommandUsage('#tema', 'user1@c.us');

      const total = await getTotalCommands('user1@c.us');
      assertEqual(total, 3, 'Should sum all command usages for the user');

      const emptyTotal = await getTotalCommands('user2@c.us');
      assertEqual(emptyTotal, 0, 'Should return 0 when user has no command usage history');

      await cleanup();
    }
  }
];

if (require.main === module) {
  runTestSuite('Command Usage Model Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tests };
