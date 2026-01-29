/**
 * Media model - handles media-related database operations
 */

const { db, dbHandler } = require('../connection');
const { hammingDistance } = require('../utils');

/**
 * Retrieves the next available media ID, preferring gaps from deletions
 * @returns {Promise<number>} ID to use for next media insertion
 */
async function getNextAvailableMediaId() {
  try {
    const firstResult = await dbHandler.get('SELECT COUNT(*) as count FROM media WHERE id = 1');
    if (!firstResult || firstResult.count === 0) {
      return 1;
    }

    const gapResult = await dbHandler.get(`
      SELECT MIN(t1.id + 1) as gap_start
      FROM media t1
      LEFT JOIN media t2 ON t1.id + 1 = t2.id
      WHERE t2.id IS NULL
      AND t1.id + 1 <= (SELECT MAX(id) FROM media)
    `);

    if (gapResult && gapResult.gap_start) {
      return gapResult.gap_start;
    }

    const nextResult = await dbHandler.get('SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM media');
    return nextResult && typeof nextResult.next_id === 'number' ? nextResult.next_id : 1;
  } catch (error) {
    console.error('[DB] Erro ao calcular próximo ID disponível:', error);
    throw error;
  }
}

/**
 * Saves media to the database
 * @param {object} mediaData - Media data object
 * @returns {Promise<number>} Media ID
 */
async function saveMedia(mediaData) {
  const {
    chatId,
    groupId = null,
    senderId = null,
    filePath,
    mimetype,
    timestamp,
    description = null,
    hashVisual,
    hashMd5,
    nsfw = 0,
    extractedText = null
  } = mediaData;

  await dbHandler.run('BEGIN IMMEDIATE TRANSACTION');

  try {
    const mediaId = await getNextAvailableMediaId();

    await dbHandler.run(
      `INSERT INTO media (id, chat_id, group_id, sender_id, file_path, mimetype, timestamp,
                          description, hash_visual, hash_md5, nsfw, extracted_text, count_random)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        mediaId,
        chatId,
        groupId,
        senderId,
        filePath,
        mimetype,
        timestamp,
        description,
        hashVisual,
        hashMd5,
        nsfw,
        extractedText
      ]
    );

    await dbHandler.run('COMMIT');
    return mediaId;
  } catch (error) {
    try {
      await dbHandler.run('ROLLBACK');
    } catch (rollbackError) {
      console.error('[DB] Falha ao executar ROLLBACK após erro em saveMedia:', rollbackError);
    }
    throw error;
  }
}

/**
 * Finds media by visual hash
 * @param {string} hashVisual - Visual hash
 * @returns {Promise<object|null>} Media object or null
 */
function findByHashVisual(hashVisual) {
  return new Promise((resolve) => {
    db.get(
      'SELECT * FROM media WHERE hash_visual = ? LIMIT 1',
      [hashVisual],
      (err, row) => {
        resolve(err ? null : row);
      }
    );
  });
}

/**
 * Finds media with similar visual hash using Hamming distance
 * @param {string} hashVisual - Visual hash to compare
 * @param {number} threshold - Maximum Hamming distance to consider similar (default: 102 for 1024-bit, ~90% similarity)
 * @returns {Promise<object|null>} Media object with lowest distance or null
 */
async function findSimilarByHashVisual(hashVisual, threshold = 102) {
  if (!hashVisual) {
    console.log('[DuplicateDetection] Skipping - hashVisual is null/empty');
    return null;
  }

  console.log(`[DuplicateDetection] Starting search for hash: ${hashVisual.substring(0, 40)}... (threshold: ${threshold})`);

  // Skip search if the new hash is degenerate (prevents false positives)
  const { isDegenerateHash } = require('../utils');
  const frames = hashVisual.split(':');
  const validFrames = frames.filter(f => f && !isDegenerateHash(f));

  if (validFrames.length === 0) {
    console.log('[DuplicateDetection] Skipping search - new hash is degenerate');
    return null;
  }

  return new Promise((resolve) => {
    // First try exact match for performance
    db.get(
      'SELECT * FROM media WHERE hash_visual = ? LIMIT 1',
      [hashVisual],
      (err, exactMatch) => {
        if (exactMatch) {
          resolve({ ...exactMatch, _hammingDistance: 0 });
          return;
        }

        // Extract bucket key (first 64 bits = 16 hex chars for LSH)
        const bucketKey = hashVisual.substring(0, 16);

        // Try LSH optimization first (search only in same bucket)
        db.all(
          `SELECT hb.media_id, hb.hash_visual
           FROM hash_buckets hb
           WHERE hb.bucket_key = ?`,
          [bucketKey],
          (err, candidates) => {
            if (err) {
              console.warn('[LSH] Error querying hash_buckets, falling back to full scan:', err.message);
              candidates = [];
            }

            // Fallback to full scan if bucket is empty or doesn't exist
            if (!candidates || candidates.length === 0) {
              db.all(
                'SELECT id, hash_visual FROM media WHERE hash_visual IS NOT NULL LIMIT 1000',
                [],
                (err, fallbackRows) => {
                  processCandidates(fallbackRows || []);
                }
              );
              return;
            }

            // Process bucket candidates
            processCandidates(candidates.map(c => ({ id: c.media_id, hash_visual: c.hash_visual })));
          }
        );

        function processCandidates(rows) {
          if (!rows || rows.length === 0) {
            resolve(null);
            return;
          }

          // Filter out candidates with degenerate hashes BEFORE comparing
          const { isDegenerateHash } = require('../utils');
          const validCandidates = rows.filter(row => {
            if (!row.hash_visual) return false;

            // Check each frame in multi-frame hashes
            const frames = row.hash_visual.split(':');
            const validFrames = frames.filter(f => f && !isDegenerateHash(f));

            // Keep only if at least one valid frame exists
            return validFrames.length > 0;
          });

          if (validCandidates.length === 0) {
            console.log('[DuplicateDetection] All candidates filtered out (degenerate hashes)');
            resolve(null);
            return;
          }

          let bestMatch = null;
          let bestDistance = threshold + 1;

          for (const row of validCandidates) {
            const distance = hammingDistance(hashVisual, row.hash_visual);
            if (distance < bestDistance) {
              bestDistance = distance;
              bestMatch = row;
            }
            // Early exit on very close match
            if (distance <= 2) break;
          }

          if (bestMatch && bestDistance <= threshold) {
            // DEBUG LOG
            console.log(`[DuplicateDetection] DUPLICATE FOUND:
  Media ID: ${bestMatch.id}
  Hamming distance: ${bestDistance}/${threshold} (${Math.round((1024-bestDistance)/1024*100)}% similar)
  New hash: ${hashVisual.substring(0, 40)}...
  Existing hash: ${bestMatch.hash_visual?.substring(0, 40)}...`);

            // Fetch full record for best match
            db.get(
              'SELECT * FROM media WHERE id = ?',
              [bestMatch.id],
              (err, fullRecord) => {
                if (fullRecord) {
                  resolve({ ...fullRecord, _hammingDistance: bestDistance });
                } else {
                  resolve(null);
                }
              }
            );
          } else {
            resolve(null);
          }
        }
      }
    );
  });
}

/**
 * Finds media by MD5 hash
 * @param {string} hashMd5 - MD5 hash string
 * @returns {Promise<object|null>} Media object or null
 */
function findByHashMd5(hashMd5) {
  return new Promise((resolve) => {
    if (!hashMd5) {
      resolve(null);
      return;
    }
    db.get(
      'SELECT * FROM media WHERE hash_md5 = ? LIMIT 1',
      [hashMd5],
      (err, row) => {
        resolve(err ? null : row);
      }
    );
  });
}

/**
 * Finds media by ID
 * @param {number} id - Media ID
 * @returns {Promise<object|null>} Media object or null
 */
function findById(id) {
  return new Promise((resolve) => {
    db.get(
      'SELECT * FROM media WHERE id = ?',
      [id],
      (err, row) => {
        resolve(err ? null : row);
      }
    );
  });
}

/**
 * Gets random media, prioritizing least used ones
 * @returns {Promise<object|null>} Random media object or null
 */
function getRandomMedia() {
  return new Promise((resolve) => {
    // Get media with lowest random count first
    db.get(
      `SELECT * FROM media 
       WHERE nsfw = 0 
       ORDER BY count_random ASC, RANDOM() 
       LIMIT 1`,
      (err, row) => {
        resolve(err ? null : row);
      }
    );
  });
}

/**
 * Gets media with lowest random count for balanced distribution
 * @returns {Promise<object|null>} Media object or null
 */
function getMediaWithLowestRandomCount() {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM media WHERE nsfw = 0 ORDER BY count_random ASC, id ASC LIMIT 1',
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });
}

/**
 * Increments random count for a media item
 * @param {number} id - Media ID
 * @returns {Promise<void>}
 */
function incrementRandomCount(id) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE media SET count_random = count_random + 1 WHERE id = ?',
      [id],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

/**
 * Updates media description
 * @param {number} id - Media ID
 * @param {string} description - New description
 * @returns {Promise<void>}
 */
function updateMediaDescription(id, description) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE media SET description = ? WHERE id = ?',
      [description, id],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

/**
 * Counts total media in database
 * @returns {Promise<number>} Media count
 */
function countMedia() {
  return new Promise((resolve) => {
    db.get(
      'SELECT COUNT(*) as total FROM media',
      (err, row) => {
        resolve(err ? 0 : row.total);
      }
    );
  });
}

function countMediaBySenderWithDb(database, senderId) {
  return new Promise((resolve, reject) => {
    if (!senderId || typeof senderId !== 'string' || !senderId.trim()) {
      resolve(0);
      return;
    }

    // Use the same effective_sender logic as getTop5UsersByStickerCount
    // to ensure consistency between perfil and top5usuarios commands
    database.get(
      `WITH inferred_mapping AS (
         SELECT lid, MAX(pn) AS pn
         FROM (
           SELECT
             CASE
               WHEN sender_id LIKE '%@lid' THEN sender_id
               WHEN chat_id LIKE '%@lid' THEN chat_id
               WHEN group_id LIKE '%@lid' THEN group_id
             END AS lid,
             CASE
               WHEN sender_id LIKE '%@s.whatsapp.net' OR sender_id LIKE '%@c.us' THEN sender_id
               WHEN chat_id LIKE '%@s.whatsapp.net' OR chat_id LIKE '%@c.us' THEN chat_id
               WHEN group_id LIKE '%@s.whatsapp.net' OR group_id LIKE '%@c.us' THEN group_id
             END AS pn
           FROM media
         )
         WHERE lid IS NOT NULL AND pn IS NOT NULL
         GROUP BY lid
       ),
       normalized_media AS (
         SELECT
           m.*,
           COALESCE(m.sender_id, m.chat_id, m.group_id) AS primary_id,
           CASE
             WHEN m.sender_id LIKE '%@lid' THEN m.sender_id
             WHEN m.chat_id LIKE '%@lid' THEN m.chat_id
             WHEN m.group_id LIKE '%@lid' THEN m.group_id
           END AS lid_in_row,
           CASE
             WHEN m.sender_id LIKE '%@s.whatsapp.net' OR m.sender_id LIKE '%@c.us' THEN m.sender_id
             WHEN m.chat_id LIKE '%@s.whatsapp.net' OR m.chat_id LIKE '%@c.us' THEN m.chat_id
             WHEN m.group_id LIKE '%@s.whatsapp.net' OR m.group_id LIKE '%@c.us' THEN m.group_id
           END AS pn_in_row
         FROM media m
       ),
       resolved AS (
         SELECT
           CASE
             WHEN nm.lid_in_row IS NOT NULL THEN
               COALESCE(
                 NULLIF(lm.pn, ''),
                 im.pn,
                 nm.pn_in_row,
                 nm.lid_in_row
               )
             WHEN nm.pn_in_row IS NOT NULL THEN nm.pn_in_row
             ELSE nm.primary_id
           END AS effective_sender
         FROM normalized_media nm
         LEFT JOIN lid_mapping lm ON nm.lid_in_row IS NOT NULL AND lm.lid = nm.lid_in_row
         LEFT JOIN inferred_mapping im ON nm.lid_in_row IS NOT NULL AND im.lid = nm.lid_in_row
         WHERE nm.primary_id IS NOT NULL
           AND nm.primary_id <> ''
           AND NOT (
             COALESCE(nm.sender_id, nm.chat_id) LIKE '%bot%' OR
             (nm.sender_id = nm.chat_id AND nm.group_id IS NULL)
           )
       )
       SELECT COUNT(*) AS total
       FROM resolved
       WHERE effective_sender = ?`,
      [senderId.trim()],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          const total = row && typeof row.total === 'number' ? row.total : 0;
          resolve(total || 0);
        }
      }
    );
  });
}

function countMediaBySender(senderId) {
  return countMediaBySenderWithDb(db, senderId);
}

/**
 * Gets top 10 media by usage
 * @returns {Promise<object[]>} Array of media objects with usage stats
 */
function getTop10Media() {
  return new Promise((resolve) => {
    db.all(
      `SELECT m.*, c.display_name, m.count_random as uso
       FROM media m
       LEFT JOIN contacts c ON m.sender_id = c.sender_id
       ORDER BY m.count_random DESC
       LIMIT 10`,
      (err, rows) => {
        resolve(err ? [] : rows);
      }
    );
  });
}

/**
 * Finds media by theme keywords in description and tags
 * @param {string[]} keywords - Array of keywords to search for
 * @param {number} limit - Maximum number of results to return
 * @returns {Promise<object[]>} Array of media objects
 */
function findMediaByTheme(keywords, limit = 5) {
  return new Promise((resolve) => {
    if (!keywords || !keywords.length) {
      resolve([]);
      return;
    }

    // Build search conditions for keywords
    const searchConditions = [];
    const params = [];

    keywords.forEach(keyword => {
      const lowerKeyword = keyword.toLowerCase();
      // Search in description
      searchConditions.push('LOWER(m.description) LIKE ?');
      params.push(`%${lowerKeyword}%`);
      // Search in tags
      searchConditions.push('LOWER(t.name) LIKE ?');
      params.push(`%${lowerKeyword}%`);
    });

    const whereClause = searchConditions.join(' OR ');

    // Query to find media matching any of the keywords in description or tags
    const query = `
      SELECT DISTINCT m.*
      FROM media m
      LEFT JOIN media_tags mt ON m.id = mt.media_id
      LEFT JOIN tags t ON mt.tag_id = t.id
      WHERE m.nsfw = 0 AND (${whereClause})
      ORDER BY m.count_random ASC, RANDOM()
      LIMIT ?
    `;

    params.push(limit);

    db.all(query, params, (err, rows) => {
      resolve(err ? [] : rows);
    });
  });
}

module.exports = {
  saveMedia,
  findByHashVisual,
  findSimilarByHashVisual,
  findById,
  getRandomMedia,
  getMediaWithLowestRandomCount,
  incrementRandomCount,
  updateMediaDescription,
  countMedia,
  countMediaBySender,
  findByHashMd5,
  getTop10Media,
  findMediaByTheme,
  getNextAvailableMediaId,
  countMediaBySenderWithDb
};
