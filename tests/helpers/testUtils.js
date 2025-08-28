/**
 * Test utilities and helpers for unit tests
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

/**
 * Creates a temporary SQLite database for testing
 * @param {string} testName - Name of the test (optional)
 * @returns {object} Object with db instance and cleanup function
 */
function createTestDatabase(testName = 'test') {
  const testDbPath = path.resolve(__dirname, `../temp/${testName}-${uuidv4()}.db`);
  
  // Ensure temp directory exists
  const tempDir = path.dirname(testDbPath);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const db = new sqlite3.Database(testDbPath);
  
  return {
    db,
    path: testDbPath,
    cleanup: () => {
      return new Promise((resolve) => {
        db.close(() => {
          if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
          }
          resolve();
        });
      });
    }
  };
}

/**
 * Creates test tables with the standard schema
 * @param {sqlite3.Database} db - Database instance
 * @returns {Promise<void>}
 */
function createTestTables(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Media table
      db.run(`
        CREATE TABLE media (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id TEXT NOT NULL,
          group_id TEXT,
          sender_id TEXT,
          file_path TEXT NOT NULL,
          mimetype TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          description TEXT,
          hash_visual TEXT,
          hash_md5 TEXT,
          nsfw INTEGER DEFAULT 0,
          count_random INTEGER DEFAULT 0
        )
      `);
      
      // Contacts table
      db.run(`
        CREATE TABLE contacts (
          sender_id TEXT PRIMARY KEY,
          display_name TEXT,
          updated_at INTEGER DEFAULT (strftime('%s','now'))
        )
      `);
      
      // Tags table
      db.run(`
        CREATE TABLE tags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          media_id INTEGER NOT NULL,
          tag TEXT NOT NULL,
          FOREIGN KEY (media_id) REFERENCES media(id)
        )
      `);
      
      // Processed files table
      db.run(`
        CREATE TABLE processed_files (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_hash TEXT NOT NULL UNIQUE,
          file_path TEXT NOT NULL,
          processed_at INTEGER DEFAULT (strftime('%s','now')*1000)
        )
      `);
      
      // Duplicates table
      db.run(`
        CREATE TABLE duplicates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          original_id INTEGER NOT NULL,
          duplicate_id INTEGER NOT NULL,
          similarity_score REAL,
          detected_at INTEGER DEFAULT (strftime('%s','now')*1000),
          FOREIGN KEY (original_id) REFERENCES media(id),
          FOREIGN KEY (duplicate_id) REFERENCES media(id)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

/**
 * Inserts test media data
 * @param {sqlite3.Database} db - Database instance
 * @param {object[]} mediaData - Array of media objects
 * @returns {Promise<number[]>} Array of inserted media IDs
 */
function insertTestMedia(db, mediaData) {
  return new Promise((resolve, reject) => {
    const ids = [];
    let completed = 0;
    
    mediaData.forEach((media, index) => {
      const {
        chatId = `test-chat-${index}`,
        groupId = null,
        senderId = `test-sender-${index}@c.us`,
        filePath = `test-${index}.webp`,
        mimetype = 'image/webp',
        timestamp = Date.now() - (index * 1000),
        description = `Test media ${index}`,
        hashVisual = `hash-visual-${index}`,
        hashMd5 = `hash-md5-${index}`,
        nsfw = 0,
        countRandom = 0
      } = media;
      
      db.run(
        `INSERT INTO media (chat_id, group_id, sender_id, file_path, mimetype, 
                           timestamp, description, hash_visual, hash_md5, nsfw, count_random)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [chatId, groupId, senderId, filePath, mimetype, timestamp, description, hashVisual, hashMd5, nsfw, countRandom],
        function(err) {
          if (err) {
            reject(err);
          } else {
            ids[index] = this.lastID;
            completed++;
            if (completed === mediaData.length) {
              resolve(ids);
            }
          }
        }
      );
    });
  });
}

/**
 * Inserts test contacts data
 * @param {sqlite3.Database} db - Database instance
 * @param {object[]} contactsData - Array of contact objects
 * @returns {Promise<void>}
 */
function insertTestContacts(db, contactsData) {
  return new Promise((resolve, reject) => {
    let completed = 0;
    
    contactsData.forEach((contact) => {
      const {
        senderId,
        displayName = `Test User ${senderId}`,
        updatedAt = Math.floor(Date.now() / 1000)
      } = contact;
      
      db.run(
        `INSERT INTO contacts (sender_id, display_name, updated_at)
         VALUES (?, ?, ?)`,
        [senderId, displayName, updatedAt],
        (err) => {
          if (err) {
            reject(err);
          } else {
            completed++;
            if (completed === contactsData.length) {
              resolve();
            }
          }
        }
      );
    });
  });
}

/**
 * Simple test assertion helper
 * @param {boolean} condition - Condition to test
 * @param {string} message - Error message if assertion fails
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Assert that two values are equal
 * @param {*} actual - Actual value
 * @param {*} expected - Expected value
 * @param {string} message - Error message if assertion fails
 */
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message || `Expected ${expected}, got ${actual}`}`);
  }
}

/**
 * Assert that an array contains specific length
 * @param {Array} array - Array to check
 * @param {number} expectedLength - Expected length
 * @param {string} message - Error message if assertion fails
 */
function assertLength(array, expectedLength, message) {
  if (!Array.isArray(array) || array.length !== expectedLength) {
    throw new Error(`Assertion failed: ${message || `Expected array length ${expectedLength}, got ${Array.isArray(array) ? array.length : 'not an array'}`}`);
  }
}

/**
 * Assert that two arrays are equal by comparing their elements
 * @param {Array} actual - Actual array
 * @param {Array} expected - Expected array
 * @param {string} message - Error message if assertion fails
 */
function assertArrayEquals(actual, expected, message) {
  if (!Array.isArray(actual) || !Array.isArray(expected)) {
    throw new Error(`Assertion failed: ${message || `Both values must be arrays. Got ${typeof actual} and ${typeof expected}`}`);
  }
  
  if (actual.length !== expected.length) {
    throw new Error(`Assertion failed: ${message || `Array lengths differ. Expected ${expected.length} elements, got ${actual.length} elements`}`);
  }
  
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(`Assertion failed: ${message || `Arrays differ at index ${i}. Expected '${expected[i]}', got '${actual[i]}'`}\nExpected: [${expected.join(', ')}]\nActual: [${actual.join(', ')}]`);
    }
  }
}

/**
 * Sleep utility for testing
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run a test with proper error handling and cleanup
 * @param {string} testName - Name of the test
 * @param {function} testFunction - Test function to run
 * @returns {Promise<object>} Test result object
 */
async function runTest(testName, testFunction) {
  const startTime = Date.now();
  let result = {
    name: testName,
    passed: false,
    error: null,
    duration: 0
  };
  
  try {
    await testFunction();
    result.passed = true;
    console.log(`✅ ${testName} - PASSED`);
  } catch (error) {
    result.error = error;
    result.passed = false;
    console.error(`❌ ${testName} - FAILED: ${error.message}`);
  } finally {
    result.duration = Date.now() - startTime;
  }
  
  return result;
}

/**
 * Run multiple tests and report results
 * @param {string} suiteName - Name of the test suite
 * @param {object[]} tests - Array of {name, fn} test objects
 * @returns {Promise<object>} Suite results
 */
async function runTestSuite(suiteName, tests) {
  console.log(`\n=== ${suiteName} ===`);
  
  const results = {
    name: suiteName,
    total: tests.length,
    passed: 0,
    failed: 0,
    tests: []
  };
  
  for (const test of tests) {
    const testResult = await runTest(test.name, test.fn);
    results.tests.push(testResult);
    
    if (testResult.passed) {
      results.passed++;
    } else {
      results.failed++;
    }
  }
  
  console.log(`\n${suiteName} Results: ${results.passed}/${results.total} passed`);
  
  return results;
}

module.exports = {
  createTestDatabase,
  createTestTables,
  insertTestMedia,
  insertTestContacts,
  assert,
  assertEqual,
  assertLength,
  assertArrayEquals,
  sleep,
  runTest,
  runTestSuite
};