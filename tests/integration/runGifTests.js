#!/usr/bin/env node
/**
 * Integration test runner for GIF processing
 */

const { runTestSuite } = require('../helpers/testUtils');

// Import test modules
const { tests: gifMediaProcessingTests } = require('./gifMediaProcessing.test');

async function runGifIntegrationTests() {
  console.log('🧪 Running GIF processing integration tests...\n');
  
  const startTime = Date.now();
  const results = [];
  
  try {
    // Run GIF integration tests
    results.push(await runTestSuite('GIF Media Processing Integration Tests', gifMediaProcessingTests));
    
    const totalTime = Date.now() - startTime;
    
    // Calculate overall results
    const totalTests = results.reduce((sum, result) => sum + result.total, 0);
    const totalPassed = results.reduce((sum, result) => sum + result.passed, 0);
    const totalFailed = results.reduce((sum, result) => sum + result.failed, 0);
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 GIF INTEGRATION TEST RESULTS');
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
      console.log('🎉 All GIF integration tests passed!');
      process.exit(0);
    } else {
      console.log(`❌ ${totalFailed} tests failed`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('💥 GIF integration test runner failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  runGifIntegrationTests();
}

module.exports = { runGifIntegrationTests };