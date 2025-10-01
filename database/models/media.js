/**
 * Media model - handles media-related database operations
 */

const { db } = require('../connection');

/**
 * Saves media to the database
 * @param {object} mediaData - Media data object
 * @returns {Promise<number>} Media ID
 */
function saveMedia(mediaData) {
  return new Promise((resolve, reject) => {
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
      nsfw = 0
    } = mediaData;

    db.run(
      `INSERT INTO media (chat_id, group_id, sender_id, file_path, mimetype, timestamp, 
                          description, hash_visual, hash_md5, nsfw)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [chatId, groupId, senderId, filePath, mimetype, timestamp, description, hashVisual, hashMd5, nsfw],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
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
 * Finds media items that match provided keywords in description or tags
 * @param {string[]} keywords - Array of keyword strings
 * @param {number} limit - Maximum number of media items to return
 * @returns {Promise<object[]>} Array of matching media objects ordered by relevance
 */
function findMediaByTheme(keywords, limit = 5) {
  return new Promise((resolve) => {
    if (!Array.isArray(keywords) || keywords.length === 0) {
      resolve([]);
      return;
    }

    const cleanKeywords = keywords
      .map(keyword => (typeof keyword === 'string' ? keyword.trim().toLowerCase() : ''))
      .filter(Boolean);

    if (!cleanKeywords.length) {
      resolve([]);
      return;
    }

    const matchExpressions = cleanKeywords.map(() => `MAX(
      CASE
        WHEN LOWER(COALESCE(m.description, '')) LIKE ?
          OR LOWER(COALESCE(t.name, '')) LIKE ?
        THEN 1 ELSE 0
      END
    )`);

    const matchScoreExpression = matchExpressions.join(' + ');

    const sql = `
      SELECT m.*, ${matchScoreExpression} AS match_score
      FROM media m
      LEFT JOIN media_tags mt ON m.id = mt.media_id
      LEFT JOIN tags t ON t.id = mt.tag_id
      WHERE m.nsfw = 0
      GROUP BY m.id
      HAVING match_score > 0
      ORDER BY m.count_random ASC, match_score DESC, m.id ASC
      LIMIT ?
    `;

    const params = [];
    cleanKeywords.forEach(keyword => {
      const pattern = `%${keyword}%`;
      params.push(pattern, pattern);
    });

    const normalizedLimit = Number.isInteger(limit) ? limit : parseInt(limit, 10);
    const parsedLimit = Number.isNaN(normalizedLimit) ? 5 : Math.max(1, normalizedLimit);
    params.push(parsedLimit);

    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('[DB] Erro ao buscar mídia por tema:', err);
        resolve([]);
      } else {
        resolve(rows || []);
      }
    });
  });
}

module.exports = {
  saveMedia,
  findByHashVisual,
  findById,
  getRandomMedia,
  getMediaWithLowestRandomCount,
  incrementRandomCount,
  updateMediaDescription,
  countMedia,
  getTop10Media,
  findMediaByTheme
};