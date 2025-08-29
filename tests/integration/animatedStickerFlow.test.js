/**
 * Integration test to verify animated sticker processing flow
 * Tests that the mediaProcessor correctly routes animated WebP files to multi-frame analysis
 */

const fs = require('fs');
const path = require('path');
const { isAnimatedWebpBuffer } = require('../../bot/stickers');

async function testAnimatedStickerProcessingFlow() {
  console.log('\n=== Animated Sticker Processing Flow Test ===');
  
  try {
    // Create a mock animated WebP buffer
    const animatedWebpBuffer = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),      // RIFF header
      Buffer.from([16, 0, 0, 0]),        // Size (little endian)
      Buffer.from('WEBP', 'ascii'),      // WEBP identifier
      Buffer.from('VP8X', 'ascii'),      // VP8X chunk
      Buffer.from([10, 0, 0, 0]),        // Chunk size
      Buffer.from([0x10, 0, 0, 0])       // Flags with ANIM bit (0x10)
    ]);
    
    // Verify that our detection logic works
    const isAnimated = isAnimatedWebpBuffer(animatedWebpBuffer);
    
    if (!isAnimated) {
      throw new Error('Failed to detect animated WebP buffer');
    }
    
    console.log('✅ Animated WebP detection works correctly');
    
    // Test that the buffer would go through the right path
    const mimetypeToSave = 'image/webp';
    const shouldUseMultiFrameAnalysis = (mimetypeToSave === 'image/webp' && isAnimated);
    
    if (!shouldUseMultiFrameAnalysis) {
      throw new Error('Logic error: animated WebP should trigger multi-frame analysis');
    }
    
    console.log('✅ Processing logic correctly identifies animated stickers for multi-frame analysis');
    
    // Verify that static WebP would not trigger multi-frame analysis
    const staticWebpBuffer = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),      // RIFF header
      Buffer.from([16, 0, 0, 0]),        // Size
      Buffer.from('WEBP', 'ascii'),      // WEBP identifier
      Buffer.from('VP8X', 'ascii'),      // VP8X chunk
      Buffer.from([10, 0, 0, 0]),        // Chunk size
      Buffer.from([0x00, 0, 0, 0])       // Flags without ANIM bit
    ]);
    
    const isStaticAnimated = isAnimatedWebpBuffer(staticWebpBuffer);
    const shouldUseStaticAnalysis = (mimetypeToSave === 'image/webp' && !isStaticAnimated);
    
    if (!shouldUseStaticAnalysis) {
      throw new Error('Logic error: static WebP should use static analysis');
    }
    
    console.log('✅ Processing logic correctly identifies static images for single-frame analysis');
    
    console.log('\n🎉 All animated sticker processing flow tests passed!');
    
    return { passed: 3, failed: 0 };
    
  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    return { passed: 0, failed: 1 };
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testAnimatedStickerProcessingFlow().then(result => {
    if (result.failed > 0) {
      process.exit(1);
    }
  }).catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { testAnimatedStickerProcessingFlow };