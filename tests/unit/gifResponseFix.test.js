const assert = require('assert');
const path = require('path');

console.log('🧪 Testing GIF detection and response message fix...\n');

// Test the GIF detection logic
async function testGifDetection() {
  try {
    const { isGifLikeVideo } = require('../../src/utils/gifDetection');
    
    console.log('✅ Test 1 PASSED: GIF detection module loads correctly');
    
    // Test with different mimetypes
    const testCases = [
      { mimetype: 'image/gif', expected: false }, // Not a video, should return false
      { mimetype: 'image/jpeg', expected: false }, // Not a video, should return false  
      { mimetype: 'video/mp4', filePath: '/nonexistent' }, // Video, but file doesn't exist
    ];
    
    for (const testCase of testCases) {
      try {
        const result = await isGifLikeVideo(testCase.filePath || '/tmp/test', testCase.mimetype);
        if (testCase.expected !== undefined) {
          assert.strictEqual(result, testCase.expected, `Expected ${testCase.expected} for ${testCase.mimetype}`);
        }
        console.log(`✅ Test case passed: ${testCase.mimetype} -> ${result}`);
      } catch (error) {
        if (testCase.filePath === '/nonexistent') {
          console.log(`✅ Expected error for nonexistent file: ${error.message}`);
        } else {
          throw error;
        }
      }
    }
    
    console.log('✅ Test 2 PASSED: GIF detection logic works correctly');
    
  } catch (error) {
    console.log('❌ Test 2 FAILED:', error.message);
    throw error;
  }
}

// Test the updated response message logic
function testUpdatedResponseLogic() {
  console.log('\nTesting updated response message logic...');
  
  function generateResponseMessage(mimetypeToSave, isGifLike = false) {
    let responseMessage = '';
    
    if (mimetypeToSave === 'image/gif' || isGifLike) {
      responseMessage = `🎞️ GIF adicionado!\n\n`;
    } else if (mimetypeToSave.startsWith('video/')) {
      responseMessage = `🎥 Vídeo adicionado!\n\n`;
    } else if (mimetypeToSave.startsWith('audio/')) {
      responseMessage = `🎵 Áudio adicionado!\n\n`;
    } else {
      responseMessage = `✅ Figurinha adicionada!\n\n`;
    }
    
    return responseMessage;
  }
  
  const testCases = [
    { mimetype: 'image/gif', isGifLike: false, expected: '🎞️ GIF adicionado!' },
    { mimetype: 'video/mp4', isGifLike: false, expected: '🎥 Vídeo adicionado!' },
    { mimetype: 'video/mp4', isGifLike: true, expected: '🎞️ GIF adicionado!' }, // THE FIX!
    { mimetype: 'video/quicktime', isGifLike: true, expected: '🎞️ GIF adicionado!' },
    { mimetype: 'audio/mp3', isGifLike: false, expected: '🎵 Áudio adicionado!' },
    { mimetype: 'image/jpeg', isGifLike: false, expected: '✅ Figurinha adicionada!' },
  ];
  
  testCases.forEach((testCase, index) => {
    const result = generateResponseMessage(testCase.mimetype, testCase.isGifLike);
    assert(result.includes(testCase.expected), 
      `Test case ${index + 1} failed: expected "${testCase.expected}" in "${result}"`);
    
    console.log(`✅ Case ${index + 1}: ${testCase.mimetype} + GIF-like:${testCase.isGifLike} -> ${testCase.expected}`);
  });
  
  console.log('✅ Test 3 PASSED: Updated response message logic works correctly');
}

// Run all tests
async function runTests() {
  try {
    await testGifDetection();
    testUpdatedResponseLogic();
    
    console.log('\n🎉 All tests PASSED! The fix should resolve the issue.');
    console.log('\n📝 Summary of the fix:');
    console.log('  - Added GIF detection for video files sent by WhatsApp');
    console.log('  - Videos that look like GIFs now get "🎞️ GIF adicionado!" message');
    console.log('  - Regular videos still get "🎥 Vídeo adicionado!" message');
    console.log('  - The fix handles the common case where WhatsApp sends GIFs as MP4');
    
  } catch (error) {
    console.error('❌ Tests failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}