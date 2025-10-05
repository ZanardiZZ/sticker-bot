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
      nsfw = 0,
      extractedText = null
    } = mediaData;

    db.run(
      `INSERT INTO media (chat_id, group_id, sender_id, file_path, mimetype, timestamp, 
                          description, hash_visual, hash_md5, nsfw, extracted_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [chatId, groupId, senderId, filePath, mimetype, timestamp, description, hashVisual, hashMd5, nsfw, extractedText],
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
  findById,
  getRandomMedia,
  getMediaWithLowestRandomCount,
  incrementRandomCount,
  updateMediaDescription,
  countMedia,
  findByHashMd5,
  getTop10Media,
  findMediaByTheme
};
