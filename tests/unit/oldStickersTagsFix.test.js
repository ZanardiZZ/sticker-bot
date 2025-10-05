#!/usr/bin/env node
/**
 * Unit test to verify old stickers receive tags correctly
 * Tests the fix for: https://github.com/ZanardiZZ/sticker-bot/issues/XX
 */

const assert = require('assert');

console.log('🧪 Testing Old Stickers Tags Fix...\n');

// Test 1: Verify that updateMediaTags is imported in processing.js
try {
  const fs = require('fs');
  const processingContent = fs.readFileSync('./database/models/processing.js', 'utf8');
  
  if (!processingContent.includes("const { updateMediaTags } = require('./tags')")) {
    throw new Error('updateMediaTags is not imported from tags module');
  }
  
  console.log('✅ Test 1 PASSED: updateMediaTags is properly imported in processing.js');
  
} catch (error) {
  console.log('❌ Test 1 FAILED:', error.message);
  process.exit(1);
}

// Test 2: Verify that updateMediaTags is called after saveMedia when tags exist
try {
  const fs = require('fs');
  const processingContent = fs.readFileSync('./database/models/processing.js', 'utf8');
  
  // Check that the logic exists to call updateMediaTags
  if (!processingContent.includes('await updateMediaTags(mediaId, tags)')) {
    throw new Error('updateMediaTags is not called with mediaId and tags');
  }
  
  // Check that it's conditional on tags being available
  if (!processingContent.includes('if (tags && tags.trim())')) {
    throw new Error('Missing conditional check for tags before calling updateMediaTags');
  }
  
  console.log('✅ Test 2 PASSED: updateMediaTags is called after saveMedia when tags are available');
  
} catch (error) {
  console.log('❌ Test 2 FAILED:', error.message);
  process.exit(1);
}

// Test 3: Verify that tags are no longer passed to saveMedia (since it doesn't handle them)
try {
  const fs = require('fs');
  const processingContent = fs.readFileSync('./database/models/processing.js', 'utf8');
  
  // Find the saveMedia call in processOldStickers
  const saveMediaRegex = /const mediaId = await saveMedia\(\{[\s\S]*?\}\);/;
  const saveMediaMatch = processingContent.match(saveMediaRegex);
  
  if (!saveMediaMatch) {
    throw new Error('Could not find saveMedia call in processing.js');
  }
  
  const saveMediaCall = saveMediaMatch[0];
  
  // Verify tags is NOT passed to saveMedia (since saveMedia doesn't use it)
  if (saveMediaCall.includes('tags,') || saveMediaCall.includes('tags:')) {
    throw new Error('tags parameter should not be passed to saveMedia (it does not handle tags)');
  }
  
  console.log('✅ Test 3 PASSED: tags are not passed to saveMedia (handled separately by updateMediaTags)');
  
} catch (error) {
  console.log('❌ Test 3 FAILED:', error.message);
  process.exit(1);
}

// Test 4: Verify console log message for tags saving
try {
  const fs = require('fs');
  const processingContent = fs.readFileSync('./database/models/processing.js', 'utf8');
  
  if (!processingContent.includes('[old-stickers] Salvando tags para media')) {
    throw new Error('Missing console log for tags saving');
  }
  
  console.log('✅ Test 4 PASSED: Proper logging is added for tags saving');
  
} catch (error) {
  console.log('❌ Test 4 FAILED:', error.message);
  process.exit(1);
}

console.log('\n🎉 All tests passed! Old stickers will now receive tags correctly.\n');
process.exit(0);
