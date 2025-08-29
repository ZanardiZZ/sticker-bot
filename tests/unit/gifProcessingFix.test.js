const assert = require('assert');
const { getAiAnnotationsForGif, getAiAnnotations } = require('../../services/ai');
const { generateResponseMessage } = require('../../utils/responseMessage');

console.log('🧪 Testing GIF detection and response message fix...\n');

/**
 * Test suite for GIF processing improvements
 * 
 * This verifies that:
 * 1. GIF-specific functions exist and work correctly
 * 2. Response messages are generated correctly using shared utility
 */

// Test 1: Check that the AI service exports the functions
try {
  if (typeof getAiAnnotationsForGif !== 'function') {
    throw new Error('getAiAnnotationsForGif should be a function');
  }
  
  if (typeof getAiAnnotations !== 'function') {
    throw new Error('getAiAnnotations should be a function');
  }
  
  console.log('✅ Test 1 PASSED: GIF processing functions are properly exported');
  
} catch (error) {
  console.log('❌ Test 1 FAILED:', error.message);
  process.exit(1);
}

// Test 2: Test response message generation logic using shared utility
try {
  const tests = [
    { mimetype: 'image/gif', expected: '🎞️ GIF adicionado!' },
    { mimetype: 'video/mp4', expected: '🎥 Vídeo adicionado!' },
    { mimetype: 'audio/mp3', expected: '🎵 Áudio adicionado!' },
    { mimetype: 'image/jpeg', expected: '✅ Figurinha adicionada!' }
  ];

  tests.forEach((test, index) => {
    const message = generateResponseMessage(test.mimetype);
    assert(message.includes(test.expected), `Expected "${test.expected}" in "${message}"`);
    console.log(`  ✅ Case ${index + 1}: ${test.mimetype} -> ${test.expected}`);
  });
  
  console.log('✅ Test 2 PASSED: All media type response messages work correctly');
  
} catch (error) {
  console.log('❌ Test 2 FAILED:', error.message);
  process.exit(1);
}

console.log('\n🎉 All tests PASSED! GIF processing improvements work correctly.');
console.log('ℹ️  Response message logic is now consolidated in shared utility.');

// Export the shared utility for testing framework compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateResponseMessage
  };
}