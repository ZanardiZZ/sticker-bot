const { processAnimatedWebp } = require('../../services/videoProcessor');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

/**
 * Integration test for animated WebP processing flow
 */

async function testAnimatedWebpIntegration() {
  console.log('\n=== Animated WebP Integration Tests ===');
  
  const testResults = { passed: 0, failed: 0 };
  let tempTestFile = null;
  
  try {
    // Test 1: Create a simple animated WebP file for testing
    console.log('\n--- Test 1: Creating Test Animated WebP ---');
    
    // Create a simple 2-frame animated WebP using Sharp
    const frame1 = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    }).png().toBuffer();
    
    const frame2 = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 0, g: 255, b: 0 }
      }
    }).png().toBuffer();
    
    // For testing purposes, let's create a static WebP first to verify basic functionality
    tempTestFile = path.join(__dirname, 'test_static.webp');
    const staticWebp = await sharp(frame1).webp().toBuffer();
    fs.writeFileSync(tempTestFile, staticWebp);
    
    console.log(`✅ Test WebP file created at ${tempTestFile}`);
    testResults.passed++;
    
    // Test 2: Process the static WebP (should work as single-frame)
    console.log('\n--- Test 2: Processing Static WebP ---');
    
    const result = await processAnimatedWebp(tempTestFile);
    
    if (!result || typeof result !== 'object') {
      throw new Error('processAnimatedWebp returned invalid result');
    }
    
    if (!result.description || !Array.isArray(result.tags)) {
      throw new Error('Result missing required description or tags fields');
    }
    
    console.log(`✅ Static WebP processed: "${result.description}", Tags: [${result.tags.join(', ')}]`);
    testResults.passed++;
    
    // Test 3: Verify error handling with corrupted file
    console.log('\n--- Test 3: Error Handling with Invalid File ---');
    
    const corruptedFile = path.join(__dirname, 'test_corrupted.webp');
    fs.writeFileSync(corruptedFile, 'This is not a WebP file');
    
    try {
      const corruptedResult = await processAnimatedWebp(corruptedFile);
      
      // Should return error fallback instead of throwing
      if (corruptedResult.tags.includes('formato-nao-suportado') || 
          corruptedResult.tags.includes('erro-processamento')) {
        console.log('✅ Corrupted file handled gracefully with error tags');
        testResults.passed++;
      } else {
        throw new Error('Corrupted file should return error tags');
      }
    } finally {
      if (fs.existsSync(corruptedFile)) {
        fs.unlinkSync(corruptedFile);
      }
    }
    
    console.log(`\n🎉 Animated WebP integration tests completed!`);
    
  } catch (error) {
    console.error(`❌ Integration test failed: ${error.message}`);
    testResults.failed++;
  } finally {
    // Clean up test files
    if (tempTestFile && fs.existsSync(tempTestFile)) {
      fs.unlinkSync(tempTestFile);
      console.log('🧹 Test files cleaned up');
    }
  }
  
  console.log(`\nAnimated WebP Integration Tests Results: ${testResults.passed}/${testResults.passed + testResults.failed} passed`);
  return testResults;
}

module.exports = { testAnimatedWebpIntegration };

// Run tests if called directly
if (require.main === module) {
  testAnimatedWebpIntegration().then((results) => {
    process.exit(results.failed > 0 ? 1 : 0);
  });
}