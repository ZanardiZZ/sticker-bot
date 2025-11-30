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
const { tests: largeGifProcessingTests } = require('./unit/largeGifProcessing.test');
const { tests: tagSimilarityTests, cleanup: tagSimilarityCleanup } = require('./unit/tagSimilarity.test');
const { tests: idCommandTests } = require('./unit/idCommand.test');
const { tests: banCommandTests } = require('./unit/banCommand.test');
const { tests: downloadMp3CommandTests } = require('./unit/downloadMp3Command.test');
const { tests: adminUtilsTests } = require('./unit/adminUtils.test');
const { tests: versionTests } = require('./unit/version.test');
const { tests: logCollectorTests } = require('./unit/logCollector.test');
const { tests: permissionEvaluatorTests } = require('./unit/permissionEvaluator.test');
const { runAnimatedStickerTests } = require('./unit/animatedStickerAnalysis.test');
const { testMultiFrameDisableFeature } = require('./unit/multiFrameDisabled.test');
const { tests: mockBaileysIntegrationTests } = require('./integration/mockBaileysIntegration.test');
const { tests: mediaSendHandlerTests } = require('./unit/mediaSendHandlers.test');
const { tests: processIncomingMediaTests } = require('./unit/processIncomingMedia.test');
const { tests: dataUrlTests } = require('./unit/dataUrl.test');
const { tests: commandUsageModelTests } = require('./unit/commandUsageModel.test');
const { tests: imageEnhancerTests } = require('./services/imageEnhancer.test');
const { tests: processedMessagesModelTests } = require('./unit/processedMessagesModel.test');
const { tests: messageHistoryRecoveryTests } = require('./unit/messageHistoryRecovery.test');
const { tests: mediaDownloadRetryTests } = require('./unit/mediaDownloadRetry.test');
const { tests: schedulerTests } = require('./unit/scheduler.test');


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
    results.push(await runTestSuite('Large GIF Processing Tests', largeGifProcessingTests));
    results.push(await runTestSuite('Tag Similarity Tests', tagSimilarityTests));
    results.push(await runTestSuite('ID Command Tests', idCommandTests));
    results.push(await runTestSuite('Ban Command Tests', banCommandTests));
    results.push(await runTestSuite('Download MP3 Command Tests', downloadMp3CommandTests));
    results.push(await runTestSuite('Admin Utils Tests', adminUtilsTests));
    results.push(await runTestSuite('Version Model Tests', versionTests));
    results.push(await runTestSuite('Command Usage Model Tests', commandUsageModelTests));
    results.push(await runTestSuite('LogCollector Tests', logCollectorTests));
    results.push(await runTestSuite('Permission Evaluator Tests', permissionEvaluatorTests));
    results.push(await runTestSuite('Mock Baileys Integration Tests', mockBaileysIntegrationTests));
    results.push(await runTestSuite('Media Sending Helper Tests', mediaSendHandlerTests));
    results.push(await runTestSuite('Process Incoming Media Tests', processIncomingMediaTests));
    results.push(await runTestSuite('Data URL Utils Tests', dataUrlTests));
    results.push(await runTestSuite('Image Enhancer Service Tests', imageEnhancerTests));
    results.push(await runTestSuite('Processed Messages Model Tests', processedMessagesModelTests));
    results.push(await runTestSuite('Message History Recovery Tests', messageHistoryRecoveryTests));
    results.push(await runTestSuite('Media Download Retry Tests', mediaDownloadRetryTests));
    results.push(await runTestSuite('Scheduler Tests', schedulerTests));
    
    // Run animated sticker tests (different format)
    await runAnimatedStickerTests();
    
    // Run multi-frame disable tests (different format)
    const multiFrameTestResults = await testMultiFrameDisableFeature();
    
    const totalTime = Date.now() - startTime;
    
    // Calculate overall results
    const totalTests = results.reduce((sum, result) => sum + result.total, 0) + (multiFrameTestResults.passed + multiFrameTestResults.failed);
    const totalPassed = results.reduce((sum, result) => sum + result.passed, 0) + multiFrameTestResults.passed;
    const totalFailed = results.reduce((sum, result) => sum + result.failed, 0) + multiFrameTestResults.failed;
    
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
