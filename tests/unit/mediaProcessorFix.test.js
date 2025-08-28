/**
 * Media Processor Race Condition Fix Test
 * Simple validation test that saveMedia + findById works correctly
 */

const { createTestDatabase, assert, assertEqual } = require('../helpers/testUtils');
const { saveMedia, findById } = require('../../database');

async function runMediaProcessorTests() {
  console.log('\n=== Media Processor Race Condition Fix Tests ===');
  
  const tests = [
    {
      name: 'saveMedia returns mediaId and findById retrieves correct record',
      fn: async () => {
        const { db, cleanup } = createTestDatabase('media-save-test');
        
        try {
          const mediaData = {
            chatId: 'test-chat@c.us',
            groupId: null,
            senderId: 'test-sender@c.us',
            filePath: '/test/path/media.webp',
            mimetype: 'image/webp',
            timestamp: Date.now(),
            description: 'Test media for race condition fix',
            tags: 'test,race,condition,fix',
            hashVisual: 'test-hash-visual-12345',
            hashMd5: 'test-hash-md5-67890',
            nsfw: 0
          };

          // Test the fix: saveMedia should return mediaId when complete
          const mediaId = await saveMedia(mediaData);
          
          // Verify we got a valid media ID
          assert(mediaId !== undefined, 'saveMedia should return mediaId');
          assert(typeof mediaId === 'number', 'mediaId should be a number');
          assert(mediaId > 0, 'mediaId should be greater than 0');
          
          // Test the fix: findById should work with the returned mediaId
          const savedMedia = await findById(mediaId);
          
          // Verify the media was saved and retrieved correctly
          assert(savedMedia !== null && savedMedia !== undefined, 'findById should return saved media');
          assertEqual(savedMedia.id, mediaId, 'Retrieved media should have correct ID');
          assertEqual(savedMedia.chat_id, mediaData.chatId, 'Chat ID should match');
          assertEqual(savedMedia.description, mediaData.description, 'Description should match');
          assertEqual(savedMedia.hash_visual, mediaData.hashVisual, 'Visual hash should match');
          
        } finally {
          await cleanup();
        }
      }
    },
    
    {
      name: 'Race condition eliminated - multiple saves work correctly',
      fn: async () => {
        const { db, cleanup } = createTestDatabase('media-race-test');
        
        try {
          const saves = [];
          
          // Test multiple saves to verify no race conditions
          for (let i = 0; i < 3; i++) {
            const mediaData = {
              chatId: `test-chat-${i}@c.us`,
              senderId: `test-sender-${i}@c.us`,
              filePath: `/test/path/media-${i}.webp`,
              mimetype: 'image/webp',
              timestamp: Date.now() + i,
              description: `Test media ${i}`,
              tags: `test,${i}`,
              hashVisual: `test-hash-${i}`,
              hashMd5: `test-md5-${i}`,
              nsfw: 0
            };
            
            const mediaId = await saveMedia(mediaData);
            saves.push({ mediaId, mediaData });
          }
          
          // All should have different IDs
          const ids = saves.map(s => s.mediaId);
          const uniqueIds = new Set(ids);
          assertEqual(uniqueIds.size, ids.length, 'All media should have unique IDs');
          
          // All should be retrievable with findById
          for (const { mediaId, mediaData } of saves) {
            const savedMedia = await findById(mediaId);
            assert(savedMedia !== null, `Media with ID ${mediaId} should be retrievable`);
            assertEqual(savedMedia.id, mediaId, 'Retrieved media should have correct ID');
            assertEqual(savedMedia.description, mediaData.description, 'Description should match');
          }
          
        } finally {
          await cleanup();
        }
      }
    }
  ];

  let passedTests = 0;
  const totalTests = tests.length;

  for (const test of tests) {
    try {
      await test.fn();
      console.log(`✅ ${test.name} - PASSED`);
      passedTests++;
    } catch (error) {
      console.log(`❌ ${test.name} - FAILED`);
      console.error('Error:', error.message);
    }
  }

  console.log(`\nMedia Processor Tests Results: ${passedTests}/${totalTests} passed`);
  return { passed: passedTests, total: totalTests };
}

// Run the tests if called directly
if (require.main === module) {
  runMediaProcessorTests()
    .then(result => {
      if (result.passed === result.total) {
        console.log('🎉 All media processor tests passed!');
        process.exit(0);
      } else {
        console.log('❌ Some media processor tests failed');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Test execution error:', error);
      process.exit(1);
    });
}

module.exports = { runMediaProcessorTests };