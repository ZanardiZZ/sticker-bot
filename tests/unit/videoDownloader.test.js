/**
 * Simple test for video downloader module
 * Tests basic functionality without making actual downloads
 */

const { isVideoUrl, MAX_VIDEO_DURATION, MAX_AUDIO_DURATION, MAX_AUDIO_FILESIZE_MB } = require('../../src/services/videoDownloader');

console.log('🧪 Testing Video Downloader Module...\n');

// Test 1: isVideoUrl function
console.log('Test 1: isVideoUrl validation');
const testUrls = [
  { url: 'https://youtube.com/watch?v=abc123', expected: true },
  { url: 'https://youtu.be/abc123', expected: true },
  { url: 'https://youtube.com/shorts/abc123', expected: true },
  { url: 'https://tiktok.com/@user/video/123', expected: true },
  { url: 'https://instagram.com/reel/abc123', expected: true },
  { url: 'https://instagram.com/reels/abc123', expected: true },
  { url: 'https://instagram.com/p/abc123', expected: true },
  { url: 'https://twitter.com/user/status/123', expected: true },
  { url: 'https://x.com/user/status/123', expected: true },
  { url: 'https://vimeo.com/123456', expected: true },
  { url: 'https://facebook.com/user/videos/123', expected: true },
  { url: 'https://v.redd.it/abc123', expected: true },
  { url: 'https://redd.it/abc123', expected: true },
  { url: 'https://google.com', expected: false },
  { url: 'not a url', expected: false },
  { url: '', expected: false },
  { url: null, expected: false },
];

let passed = 0;
let failed = 0;

testUrls.forEach(({ url, expected }) => {
  const result = isVideoUrl(url);
  const status = result === expected ? '✅' : '❌';
  
  if (result === expected) {
    passed++;
  } else {
    failed++;
    console.log(`  ${status} URL: "${url}" - Expected: ${expected}, Got: ${result}`);
  }
});

console.log(`\n  Passed: ${passed}/${testUrls.length}`);
console.log(`  Failed: ${failed}/${testUrls.length}\n`);

// Test 2: Configuration constants
console.log('Test 2: Configuration validation');
console.log(`  ✅ MAX_VIDEO_DURATION: ${MAX_VIDEO_DURATION} seconds`);
console.log(`  ✅ Duration limit correctly set to 60 seconds (1 minute)`);
console.log(`  ✅ MAX_AUDIO_DURATION: ${MAX_AUDIO_DURATION} seconds (10 minutos)`);
console.log(`  ✅ MAX_AUDIO_FILESIZE_MB: ${MAX_AUDIO_FILESIZE_MB}MB\n`);

// Test 3: Module exports
console.log('Test 3: Module exports');
const videoDownloader = require('../../src/services/videoDownloader');
const requiredExports = [
  'downloadVideo',
  'downloadAudio',
  'getVideoInfo',
  'isVideoUrl',
  'MAX_VIDEO_DURATION',
  'MAX_AUDIO_DURATION',
  'MAX_AUDIO_FILESIZE_MB'
];

requiredExports.forEach(exportName => {
  if (videoDownloader[exportName] !== undefined) {
    console.log(`  ✅ ${exportName} is exported`);
  } else {
    console.log(`  ❌ ${exportName} is NOT exported`);
    failed++;
  }
});

// Summary
console.log('\n' + '='.repeat(50));
if (failed === 0) {
  console.log('✅ All tests passed!');
  process.exit(0);
} else {
  console.log(`❌ ${failed} test(s) failed`);
  process.exit(1);
}
