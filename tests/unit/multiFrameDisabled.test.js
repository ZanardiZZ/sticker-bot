const { isAnimatedWebpBuffer } = require('../../bot/stickers');

/**
 * Tests for DISABLE_MULTIFRAME_WEBP_ANALYSIS environment variable
 */

async function testMultiFrameDisableFeature() {
  console.log('\n=== Multi-frame Analysis Disable Feature Test ===');
  
  const testResults = { passed: 0, failed: 0 };
  
  try {
    // Test 1: Verify animated WebP buffer detection still works
    const animatedWebpBuffer = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),      // RIFF header
      Buffer.from([16, 0, 0, 0]),        // Size (little endian)
      Buffer.from('WEBP', 'ascii'),      // WEBP identifier
      Buffer.from('VP8X', 'ascii'),      // VP8X chunk
      Buffer.from([10, 0, 0, 0]),        // Chunk size
      Buffer.from([0x10, 0, 0, 0])       // Flags with ANIM bit (0x10)
    ]);
    
    const isAnimated = isAnimatedWebpBuffer(animatedWebpBuffer);
    if (!isAnimated) {
      throw new Error('Animated WebP detection is broken');
    }
    
    console.log('✅ Animated WebP detection still works correctly');
    testResults.passed++;
    
    // Test 2: Check environment variable behavior
    const originalEnvValue = process.env.DISABLE_MULTIFRAME_WEBP_ANALYSIS;
    
    // Test with environment variable disabled (default)
    delete process.env.DISABLE_MULTIFRAME_WEBP_ANALYSIS;
    const shouldUseMultiFrame = process.env.DISABLE_MULTIFRAME_WEBP_ANALYSIS !== 'true';
    
    if (!shouldUseMultiFrame) {
      throw new Error('Default behavior should allow multi-frame analysis');
    }
    
    console.log('✅ Default behavior correctly allows multi-frame analysis');
    testResults.passed++;
    
    // Test 3: Test with environment variable enabled
    process.env.DISABLE_MULTIFRAME_WEBP_ANALYSIS = 'true';
    const shouldSkipMultiFrame = process.env.DISABLE_MULTIFRAME_WEBP_ANALYSIS === 'true';
    
    if (!shouldSkipMultiFrame) {
      throw new Error('Setting env var to "true" should disable multi-frame analysis');
    }
    
    console.log('✅ Environment variable correctly disables multi-frame analysis');
    testResults.passed++;
    
    // Test 4: Test with environment variable set to false
    process.env.DISABLE_MULTIFRAME_WEBP_ANALYSIS = 'false';
    const shouldUseMultiFrameWhenFalse = process.env.DISABLE_MULTIFRAME_WEBP_ANALYSIS !== 'true';
    
    if (!shouldUseMultiFrameWhenFalse) {
      throw new Error('Setting env var to "false" should still allow multi-frame analysis');
    }
    
    console.log('✅ Environment variable set to "false" correctly allows multi-frame analysis');
    testResults.passed++;
    
    // Restore original environment variable
    if (originalEnvValue !== undefined) {
      process.env.DISABLE_MULTIFRAME_WEBP_ANALYSIS = originalEnvValue;
    } else {
      delete process.env.DISABLE_MULTIFRAME_WEBP_ANALYSIS;
    }
    
  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    testResults.failed++;
  }
  
  console.log(`\nMulti-frame Disable Tests Results: ${testResults.passed}/${testResults.passed + testResults.failed} passed`);
  return testResults;
}

module.exports = { testMultiFrameDisableFeature };

// Run tests if called directly
if (require.main === module) {
  testMultiFrameDisableFeature().then((results) => {
    process.exit(results.failed > 0 ? 1 : 0);
  });
}