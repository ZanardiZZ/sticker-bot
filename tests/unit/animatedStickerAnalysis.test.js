/**
 * Animated Sticker Analysis Test
 * Tests that animated WebP files are properly detected and processed with multi-frame analysis
 */

const { isAnimatedWebpBuffer } = require('../../bot/stickers');

async function runAnimatedStickerTests() {
  console.log('\n=== Animated Sticker Analysis Tests ===');
  
  const tests = [
    {
      name: 'isAnimatedWebpBuffer should detect animated WebP correctly',
      fn: async () => {
        // Create a mock animated WebP buffer with proper headers
        // WebP format: RIFF + [4 bytes size] + WEBP + VP8X + [flags with ANIM bit]
        const animatedWebpBuffer = Buffer.concat([
          Buffer.from('RIFF', 'ascii'),      // RIFF header
          Buffer.from([16, 0, 0, 0]),        // Size (little endian)
          Buffer.from('WEBP', 'ascii'),      // WEBP identifier
          Buffer.from('VP8X', 'ascii'),      // VP8X chunk
          Buffer.from([10, 0, 0, 0]),        // Chunk size
          Buffer.from([0x10, 0, 0, 0])       // Flags with ANIM bit (0x10)
        ]);
        
        const result = isAnimatedWebpBuffer(animatedWebpBuffer);
        
        if (!result) {
          throw new Error('Should detect animated WebP buffer as animated');
        }
        
        console.log('✅ Animated WebP buffer correctly detected');
      }
    },
    
    {
      name: 'isAnimatedWebpBuffer should not detect static WebP as animated',
      fn: async () => {
        // Create a mock static WebP buffer (no ANIM bit)
        const staticWebpBuffer = Buffer.concat([
          Buffer.from('RIFF', 'ascii'),      // RIFF header
          Buffer.from([16, 0, 0, 0]),        // Size
          Buffer.from('WEBP', 'ascii'),      // WEBP identifier
          Buffer.from('VP8X', 'ascii'),      // VP8X chunk
          Buffer.from([10, 0, 0, 0]),        // Chunk size
          Buffer.from([0x00, 0, 0, 0])       // Flags without ANIM bit
        ]);
        
        const result = isAnimatedWebpBuffer(staticWebpBuffer);
        
        if (result) {
          throw new Error('Should not detect static WebP buffer as animated');
        }
        
        console.log('✅ Static WebP buffer correctly identified as non-animated');
      }
    },
    
    {
      name: 'isAnimatedWebpBuffer should handle invalid buffers gracefully',
      fn: async () => {
        // Test with null, undefined, and too-short buffers
        const testCases = [
          { buffer: null, desc: 'null buffer' },
          { buffer: undefined, desc: 'undefined buffer' },
          { buffer: Buffer.alloc(10), desc: 'too-short buffer' },
          { buffer: Buffer.from('NOTWEBP'), desc: 'invalid format buffer' }
        ];
        
        for (const testCase of testCases) {
          const result = isAnimatedWebpBuffer(testCase.buffer);
          if (result) {
            throw new Error(`Should return false for ${testCase.desc}, but returned true`);
          }
        }
        
        console.log('✅ Invalid buffers handled gracefully');
      }
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test.fn();
      console.log(`✅ ${test.name}`);
      passed++;
    } catch (error) {
      console.log(`❌ ${test.name}: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Animated Sticker Tests: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    throw new Error(`${failed} animated sticker tests failed`);
  }
  
  return { passed, failed };
}

module.exports = { runAnimatedStickerTests };

// Run tests if this file is executed directly
if (require.main === module) {
  runAnimatedStickerTests().catch(console.error);
}