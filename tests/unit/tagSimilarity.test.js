/**
 * Unit tests for tag similarity logic improvements
 * Tests the fix for issue #88 - tag quality with synonyms
 */

// No need for DatabaseHandler import for this test

// No need for DatabaseHandler import for this test

let testDb;

function setupTestData() {
  return new Promise((resolve) => {
    // Create test database in memory
    const sqlite3 = require('sqlite3').verbose();
    testDb = new sqlite3.Database(':memory:');
    
    testDb.serialize(() => {
      // Create tags table
      testDb.run(`CREATE TABLE tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        usage_count INTEGER DEFAULT 0
      )`);
      
      // Insert problematic "Ambiente" tags from the issue
      const environmentTags = [
        'AmbienteAconchegante',
        'AmbienteAoArLivre', 
        'AmbienteClínico',
        'AmbienteDeTrabalho',
        'AmbienteDoméstico',
        'AmbienteEscuro',
        'AmbienteInformal',
        'AmbienteInterno',
        'AmbienteNoturno',
        'AmbienteRústico',
        'Ambiente' // Base word
      ];
      
      let completed = 0;
      environmentTags.forEach(tag => {
        testDb.run('INSERT INTO tags (name, usage_count) VALUES (?, 1)', [tag], () => {
          completed++;
          if (completed === environmentTags.length) {
            resolve();
          }
        });
      });
    });
  });
}

// Mock the improved findSimilarTags logic
function findSimilarTagsImproved(tagCandidates, db) {
  return new Promise((resolve, reject) => {
    if (!tagCandidates.length) {
      resolve([]);
      return;
    }
    
    // Use exact matching instead of LIKE %term% to prevent tag pollution
    const placeholders = tagCandidates.map(() => 'LOWER(name) = ?').join(' OR ');
    const params = tagCandidates.map(t => t.toLowerCase());

    db.all(
      `SELECT id, name FROM tags WHERE ${placeholders} LIMIT 10`,
      params,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

// Mock the old problematic logic for comparison
function findSimilarTagsOld(tagCandidates, db) {
  return new Promise((resolve, reject) => {
    if (!tagCandidates.length) {
      resolve([]);
      return;
    }
    
    // Old problematic logic: substring matching
    const placeholders = tagCandidates.map(() => 'LOWER(name) LIKE ?').join(' OR ');
    const params = tagCandidates.map(t => `%${t.toLowerCase()}%`);

    db.all(
      `SELECT id, name FROM tags WHERE ${placeholders} LIMIT 10`,
      params,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

const tests = [
  {
    name: 'Tag similarity - broad term should find fewer matches',
    fn: async () => {
      await setupTestData();
      
      const searchTerm = ['ambiente'];
      
      const oldResults = await findSimilarTagsOld(searchTerm, testDb);
      const newResults = await findSimilarTagsImproved(searchTerm, testDb);
      
      // Old logic should find many matches (problematic)
      // New logic should find only exact matches
      const oldCount = oldResults.length;
      const newCount = newResults.length;
      
      if (newCount < oldCount) {
        return { success: true, message: `Reduced matches from ${oldCount} to ${newCount} (improvement)` };
      } else if (newCount === 1 && newResults[0].name.toLowerCase() === 'ambiente') {
        return { success: true, message: `Found only exact match: ${newResults[0].name}` };
      } else {
        return { success: false, message: `Expected fewer matches, got old: ${oldCount}, new: ${newCount}` };
      }
    }
  },
  
  {
    name: 'Tag similarity - specific compound word should find exact match only',
    fn: async () => {
      await setupTestData();
      
      const searchTerm = ['AmbienteAconchegante'];
      
      const oldResults = await findSimilarTagsOld(searchTerm, testDb);
      const newResults = await findSimilarTagsImproved(searchTerm, testDb);
      
      // Both should find exactly 1 result for exact match
      if (newResults.length === 1 && newResults[0].name === 'AmbienteAconchegante') {
        return { success: true, message: `Found exact match: ${newResults[0].name}` };
      } else {
        return { success: false, message: `Expected 1 exact match, got ${newResults.length} results` };
      }
    }
  },
  
  {
    name: 'Tag similarity - non-existent tag should find no matches',
    fn: async () => {
      await setupTestData();
      
      const searchTerm = ['NonExistentTag'];
      
      const oldResults = await findSimilarTagsOld(searchTerm, testDb);
      const newResults = await findSimilarTagsImproved(searchTerm, testDb);
      
      // Both should find no results
      if (newResults.length === 0 && oldResults.length === 0) {
        return { success: true, message: 'No matches found for non-existent tag (correct)' };
      } else {
        return { success: false, message: `Expected 0 results, got old: ${oldResults.length}, new: ${newResults.length}` };
      }
    }
  },
  
  {
    name: 'Tag similarity - multiple specific tags should find exact matches only',
    fn: async () => {
      await setupTestData();
      
      const searchTerms = ['AmbienteAconchegante', 'AmbienteClínico'];
      
      const newResults = await findSimilarTagsImproved(searchTerms, testDb);
      
      // Should find exactly 2 results, one for each search term
      const foundNames = newResults.map(r => r.name).sort();
      const expectedNames = searchTerms.sort();
      
      if (newResults.length === 2 && 
          foundNames[0] === expectedNames[0] && 
          foundNames[1] === expectedNames[1]) {
        return { success: true, message: `Found exact matches: ${foundNames.join(', ')}` };
      } else {
        return { success: false, message: `Expected ${expectedNames.join(', ')}, got ${foundNames.join(', ')}` };
      }
    }
  }
];

function cleanup() {
  if (testDb) {
    testDb.close();
  }
}

module.exports = {
  name: 'Tag Similarity Tests',
  tests,
  cleanup
};