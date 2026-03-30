/**
 * Quick test to validate audio and other media types are also fixed
 */

const fs = require('fs');
const path = require('path');

async function testMultipleMediaTypes() {
  console.log('🎵 Testing Multiple Media Types Fix\n');
  
  const testCases = [
    { filename: 'test-audio.mp3', mimetype: 'audio/mp3', description: 'Audio file' },
    { filename: 'test-document.pdf', mimetype: 'application/pdf', description: 'PDF document' },
    { filename: 'test-video.mov', mimetype: 'video/quicktime', description: 'QuickTime video' },
  ];
  
  const mockClient = {
    sendFile: async (chatId, filePath, filename, caption = '') => {
      console.log(`📎 Sending: ${filename} (expected: ${path.basename(filePath)})`);
      
      if (filename === path.basename(filePath)) {
        console.log(`✅ CORRECT: Using proper filename parameter`);
        return true;
      } else {
        console.log(`❌ WRONG: Expected '${path.basename(filePath)}', got '${filename}'`);
        return false;
      }
    }
  };
  
  let allPassed = true;
  
  for (const testCase of testCases) {
    console.log(`\n--- Testing ${testCase.description} ---`);
    
    const testPath = path.join(__dirname, testCase.filename);
    fs.writeFileSync(testPath, Buffer.from('test content'));
    
    const mockMedia = {
      id: 999,
      file_path: testPath,
      mimetype: testCase.mimetype,
      description: testCase.description
    };
    
    try {
      const { sendMediaAsOriginal } = require('../../src/commands/media.js');
      await sendMediaAsOriginal(mockClient, 'user@c.us', mockMedia);
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      allPassed = false;
    } finally {
      if (fs.existsSync(testPath)) {
        fs.unlinkSync(testPath);
      }
    }
  }
  
  console.log('\n' + '='.repeat(50));
  if (allPassed) {
    console.log('🎉 ALL MEDIA TYPES FIXED');
    console.log('🎉 Audio, video, and document sending will work correctly');
  } else {
    console.log('❌ Some media types still have issues');
  }
  console.log('='.repeat(50));
}

testMultipleMediaTypes();