#!/usr/bin/env node
/**
 * Aggregated integration test runner
 */

const { cleanupTestEnvironment } = require('../helpers/testEnvironment');
const { runTestSuite } = require('../helpers/testUtils');
const { tests: databaseTests } = require('./database.test');
const { tests: top5CommandsTests } = require('./top5commandsCommand.test');
const { tests: perfilTests } = require('./perfilCommand.test');
const { tests: top5UsersTests } = require('./top5usersCommand.test');
const { tests: lidMappingTests } = require('./lidMappingConsistency.test');

async function runIntegrationSuites() {
  let exitCode = 0;
  try {
    await runTestSuite('Database Integration Tests', databaseTests);
    await runTestSuite('Top5 Commands Handler Tests', top5CommandsTests);
    await runTestSuite('Perfil Command Handler Tests', perfilTests);
    await runTestSuite('Top5Users Command Integration Tests', top5UsersTests);
    await runTestSuite('LID Mapping Consistency Tests', lidMappingTests);
  } catch (error) {
    console.error('Integration test suites failed:', error);
    exitCode = 1;
  } finally {
    await cleanupTestEnvironment();
    process.exitCode = exitCode;
  }
}

if (require.main === module) {
  runIntegrationSuites();
}

module.exports = { runIntegrationSuites };
