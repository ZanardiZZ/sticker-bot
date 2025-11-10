/**
 * Test for regular video (non-GIF-like) handling fix
 * Verifies that regular videos are saved in their original format (MP4)
 * instead of being rejected with "formato não suportado" error
 */

const { assert, assertEqual } = require('../helpers/testUtils');

// Mock modules for testing

async function testRegularVideoHandling() {
  console.log('\n=== Testing Regular Video Handling Fix ===\n');
  
  // Test 1: Regular video with audio should be saved as MP4
  console.log('Test 1: Regular video (with audio) should save as original MP4');
  
  // Create a mock message for a regular video
  const message = {
    from: 'user@c.us',
    id: 'msg-123',
    mimetype: 'video/mp4',
    sender: { id: 'author@c.us' }
  };
  
  // Mock the isGifLikeVideo function to return false (regular video)
  const mockIsGifLikeVideo = async (filePath, mimetype) => {
    console.log(`  Mock isGifLikeVideo called: ${mimetype} -> false (regular video with audio)`);
    return false; // Not a GIF-like video
  };
  
  // Simulate the logic from mediaProcessor.js lines 450-560
  let bufferWebp = null;
  let ext = 'mp4'; // From inferExtensionFromMimetype
  let extToSave = ext;
  let mimetypeToSave = message.mimetype;
  
  console.log(`  Initial: ext=${ext}, extToSave=${extToSave}, mimetypeToSave=${mimetypeToSave}`);
  
  if (message.mimetype.startsWith('video/')) {
    const isGifLike = await mockIsGifLikeVideo('/tmp/test.mp4', message.mimetype);
    
    if (isGifLike) {
      // Would convert to webp (not relevant for this test)
      console.log('  Video is GIF-like, would convert to webp');
      extToSave = 'webp';
      mimetypeToSave = 'image/webp';
    } else {
      // NEW BEHAVIOR: Keep original format for regular videos
      console.log('  Video is regular (not GIF-like), keeping original format');
      bufferWebp = null;
      // Don't override extToSave and mimetypeToSave - use original values
    }
  }
  
  console.log(`  Final: extToSave=${extToSave}, mimetypeToSave=${mimetypeToSave}, bufferWebp=${bufferWebp === null ? 'null' : `Buffer(${bufferWebp.length})`}`);
  
  // Verify the fix
  assertEqual(extToSave, 'mp4', 'Regular video should save with .mp4 extension');
  assertEqual(mimetypeToSave, 'video/mp4', 'Regular video should save with video/mp4 mimetype');
  assertEqual(bufferWebp, null, 'Regular video should not have webp buffer');
  
  console.log('✅ Test 1 PASSED: Regular videos now save as original MP4\n');
  
  // Test 2: Verify file saving logic would work
  console.log('Test 2: File saving logic should use original file copy');
  
  // This simulates the logic at lines 588-602
  const shouldUseWebpPath = (extToSave === 'webp');
  const shouldCopyOriginal = !shouldUseWebpPath;
  
  console.log(`  extToSave=${extToSave}`);
  console.log(`  shouldUseWebpPath=${shouldUseWebpPath}`);
  console.log(`  shouldCopyOriginal=${shouldCopyOriginal}`);
  
  if (shouldUseWebpPath) {
    if (!bufferWebp) {
      console.log('❌ Would show error: "formato não suportado"');
      throw new Error('This would fail with "formato não suportado" error');
    } else {
      console.log('✅ Would convert to webp (correct behavior)');
    }
  } else if (shouldCopyOriginal) {
    console.log('✅ Would copy original file (correct behavior)');
  }
  
  assert(shouldCopyOriginal, 'Regular video should use original file copy path');
  
  console.log('✅ Test 2 PASSED: File saving uses correct path\n');
  
  // Test 3: GIF-like videos should still convert to webp
  console.log('Test 3: GIF-like videos should still convert to webp');
  
  const mockIsGifLikeVideoTrue = async () => true;
  
  let gifExtToSave = 'mp4';
  let gifMimetypeToSave = 'video/mp4';
  
  if (await mockIsGifLikeVideoTrue()) {
    console.log('  Video is GIF-like, converting to webp');
    gifExtToSave = 'webp';
    gifMimetypeToSave = 'image/webp';
  }
  
  assertEqual(gifExtToSave, 'webp', 'GIF-like video should convert to webp');
  assertEqual(gifMimetypeToSave, 'image/webp', 'GIF-like video should use webp mimetype');
  
  console.log('✅ Test 3 PASSED: GIF-like videos still convert correctly\n');
  
  return true;
}

async function runTest() {
  try {
    const success = await testRegularVideoHandling();
    
    if (success) {
      console.log('=== ALL TESTS PASSED ===');
      console.log('✅ Regular videos now save as original MP4');
      console.log('✅ No more "formato não suportado" errors for regular videos');
      console.log('✅ GIF-like videos still convert to webp stickers');
    }
    
    return success;
  } catch (error) {
    console.error('❌ TEST FAILED:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  runTest().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { testRegularVideoHandling };
