/**
 * Database utility functions for hashing, file processing, etc.
 */

const crypto = require('crypto');
const sharp = require('sharp');
const axios = require('axios');

/**
 * Generates MD5 hash of a buffer
 * @param {Buffer} buffer - Buffer to hash
 * @returns {string} MD5 hash as hex string
 */
function getMD5(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/**
 * Fetches synonyms for a word from WordNet service
 * @param {string} word - Word to find synonyms for
 * @returns {Promise<string[]>} Array of synonym strings
 */
async function getSynonyms(word) {
  try {
    const res = await axios.post('http://localhost:5000/synonyms', { word });
    return res.data.synonyms || [];
  } catch (err) {
    return [];
  }
}

/**
 * Expands tags with synonyms via WordNet+OMW microservice
 * @param {string[]} tags - Array of tag strings
 * @returns {Promise<string[]>} Expanded array with synonyms
 */
async function expandTagsWithSynonyms(tags) {
  const expandedSet = new Set();

  for (const tag of tags) {
    const trimmedTag = tag.trim();
    if (!trimmedTag) continue;
    expandedSet.add(trimmedTag.toLowerCase());

    try {
      const syns = await getSynonyms(trimmedTag);
      syns.forEach(s => expandedSet.add(s.toLowerCase()));
    } catch (e) {
      console.warn(`Falha ao obter sinônimos para tag "${trimmedTag}":`, e);
    }
  }

  return Array.from(expandedSet);
}

/**
 * Generates simple visual hash (resize and md5) of image buffer
 * @param {Buffer} buffer - Image buffer
 * @returns {Promise<string|null>} Visual hash or null if error
 */
async function getHashVisual(buffer) {
  try {
    const small = await sharp(buffer)
      .resize(16, 16, { fit: 'inside' })
      .grayscale()
      .raw()
      .toBuffer();
    return crypto.createHash('md5').update(small).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Checks if file has been processed recently based on lastModified timestamp
 * @param {string} fileName - File name
 * @param {number} lastModified - Last modified timestamp
 * @returns {Promise<boolean>} True if file is already processed
 */
function isFileProcessed(fileName, lastModified) {
  return new Promise((resolve) => {
    const { db } = require('../connection');
    db.get(
      'SELECT last_modified FROM processed_files WHERE file_name = ?',
      [fileName],
      (err, row) => {
        if (err || !row) {
          resolve(false);
        } else {
          resolve(row.last_modified >= lastModified);
        }
      }
    );
  });
}

/**
 * Updates or inserts processed file information
 * @param {string} fileName - File name
 * @param {number} lastModified - Last modified timestamp
 * @returns {Promise<void>}
 */
function upsertProcessedFile(fileName, lastModified) {
  return new Promise((resolve, reject) => {
    const { db } = require('../connection');
    db.run(
      `INSERT OR REPLACE INTO processed_files (file_name, last_modified)
       VALUES (?, ?)`,
      [fileName, lastModified],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

module.exports = {
  getMD5,
  getSynonyms,
  expandTagsWithSynonyms,
  getHashVisual,
  isFileProcessed,
  upsertProcessedFile
};