/**
 * Test to validate the correct parameter fix for video sending
 * The bug was that sendFile was being called with 'media' as filename instead of actual filename
 */

const fs = require('fs');
const path = require('path');

// Mock client that validates the correct parameters
class VideoParameterTestClient {
  constructor() {
    this.calls = [];
  }

  async sendFile(chatId, filePath, filename, caption = '', ...otherParams) {
    const call = { 
      method: 'sendFile', 
      chatId, 
      filePath, 
      filename,
      caption,
      otherParams: otherParams.length > 0 ? otherParams : undefined
    };
    this.calls.push(call);
    
    console.log(`[VideoParameterTestClient] sendFile called:`);
    console.log(`  - chatId: ${chatId}`);
    console.log(`  - filePath: ${filePath}`);
    console.log(`  - filename: ${filename}`);
    console.log(`  - caption: ${caption}`);
    
    return Promise.resolve();
  }

  async reply(chatId, message, replyId) {
    const call = { method: 'reply', chatId, message: message.substring(0, 50) + '...', replyId };
    this.calls.push(call);
    return Promise.resolve();
  }

  async sendText(chatId, message) {
    const call = { method: 'sendText', chatId, message };
    this.calls.push(call);
    return Promise.resolve();
  }
}

// Import the function to test
const { sendMediaAsOriginal } = require('../../commands/media.js');

async function testVideoParameterFix() {
  console.log('\n=== Testing Video Parameter Fix ===');
  
  // Create a test video file
  const testVideoPath = path.join(__dirname, 'test-video-param-fix.mp4');
  fs.writeFileSync(testVideoPath, Buffer.from('fake video content for parameter testing'));
  
  const mockMedia = {
    id: 1330,
    file_path: testVideoPath,
    mimetype: 'video/mp4',
    description: 'Test video for parameter fix',
  };
  
  const client = new VideoParameterTestClient();
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
    console.log(`\n--- Analyzing sendFile call parameters ---`);
    console.log(`chatId: '${sendFileCall.chatId}'`);
    console.log(`filePath: '${sendFileCall.filePath}'`);
    console.log(`filename: '${sendFileCall.filename}'`);
    console.log(`caption: '${sendFileCall.caption}'`);
    
    // Check if filename is actually a filename and not a type string
    const actualFileName = path.basename(testVideoPath);
    
    if (sendFileCall.filename === actualFileName) {
      console.log('✅ SUCCESS: sendFile uses correct filename parameter');
      console.log(`✅ Filename: '${sendFileCall.filename}'`);
      return true;
    } else if (sendFileCall.filename === 'media' || sendFileCall.filename === 'video') {
      console.error('❌ FAIL: sendFile still uses incorrect type string as filename');
      console.error(`❌ Expected: '${actualFileName}'`);
      console.error(`❌ Got: '${sendFileCall.filename}'`);
      return false;
    } else {
      console.error(`❌ FAIL: sendFile uses unexpected filename: '${sendFileCall.filename}'`);
      console.error(`❌ Expected: '${actualFileName}'`);
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

async function testDifferentVideoTypesParameters() {
  console.log('\n=== Testing Different Video Types Parameters ===');
  
  const videoTypes = [
    { mimetype: 'video/mp4', ext: '.mp4' },
    { mimetype: 'video/webm', ext: '.webm' },
    { mimetype: 'video/avi', ext: '.avi' },
    { mimetype: 'video/mov', ext: '.mov' },
  ];
  
  let allPassed = true;
  
  for (const videoType of videoTypes) {
    console.log(`\n--- Testing ${videoType.mimetype} ---`);
    
    const testPath = path.join(__dirname, `test-video-param${videoType.ext}`);
    fs.writeFileSync(testPath, Buffer.from('test video content'));
    
    const mockMedia = {
      id: 1000,
      file_path: testPath,
      mimetype: videoType.mimetype,
      description: `Test ${videoType.mimetype}`,
    };
    
    const client = new VideoParameterTestClient();
    
    try {
      await sendMediaAsOriginal(client, 'user@c.us', mockMedia);
      
      const sendFileCalls = client.calls.filter(call => call.method === 'sendFile');
      
      if (sendFileCalls.length > 0) {
        const expectedFilename = path.basename(testPath);
        const actualFilename = sendFileCalls[0].filename;
        
        if (actualFilename === expectedFilename) {
          console.log(`✅ ${videoType.mimetype}: Uses correct filename '${actualFilename}'`);
        } else {
          console.error(`❌ ${videoType.mimetype}: Wrong filename parameter`);
          console.error(`  Expected: '${expectedFilename}'`);
          console.error(`  Got: '${actualFilename}'`);
          allPassed = false;
        }
      } else {
        console.error(`❌ ${videoType.mimetype}: No sendFile calls made`);
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

async function runAllParameterTests() {
  console.log('🧪 Video Parameter Fix Validation');
  console.log('This test validates that sendFile is called with correct parameters');
  console.log('Bug: sendFile was called with "media" string instead of actual filename');
  
  try {
    const test1Passed = await testVideoParameterFix();
    const test2Passed = await testDifferentVideoTypesParameters();
    
    console.log('\n=== FINAL RESULTS ===');
    
    if (test1Passed && test2Passed) {
      console.log('✅ ALL PARAMETER TESTS PASSED');
      console.log('✅ sendFile is called with correct filename parameter');
      console.log('✅ Videos should now be sent correctly to users');
    } else {
      console.error('❌ SOME PARAMETER TESTS FAILED');
      console.error('❌ sendFile parameter usage needs to be fixed');
    }
    
  } catch (error) {
    console.error('Parameter test execution failed:', error);
  }
}

runAllParameterTests();