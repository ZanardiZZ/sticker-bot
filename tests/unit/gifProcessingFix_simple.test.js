const assert = require('assert');
const { generateResponseMessage } = require('../../utils/responseMessage');

console.log('🧪 Testing GIF Processing Improvements...\n');

// Test 1: Check that the AI service exports the new function
try {
  const { getAiAnnotationsForGif, getAiAnnotations } = require('../../services/ai');
  
  if (typeof getAiAnnotationsForGif !== 'function') {
    throw new Error('getAiAnnotationsForGif is not a function');
  }
  
  if (typeof getAiAnnotations !== 'function') {
    throw new Error('getAiAnnotations is not a function');
  }
  
  console.log('✅ Test 1 PASSED: GIF processing functions are properly exported');
  
} catch (error) {
  console.log('❌ Test 1 FAILED:', error.message);
  process.exit(1);
}

// Test 2: Validate response message logic using shared utility
try {
  // Test GIF message
  const gifMessage = generateResponseMessage('image/gif');
  assert.strictEqual(gifMessage, '🎞️ GIF adicionado!\n\n');
  
  // Test video message
  const videoMessage = generateResponseMessage('video/mp4');
  assert.strictEqual(videoMessage, '🎥 Vídeo adicionado!\n\n');
  
  // Test audio message
  const audioMessage = generateResponseMessage('audio/mp3');
  assert.strictEqual(audioMessage, '🎵 Áudio adicionado!\n\n');
  
  // Test regular image message
  const imageMessage = generateResponseMessage('image/jpeg');
  assert.strictEqual(imageMessage, '✅ Figurinha adicionada!\n\n');
  
  console.log('✅ Test 2 PASSED: All media type response messages work correctly');
  
} catch (error) {
  console.log('❌ Test 2 FAILED:', error.message);
  process.exit(1);
}

// Test 3: Check that videoProcessor has the improved prompts
try {
  const fs = require('fs');
  const videoProcessorContent = fs.readFileSync('./services/videoProcessor.js', 'utf8');
  
  // Check that the GIF prompt mentions it's a GIF/meme and not a video
  if (videoProcessorContent.includes('Este é um GIF/meme, NÃO um vídeo')) {
    console.log('✅ Test 3 PASSED: GIF prompts properly distinguish GIFs from videos');
  } else {
    throw new Error('GIF-specific prompts not found in videoProcessor.js');
  }
  
} catch (error) {
  console.log('❌ Test 3 FAILED:', error.message);
  process.exit(1);
}

// Test 4: Check that mediaProcessor uses different messages for different media types
try {
  const fs = require('fs');
  const mediaProcessorContent = fs.readFileSync('./bot/mediaProcessor.js', 'utf8');
  
  // Check that it uses the shared utility function
  if (mediaProcessorContent.includes('generateResponseMessage')) {
    console.log('✅ Test 4 PASSED: MediaProcessor uses shared generateResponseMessage utility');
  } else {
    throw new Error('generateResponseMessage utility not found in mediaProcessor.js');
  }
  
} catch (error) {
  console.log('❌ Test 4 FAILED:', error.message);
  process.exit(1);
}

console.log('\n🎉 All tests PASSED! GIF processing improvements are working correctly.');
console.log('\n📝 Summary of changes:');
console.log('  - GIFs now show "🎞️ GIF adicionado!" instead of "✅ Figurinha adicionada!"');
console.log('  - Videos show "🎥 Vídeo adicionado!" message');  
console.log('  - Audio files show "🎵 Áudio adicionado!" message');
console.log('  - Regular images still show "✅ Figurinha adicionada!"');
console.log('  - GIF analysis prompts emphasize it\'s a GIF/meme, not a video');
console.log('  - Added getAiAnnotationsForGif() function for GIF-specific analysis');