#!/usr/bin/env node
/**
 * Manual test script to demonstrate the DISABLE_MULTIFRAME_WEBP_ANALYSIS feature
 * This script simulates the behavior without needing actual WhatsApp integration
 */

require('dotenv').config();
const { isAnimatedWebpBuffer } = require('../../bot/stickers');

function simulateMediaProcessing(bufferWebp, mimetypeToSave) {
  console.log(`\n🔍 Processing media type: ${mimetypeToSave}`);
  
  if (mimetypeToSave === 'image/webp' && isAnimatedWebpBuffer(bufferWebp)) {
    console.log('📝 Detected animated WebP sticker');
    
    // Check if multi-frame analysis is disabled via environment variable
    const disableMultiFrameAnalysis = process.env.DISABLE_MULTIFRAME_WEBP_ANALYSIS === 'true';
    
    if (disableMultiFrameAnalysis) {
      console.log('⚠️ Multi-frame analysis disabled via DISABLE_MULTIFRAME_WEBP_ANALYSIS - using single-frame analysis for animated sticker');
      console.log('✅ Animated sticker processed using single-frame analysis (disabled multi-frame)');
      return { method: 'single-frame', reason: 'disabled-by-env-var' };
    } else {
      console.log('🎬 Processing animated sticker using multi-frame analysis...');
      // Simulate what would happen with multi-frame processing
      console.log('✅ Animated sticker would be processed with multi-frame analysis');
      return { method: 'multi-frame', reason: 'enabled-by-default' };
    }
  } else if (mimetypeToSave === 'image/webp') {
    console.log('📝 Detected static WebP sticker');
    console.log('✅ Static sticker processed using single-frame analysis');
    return { method: 'single-frame', reason: 'static-image' };
  } else {
    console.log('📝 Non-WebP media detected');
    return { method: 'other', reason: 'not-webp' };
  }
}

async function runManualTest() {
  console.log('🧪 Manual Test: DISABLE_MULTIFRAME_WEBP_ANALYSIS Feature\n');
  
  // Create test buffers
  const animatedWebpBuffer = Buffer.concat([
    Buffer.from('RIFF', 'ascii'),      // RIFF header
    Buffer.from([16, 0, 0, 0]),        // Size (little endian)
    Buffer.from('WEBP', 'ascii'),      // WEBP identifier
    Buffer.from('VP8X', 'ascii'),      // VP8X chunk
    Buffer.from([10, 0, 0, 0]),        // Chunk size
    Buffer.from([0x10, 0, 0, 0])       // Flags with ANIM bit (0x10)
  ]);
  
  const staticWebpBuffer = Buffer.concat([
    Buffer.from('RIFF', 'ascii'),      // RIFF header
    Buffer.from([16, 0, 0, 0]),        // Size
    Buffer.from('WEBP', 'ascii'),      // WEBP identifier
    Buffer.from('VP8X', 'ascii'),      // VP8X chunk
    Buffer.from([10, 0, 0, 0]),        // Chunk size
    Buffer.from([0x00, 0, 0, 0])       // Flags without ANIM bit
  ]);
  
  console.log('📋 Current environment setting:');
  console.log(`   DISABLE_MULTIFRAME_WEBP_ANALYSIS = "${process.env.DISABLE_MULTIFRAME_WEBP_ANALYSIS || 'undefined'}"`);
  
  // Test 1: Animated WebP with current environment
  console.log('\n--- Test 1: Animated WebP with current environment ---');
  const result1 = simulateMediaProcessing(animatedWebpBuffer, 'image/webp');
  console.log(`   Result: ${result1.method} (${result1.reason})`);
  
  // Test 2: Static WebP
  console.log('\n--- Test 2: Static WebP ---');
  const result2 = simulateMediaProcessing(staticWebpBuffer, 'image/webp');
  console.log(`   Result: ${result2.method} (${result2.reason})`);
  
  // Test 3: Animated WebP with environment disabled
  console.log('\n--- Test 3: Animated WebP with DISABLE_MULTIFRAME_WEBP_ANALYSIS=true ---');
  const originalValue = process.env.DISABLE_MULTIFRAME_WEBP_ANALYSIS;
  process.env.DISABLE_MULTIFRAME_WEBP_ANALYSIS = 'true';
  const result3 = simulateMediaProcessing(animatedWebpBuffer, 'image/webp');
  console.log(`   Result: ${result3.method} (${result3.reason})`);
  
  // Test 4: Animated WebP with environment enabled
  console.log('\n--- Test 4: Animated WebP with DISABLE_MULTIFRAME_WEBP_ANALYSIS=false ---');
  process.env.DISABLE_MULTIFRAME_WEBP_ANALYSIS = 'false';
  const result4 = simulateMediaProcessing(animatedWebpBuffer, 'image/webp');
  console.log(`   Result: ${result4.method} (${result4.reason})`);
  
  // Restore original environment
  if (originalValue !== undefined) {
    process.env.DISABLE_MULTIFRAME_WEBP_ANALYSIS = originalValue;
  } else {
    delete process.env.DISABLE_MULTIFRAME_WEBP_ANALYSIS;
  }
  
  console.log('\n✅ Manual test completed successfully!');
  console.log('\n💡 To disable multi-frame analysis in production, set:');
  console.log('   DISABLE_MULTIFRAME_WEBP_ANALYSIS=true');
  console.log('\n   This will process all animated WebP stickers as single-frame images,');
  console.log('   bypassing FFmpeg-based multi-frame extraction that can cause resource');
  console.log('   contention when processing multiple media files simultaneously.');
}

if (require.main === module) {
  runManualTest().catch(console.error);
}

module.exports = { simulateMediaProcessing };