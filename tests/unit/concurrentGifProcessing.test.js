/**
 * Concurrent GIF Processing Tests
 * Tests for concurrent processing issues that cause NaN duration errors
 */

const path = require('path');
const fs = require('fs');
const { processGif } = require('../../services/videoProcessor');
const { createTestDatabase, createTestTables, runTest, assert, assertEqual } = require('../helpers/testUtils');

// Mock test data
const mockGifPath = '/tmp/test.gif';
const mockGifPath2 = '/tmp/test2.gif';
const mockGifPath3 = '/tmp/test3.gif';

// Helper to create a mock GIF file for testing
function createMockGifFile(filePath) {
  const tempDir = '/tmp';
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // Write a minimal GIF header to make it recognizable
  fs.writeFileSync(filePath, Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])); // GIF89a header
  return filePath;
}

function cleanupMockFiles() {
  try {
    [mockGifPath, mockGifPath2, mockGifPath3].forEach(filePath => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
  } catch (err) {
    // Ignore cleanup errors
  }
}

const tests = [
  {
    name: 'processGif - handles concurrent processing without NaN duration errors',
    fn: async () => {
      // Create multiple mock GIF files
      createMockGifFile(mockGifPath);
      createMockGifFile(mockGifPath2);
      createMockGifFile(mockGifPath3);
      
      try {
        // Process multiple GIFs concurrently to test for race conditions
        const promises = [
          processGif(mockGifPath),
          processGif(mockGifPath2),
          processGif(mockGifPath3)
        ];
        
        const results = await Promise.all(promises);
        
        // All results should be objects
        results.forEach((result, index) => {
          assert(result && typeof result === 'object', `Result ${index + 1} should be an object`);
          assert(typeof result.description === 'string', `Result ${index + 1} should have description string`);
          assert(Array.isArray(result.tags), `Result ${index + 1} should have tags array`);
          
          // Ensure no error messages contain "NaN"
          assert(!result.description.includes('NaN'), `Result ${index + 1} should not contain NaN in description: ${result.description}`);
        });
        
      } finally {
        cleanupMockFiles();
      }
    }
  },

  {
    name: 'processGif - validates duration values properly',
    fn: async () => {
      createMockGifFile(mockGifPath);
      
      try {
        const result = await processGif(mockGifPath);
        
        assert(result && typeof result === 'object', 'Result should be an object');
        assert(typeof result.description === 'string', 'Result should have description string');
        assert(Array.isArray(result.tags), 'Result should have tags array');
        
        // Should not contain NaN-related errors
        assert(!result.description.toLowerCase().includes('nan'), 'Description should not mention NaN');
        assert(!result.description.includes('Invalid duration'), 'Description should not mention invalid duration');
        
      } finally {
        cleanupMockFiles();
      }
    }
  },

  {
    name: 'processGif - handles high concurrency load',
    fn: async () => {
      // Create 5 mock GIF files
      const gifPaths = [];
      for (let i = 0; i < 5; i++) {
        const filePath = `/tmp/test_concurrent_${i}.gif`;
        createMockGifFile(filePath);
        gifPaths.push(filePath);
      }
      
      try {
        // Process 5 GIFs simultaneously
        const promises = gifPaths.map(filePath => processGif(filePath));
        
        const results = await Promise.all(promises);
        
        // All results should be valid
        results.forEach((result, index) => {
          assert(result && typeof result === 'object', `Result ${index + 1} should be an object`);
          assert(typeof result.description === 'string', `Result ${index + 1} should have description string`);
          assert(Array.isArray(result.tags), `Result ${index + 1} should have tags array`);
          
          // Should not contain error messages about NaN or invalid durations
          assert(!result.description.includes('NaN'), `Result ${index + 1} should not contain NaN: ${result.description}`);
          assert(!result.description.includes('Invalid duration specification'), `Result ${index + 1} should not contain invalid duration error: ${result.description}`);
        });
        
      } finally {
        // Cleanup all test files
        gifPaths.forEach(filePath => {
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (err) {
            // Ignore cleanup errors
          }
        });
      }
    }
  }
];

module.exports = { tests };