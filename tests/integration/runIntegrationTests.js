#!/usr/bin/env node
/**
 * Aggregated integration test runner
 */

const { runTestSuite } = require('../helpers/testUtils');
const { tests: databaseTests } = require('./database.test');
const { tests: top5CommandsTests } = require('./top5commandsCommand.test');

async function runIntegrationSuites() {
  try {
    await runTestSuite('Database Integration Tests', databaseTests);
    await runTestSuite('Top5 Commands Handler Tests', top5CommandsTests);
  } catch (error) {
    console.error('Integration test suites failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  runIntegrationSuites().then(() => process.exit(0));
}

module.exports = { runIntegrationSuites };
