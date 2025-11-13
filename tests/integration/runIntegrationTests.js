#!/usr/bin/env node
/**
 * Aggregated integration test runner
 */

const { runTestSuite } = require('../helpers/testUtils');
const { tests: databaseTests } = require('./database.test');
const { tests: top5CommandsTests } = require('./top5commandsCommand.test');
const { tests: downloadMp3IntegrationTests } = require('./downloadMp3Command.test');
const { tests: fotoHdTests } = require('./fotohdCommand.test');
const { tests: perfilTests } = require('./perfilCommand.test');
const { tests: top5UsersTests } = require('./top5usersCommand.test');
const { tests: lidMappingTests } = require('./lidMappingConsistency.test');

async function runIntegrationSuites() {
  try {
    await runTestSuite('Database Integration Tests', databaseTests);
    await runTestSuite('Top5 Commands Handler Tests', top5CommandsTests);
    await runTestSuite('Perfil Command Handler Tests', perfilTests);
    await runTestSuite('Top5Users Command Integration Tests', top5UsersTests);
    await runTestSuite('LID Mapping Consistency Tests', lidMappingTests);
    await runTestSuite('Download MP3 Command Integration Tests', downloadMp3IntegrationTests);
    await runTestSuite('Foto HD Command Integration Tests', fotoHdTests);
  } catch (error) {
    console.error('Integration test suites failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  runIntegrationSuites().then(() => process.exit(0));
}

module.exports = { runIntegrationSuites };
