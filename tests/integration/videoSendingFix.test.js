/**
 * Specific test for video sending issue fix - #id command with video files
 * This test validates that the video parameter fix is working correctly
 */

const fs = require('fs');
const path = require('path');

// Mock client that tracks calls
class VideoTestClient {
  constructor() {
    this.calls = [];
  }

  async sendFile(chatId, filePath, type) {
    const call = { method: 'sendFile', chatId, filePath, type };
    this.calls.push(call);
    
    console.log(`[VideoTestClient] sendFile: type='${type}', file='${path.basename(filePath)}'`);
    return Promise.resolve();
  }

  async reply(chatId, message, replyId) {
    const call = { method: 'reply', chatId, message: message.substring(0, 50) + '...', replyId };
    this.calls.push(call);
    
    console.log(`[VideoTestClient] reply: ${message.substring(0, 30)}...`);
    // client.reply is now used for groups (@g.us) and individual chats (@c.us)
    return Promise.resolve();
  }

  async sendText(chatId, message) {
    const call = { method: 'sendText', chatId, message };
    this.calls.push(call);
    
    console.log(`[VideoTestClient] sendText: ${message.substring(0, 30)}...`);
    return Promise.resolve();
  }
}

// Import the fixed function
const { sendMediaAsOriginal } = require('../../commands/media.js');

async function testVideoSendingFix() {
  console.log('\n=== Testing Video Sending Fix ===');
  
  // Create a test video file
  const testVideoPath = path.join(__dirname, 'test-video-fix.mp4');
  fs.writeFileSync(testVideoPath, Buffer.from('fake video content for testing'));
  
  const mockMedia = {
    id: 1329,
    file_path: testVideoPath,
    mimetype: 'video/mp4',
    description: 'Test video for ID command fix',
  };
  
  const client = new VideoTestClient();
  const chatId = 'user@c.us';
  
  try {
    console.log('--- Testing sendMediaAsOriginal with video file ---');
    
    await sendMediaAsOriginal(client, chatId, mockMedia);
    
    console.log('\n--- Validation ---');
    
    const sendFileCalls = client.calls.filter(call => call.method === 'sendFile');
    
    if (sendFileCalls.length === 0) {
      console.error('❌ FAIL: No sendFile calls made');
      return false;
    }
    
    const sendFileCall = sendFileCalls[0];
    console.log(`sendFile called with type: '${sendFileCall.type}'`);
    
    if (sendFileCall.type === 'media') {
      console.log('✅ SUCCESS: Video now uses "media" parameter');
      console.log('✅ This matches the working pattern from bot/stickers.js');
      console.log('✅ Should fix the silent failure issue with video files');
      return true;
    } else if (sendFileCall.type === 'video') {
      console.error('❌ FAIL: Video still uses "video" parameter');
      console.error('❌ This may cause the silent failure issue');
      return false;
    } else {
      console.error(`❌ FAIL: Unexpected type '${sendFileCall.type}'`);
      return false;
    }
    
  } catch (error) {
    console.error('❌ ERROR during test:', error.message);
    return false;
  } finally {
    // Clean up
    if (fs.existsSync(testVideoPath)) {
      fs.unlinkSync(testVideoPath);
    }
  }
}

async function testDifferentVideoTypes() {
  console.log('\n=== Testing Different Video Types ===');
  
  const videoTypes = [
    { mimetype: 'video/mp4', ext: '.mp4' },
    { mimetype: 'video/webm', ext: '.webm' },
    { mimetype: 'video/avi', ext: '.avi' },
  ];
  
  let allPassed = true;
  
  for (const videoType of videoTypes) {
    console.log(`\n--- Testing ${videoType.mimetype} ---`);
    
    const testPath = path.join(__dirname, `test-video${videoType.ext}`);
    fs.writeFileSync(testPath, Buffer.from('test video content'));
    
    const mockMedia = {
      id: 1000,
      file_path: testPath,
      mimetype: videoType.mimetype,
      description: `Test ${videoType.mimetype}`,
    };
    
    const client = new VideoTestClient();
    
    try {
      await sendMediaAsOriginal(client, 'user@c.us', mockMedia);
      
      const sendFileCalls = client.calls.filter(call => call.method === 'sendFile');
      
      if (sendFileCalls.length > 0 && sendFileCalls[0].type === 'media') {
        console.log(`✅ ${videoType.mimetype}: Uses "media" parameter correctly`);
      } else {
        console.error(`❌ ${videoType.mimetype}: Does not use "media" parameter`);
        allPassed = false;
      }
      
    } catch (error) {
      console.error(`❌ ${videoType.mimetype}: Error: ${error.message}`);
      allPassed = false;
    } finally {
      if (fs.existsSync(testPath)) {
        fs.unlinkSync(testPath);
      }
    }
  }
  
  return allPassed;
}

async function runAllTests() {
  console.log('🧪 Video Sending Fix Validation');
  
  try {
    const test1Passed = await testVideoSendingFix();
    const test2Passed = await testDifferentVideoTypes();
    
    console.log('\n=== FINAL RESULTS ===');
    
    if (test1Passed && test2Passed) {
      console.log('✅ ALL TESTS PASSED');
      console.log('✅ Video sending fix is working correctly');
      console.log('✅ Users should now receive videos when using #id command');
    } else {
      console.error('❌ SOME TESTS FAILED');
      console.error('❌ Video sending fix needs attention');
    }
    
  } catch (error) {
    console.error('Test execution failed:', error);
  }
}

runAllTests();