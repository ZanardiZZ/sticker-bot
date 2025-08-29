/**
 * Tags model - handles tag-related database operations
 */

const { db } = require('../connection');
const { expandTagsWithSynonyms } = require('../utils');

/**
 * Updates media tags, replacing existing ones
 * @param {number} mediaId - Media ID
 * @param {string} tagsString - Comma-separated tags
 * @returns {Promise<void>}
 */
function updateMediaTags(mediaId, tagsString) {
  return new Promise((resolve, reject) => {
    if (!tagsString || !tagsString.trim()) {
      // Remove all tags if empty
      db.run('DELETE FROM media_tags WHERE media_id = ?', [mediaId], (err) => {
        if (err) reject(err);
        else resolve();
      });
      return;
    }

    const tags = tagsString.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
    
    db.serialize(() => {
      // Start transaction
      db.run('BEGIN TRANSACTION');
      
      // Remove existing tags for this media
      db.run('DELETE FROM media_tags WHERE media_id = ?', [mediaId]);
      
      // Process each tag
      let completed = 0;
      const total = tags.length;
      let hasError = false;
      
      if (total === 0) {
        db.run('COMMIT', (err) => {
          if (err) reject(err);
          else resolve();
        });
        return;
      }
      
      tags.forEach(tagName => {
        // Insert or get tag ID
        db.run(
          'INSERT OR IGNORE INTO tags (name, usage_count) VALUES (?, 0)',
          [tagName],
          function(err) {
            if (err && !hasError) {
              hasError = true;
              db.run('ROLLBACK');
              reject(err);
              return;
            }
            
            // Get tag ID and link to media
            db.get('SELECT id FROM tags WHERE name = ?', [tagName], (err2, tag) => {
              if (err2 && !hasError) {
                hasError = true;
                db.run('ROLLBACK');
                reject(err2);
                return;
              }
              
              if (tag) {
                db.run(
                  'INSERT INTO media_tags (media_id, tag_id) VALUES (?, ?)',
                  [mediaId, tag.id],
                  (err3) => {
                    if (err3 && !hasError) {
                      hasError = true;
                      db.run('ROLLBACK');
                      reject(err3);
                      return;
                    }
                    
                    // Update usage count
                    db.run(
                      'UPDATE tags SET usage_count = usage_count + 1 WHERE id = ?',
                      [tag.id],
                      (err4) => {
                        if (err4 && !hasError) {
                          hasError = true;
                          db.run('ROLLBACK');
                          reject(err4);
                          return;
                        }
                        
                        completed++;
                        if (completed === total && !hasError) {
                          db.run('COMMIT', (commitErr) => {
                            if (commitErr) reject(commitErr);
                            else resolve();
                          });
                        }
                      }
                    );
                  }
                );
              } else {
                completed++;
                if (completed === total && !hasError) {
                  db.run('COMMIT', (commitErr) => {
                    if (commitErr) reject(commitErr);
                    else resolve();
                  });
                }
              }
            });
          }
        );
      });
    });
  });
}

/**
 * Gets tags for a media item
 * @param {number} mediaId - Media ID
 * @returns {Promise<string[]>} Array of tag names
 */
function getTagsForMedia(mediaId) {
  return new Promise((resolve) => {
    db.all(
      `SELECT t.name 
       FROM tags t
       JOIN media_tags mt ON t.id = mt.tag_id
       WHERE mt.media_id = ?
       ORDER BY t.name`,
      [mediaId],
      (err, rows) => {
        if (err) resolve([]);
        else resolve(rows.map(row => row.name));
      }
    );
  });
}

/**
 * Sets exact tags for media (replaces all existing)
 * @param {number} mediaId - Media ID
 * @param {string[]} tagNames - Array of tag names
 * @returns {Promise<void>}
 */
function setMediaTagsExact(mediaId, tagNames) {
  return new Promise((resolve, reject) => {
    const cleanTags = tagNames.map(t => t.trim().toLowerCase()).filter(t => t);
    
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // Remove existing tags
      db.run('DELETE FROM media_tags WHERE media_id = ?', [mediaId]);
      
      if (cleanTags.length === 0) {
        db.run('COMMIT', (err) => {
          if (err) reject(err);
          else resolve();
        });
        return;
      }
      
      let completed = 0;
      let hasError = false;
      
      cleanTags.forEach(tagName => {
        // Insert tag if not exists
        db.run(
          'INSERT OR IGNORE INTO tags (name, usage_count) VALUES (?, 0)',
          [tagName],
          function(err) {
            if (err && !hasError) {
              hasError = true;
              db.run('ROLLBACK');
              reject(err);
              return;
            }
            
            // Get tag ID
            db.get('SELECT id FROM tags WHERE name = ?', [tagName], (err2, tag) => {
              if (err2 && !hasError) {
                hasError = true;
                db.run('ROLLBACK');
                reject(err2);
                return;
              }
              
              if (tag) {
                // Link to media
                db.run(
                  'INSERT INTO media_tags (media_id, tag_id) VALUES (?, ?)',
                  [mediaId, tag.id],
                  (err3) => {
                    completed++;
                    
                    if (err3 && !hasError) {
                      hasError = true;
                      db.run('ROLLBACK');
                      reject(err3);
                      return;
                    }
                    
                    if (completed === cleanTags.length && !hasError) {
                      db.run('COMMIT', (commitErr) => {
                        if (commitErr) reject(commitErr);
                        else resolve();
                      });
                    }
                  }
                );
              } else {
                completed++;
                if (completed === cleanTags.length && !hasError) {
                  db.run('COMMIT', (commitErr) => {
                    if (commitErr) reject(commitErr);
                    else resolve();
                  });
                }
              }
            });
          }
        );
      });
    });
  });
}

/**
 * Searches for similar tags using context-aware intelligent matching
 * @param {string[]} tagCandidates - Array of tag candidates to search for
 * @returns {Promise<object[]>} Array of similar tags with id and name
 */
async function findSimilarTags(tagCandidates) {
  if (!tagCandidates.length) return [];

  const results = [];
  
  for (const originalTag of tagCandidates) {
    // Expand individual tag with its synonyms
    const expandedTags = await expandTagsWithSynonyms([originalTag]);
    
    // Find related matches for the original tag and its synonyms
    const relatedMatches = await findRelatedTagMatches(originalTag, expandedTags);
    
    if (relatedMatches.length === 0) {
      // No matches found, skip this tag
      continue;
    } else if (relatedMatches.length === 1) {
      // Perfect match, use directly
      results.push(relatedMatches[0]);
    } else {
      // Multiple matches - use context to choose the best
      const bestMatch = await selectBestTagByContext(originalTag, relatedMatches, tagCandidates);
      results.push(bestMatch);
    }
  }
  
  return results;
}

/**
 * Finds related tag matches for expanded tags and compound variations
 * @param {string} originalTag - The original tag being searched for  
 * @param {string[]} expandedTags - Array of expanded tag names (synonyms)
 * @returns {Promise<object[]>} Array of matching tags
 */
async function findRelatedTagMatches(originalTag, expandedTags) {
  return new Promise((resolve, reject) => {
    // Find exact matches for synonyms
    const synonymPlaceholders = expandedTags.map(() => 'LOWER(name) = ?').join(' OR ');
    const synonymParams = expandedTags.map(t => t.toLowerCase());
    
    // Find compound tags that contain the original word
    const compoundPlaceholder = 'LOWER(name) LIKE ? AND LOWER(name) != ?';
    const compoundParams = [`%${originalTag.toLowerCase()}%`, originalTag.toLowerCase()];
    
    // Combine queries
    const fullQuery = synonymPlaceholders + ' OR ' + compoundPlaceholder;
    const fullParams = [...synonymParams, ...compoundParams];

    db.all(
      `SELECT id, name FROM tags WHERE ${fullQuery}`,
      fullParams,
      (err, rows) => {
        if (err) reject(err);
        else {
          // Remove duplicates based on ID
          const uniqueRows = rows.filter((tag, index, self) => 
            index === self.findIndex(t => t.id === tag.id)
          );
          resolve(uniqueRows);
        }
      }
    );
  });
}

/**
 * Selects the best tag based on context from other tags using intelligent cross-matching
 * @param {string} originalTag - The original tag being searched for
 * @param {object[]} candidateTags - Array of candidate tag objects
 * @param {string[]} allContextTags - All tags in the current context (from AI)
 * @returns {Promise<object>} The best matching tag
 */
async function selectBestTagByContext(originalTag, candidateTags, allContextTags) {
  // Calculate context scores for each candidate
  const tagScores = await Promise.all(candidateTags.map(async (candidateTag) => {
    let score = 0;
    const candidateLower = candidateTag.name.toLowerCase();
    const originalLower = originalTag.toLowerCase();
    
    // Base score for exact match (lower to allow context override)
    if (candidateLower === originalLower) {
      score += 3;
    }
    
    // Extract compound part of candidate tag (part that's not the original)
    const compoundPart = candidateLower.replace(originalLower, '');
    
    // Cross-match with AI-provided context tags using WordNet synonyms
    for (const contextTag of allContextTags) {
      if (contextTag === originalTag) continue; // Skip self-reference
      
      const contextLower = contextTag.toLowerCase();
      
      // Direct word inclusion - strong boost
      if (candidateLower.includes(contextLower) && candidateLower !== contextLower) {
        score += 20;
      }
      
      // Check if context tag relates to compound part of candidate
      if (compoundPart.length > 2 && contextLower.includes(compoundPart)) {
        score += 15;
      }
      
      // Intelligent semantic matching using WordNet synonyms
      if (compoundPart.length > 2) {
        // Get synonyms for the compound part
        const compoundSynonyms = await expandTagsWithSynonyms([compoundPart]);
        
        // Get synonyms for the context tag  
        const contextSynonyms = await expandTagsWithSynonyms([contextLower]);
        
        // Check for synonym overlap between compound part and context
        const synonymOverlap = compoundSynonyms.some(compSyn => 
          contextSynonyms.some(ctxSyn => compSyn === ctxSyn)
        );
        
        if (synonymOverlap) {
          score += 25; // High score for semantic relationship
        }
        
        // Additional check: if context tag synonyms include the compound part directly
        if (contextSynonyms.includes(compoundPart)) {
          score += 20;
        }
        
        // Check if compound part synonyms include the context tag
        if (compoundSynonyms.includes(contextLower)) {
          score += 20;
        }
      }
    }
    
    // Additional score for compound tags when context is rich
    const isCompoundTag = candidateTag.name.length > originalTag.length;
    const contextTagsCount = allContextTags.length;
    
    if (isCompoundTag && contextTagsCount > 2) {
      score += 2;
    }
    
    return { tag: candidateTag, score };
  }));
  
  // Sort by score and return the best
  tagScores.sort((a, b) => b.score - a.score);
  
  return tagScores[0].tag;
}

module.exports = {
  updateMediaTags,
  getTagsForMedia,
  setMediaTagsExact,
  findSimilarTags
};
