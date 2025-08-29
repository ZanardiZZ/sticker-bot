#!/usr/bin/env node
/**
 * Test runner - runs all unit tests
 */

const path = require('path');
const { runTestSuite } = require('./helpers/testUtils');

// Import all test modules
const { tests: mediaModelTests } = require('./unit/mediaModel.test');
const { tests: contactsModelTests } = require('./unit/contactsModel.test');
const { tests: databaseHandlerTests } = require('./unit/databaseHandler.test');
const { tests: mediaQueueTests } = require('./unit/mediaQueue.test');
const { tests: maintenanceModelTests } = require('./unit/maintenanceModel.test');
const { tests: idReuseTests } = require('./unit/idReuse.test');
const { tests: gifProcessorTests } = require('./unit/gifProcessor.test');
const { tests: tagSimilarityTests, cleanup: tagSimilarityCleanup } = require('./unit/tagSimilarity.test');
const { tests: idCommandTests } = require('./unit/idCommand.test');
const { runAnimatedStickerTests } = require('./unit/animatedStickerAnalysis.test');


async function runAllTests() {
  console.log('🧪 Running comprehensive test suite for new modules...\n');
  
  const startTime = Date.now();
  const results = [];
  
  try {
    // Run all test suites
    results.push(await runTestSuite('Media Model Tests', mediaModelTests));
    results.push(await runTestSuite('Contacts Model Tests', contactsModelTests));
    results.push(await runTestSuite('DatabaseHandler Tests', databaseHandlerTests));
    results.push(await runTestSuite('MediaQueue Tests', mediaQueueTests));
    results.push(await runTestSuite('Maintenance Model Tests', maintenanceModelTests));
    results.push(await runTestSuite('ID Reuse Tests', idReuseTests));
    results.push(await runTestSuite('GIF Processor Tests', gifProcessorTests));
    results.push(await runTestSuite('Tag Similarity Tests', tagSimilarityTests));
    results.push(await runTestSuite('ID Command Tests', idCommandTests));
    
    // Run animated sticker tests (different format)
    await runAnimatedStickerTests();
    
    const totalTime = Date.now() - startTime;
    
    // Calculate overall results
    const totalTests = results.reduce((sum, result) => sum + result.total, 0);
    const totalPassed = results.reduce((sum, result) => sum + result.passed, 0);
    const totalFailed = results.reduce((sum, result) => sum + result.failed, 0);
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 OVERALL TEST RESULTS');
    console.log('='.repeat(60));
    
    results.forEach(result => {
      const status = result.failed === 0 ? '✅' : '❌';
      console.log(`${status} ${result.name}: ${result.passed}/${result.total} passed`);
      
      if (result.failed > 0) {
        const failedTests = result.tests.filter(t => !t.passed);
        failedTests.forEach(test => {
          console.log(`   ❌ ${test.name}: ${test.error.message}`);
        });
      }
    });
    
    console.log('-'.repeat(60));
    console.log(`📈 Total: ${totalPassed}/${totalTests} tests passed (${Math.round(totalPassed/totalTests * 100)}%)`);
    console.log(`⏱️  Total time: ${totalTime}ms`);
    
    if (totalFailed === 0) {
      console.log('🎉 All tests passed!');
      process.exit(0);
    } else {
      console.log(`❌ ${totalFailed} tests failed`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
  } finally {
    // Cleanup test resources
    if (tagSimilarityCleanup) {
      tagSimilarityCleanup();
    }
  }
}

if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };