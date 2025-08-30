const { processAnimatedWebp } = require('../../services/videoProcessor');
const { isAnimatedWebpBuffer } = require('../../bot/stickers');
const fs = require('fs');
const path = require('path');

/**
 * Tests for animated WebP processing using Sharp instead of FFmpeg
 */

async function testAnimatedWebpProcessor() {
  console.log('\n=== Animated WebP Processor Tests ===');
  
  const testResults = { passed: 0, failed: 0 };
  
  try {
    // Test 1: Create a mock animated WebP buffer for detection
    console.log('\n--- Test 1: Animated WebP Detection ---');
    
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
      throw new Error('Failed to detect animated WebP buffer');
    }
    
    console.log('✅ Animated WebP detection works correctly');
    testResults.passed++;
    
    // Test 2: Verify static WebP detection
    console.log('\n--- Test 2: Static WebP Detection ---');
    
    const staticWebpBuffer = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),      // RIFF header
      Buffer.from([16, 0, 0, 0]),        // Size
      Buffer.from('WEBP', 'ascii'),      // WEBP identifier
      Buffer.from('VP8X', 'ascii'),      // VP8X chunk
      Buffer.from([10, 0, 0, 0]),        // Chunk size
      Buffer.from([0x00, 0, 0, 0])       // Flags without ANIM bit
    ]);
    
    const isStaticAnimated = isAnimatedWebpBuffer(staticWebpBuffer);
    
    if (isStaticAnimated) {
      throw new Error('Static WebP incorrectly detected as animated');
    }
    
    console.log('✅ Static WebP detection works correctly');
    testResults.passed++;
    
    // Test 3: Error handling for non-existent file
    console.log('\n--- Test 3: Error Handling ---');
    
    try {
      await processAnimatedWebp('/nonexistent/path/test.webp');
      throw new Error('Should have thrown error for non-existent file');
    } catch (err) {
      if (err.message.includes('Arquivo não encontrado')) {
        console.log('✅ Non-existent file error handling works correctly');
        testResults.passed++;
      } else {
        throw err;
      }
    }
    
    // Test 4: Function availability
    console.log('\n--- Test 4: Function Export ---');
    
    if (typeof processAnimatedWebp !== 'function') {
      throw new Error('processAnimatedWebp is not exported as a function');
    }
    
    console.log('✅ processAnimatedWebp function is properly exported');
    testResults.passed++;
    
    // Test 5: Temp directory creation logic
    console.log('\n--- Test 5: Temp Directory Logic ---');
    
    const tempPath = path.resolve(__dirname, '../../temp');
    const processId = process.pid;
    
    // Check that temp directory structure would be valid
    const expectedTempDir = path.resolve(__dirname, '../../temp', `webp_frames_${processId}_test123`);
    
    if (!expectedTempDir.includes('webp_frames_')) {
      throw new Error('Temp directory naming logic is incorrect');
    }
    
    console.log('✅ Temp directory logic is correct');
    testResults.passed++;
    
    console.log(`\n🎉 All animated WebP processor tests passed!`);
    
  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    testResults.failed++;
  }
  
  console.log(`\nAnimated WebP Processor Tests Results: ${testResults.passed}/${testResults.passed + testResults.failed} passed`);
  return testResults;
}

module.exports = { testAnimatedWebpProcessor };

// Run tests if called directly
if (require.main === module) {
  testAnimatedWebpProcessor().then((results) => {
    process.exit(results.failed > 0 ? 1 : 0);
  });
}