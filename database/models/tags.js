/**
 * Tags model - handles tag-related database operations
 */

const { db } = require('../connection');

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

module.exports = {
  updateMediaTags,
  getTagsForMedia,
  setMediaTagsExact
};