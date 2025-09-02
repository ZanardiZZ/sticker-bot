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

/**
 * Generates dHash (difference hash) of an image buffer
 * @param {Buffer} buffer - Image buffer
 * @returns {Promise<string|null>} dHash hex string or null if error
 */
async function getDHash(buffer) {
  try {
    // Resize to 9x8 (dHash needs n+1 x n)
    const small = await sharp(buffer)
      .resize(9, 8, { fit: 'inside' })
      .grayscale()
      .raw()
      .toBuffer();
    // Calculate dHash
    let hash = '';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const left = small[row * 9 + col];
        const right = small[row * 9 + col + 1];
        hash += left > right ? '1' : '0';
      }
    }
    // Convert binary string to hex
    return parseInt(hash, 2).toString(16).padStart(16, '0');
  } catch {
    return null;
  }
}

// Mantém o hash visual antigo para compatibilidade
async function getHashVisual(buffer) {
  return getDHash(buffer);
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

/**
 * Parses a SemVer string into components
 * @param {string} versionString - Version string (e.g., "1.2.3-alpha+build.1")
 * @returns {Object} Parsed version components
 */
function parseSemVer(versionString) {
  const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
  const match = versionString.match(semverRegex);
  
  if (!match) {
    throw new Error(`Invalid SemVer string: ${versionString}`);
  }
  
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    preRelease: match[4] || null,
    buildMetadata: match[5] || null,
    raw: versionString
  };
}

/**
 * Compares two SemVer version strings
 * @param {string} version1 - First version string
 * @param {string} version2 - Second version string
 * @returns {number} -1 if version1 < version2, 0 if equal, 1 if version1 > version2
 */
function compareSemVer(version1, version2) {
  const v1 = parseSemVer(version1);
  const v2 = parseSemVer(version2);
  
  // Compare major, minor, patch
  if (v1.major !== v2.major) return v1.major > v2.major ? 1 : -1;
  if (v1.minor !== v2.minor) return v1.minor > v2.minor ? 1 : -1;
  if (v1.patch !== v2.patch) return v1.patch > v2.patch ? 1 : -1;
  
  // Handle pre-release versions
  if (!v1.preRelease && !v2.preRelease) return 0;
  if (!v1.preRelease && v2.preRelease) return 1;
  if (v1.preRelease && !v2.preRelease) return -1;
  
  return v1.preRelease.localeCompare(v2.preRelease);
}

/**
 * Validates if a string is a valid SemVer version
 * @param {string} versionString - Version string to validate
 * @returns {boolean} True if valid SemVer
 */
function isValidSemVer(versionString) {
  try {
    parseSemVer(versionString);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  getMD5,
  getSynonyms,
  expandTagsWithSynonyms,
  getHashVisual,
  getDHash,
  getAnimatedDHashes,
  isFileProcessed,
  upsertProcessedFile,
  parseSemVer,
  compareSemVer,
  isValidSemVer
};
/**
 * Extracts 3 frames (10%, 50%, 90%) from animated image (webp/gif) and returns dHashes
 * @param {Buffer} buffer - Animated image buffer
 * @returns {Promise<string[]|null>} Array of 3 dHashes or null if error
 */
async function getAnimatedDHashes(buffer) {
  try {
    const sharpInstance = sharp(buffer, { animated: true });
    const metadata = await sharpInstance.metadata();
    if (!metadata.pages || metadata.pages < 2) {
      // Not animated, fallback to static dHash
      const hash = await getDHash(buffer);
      return hash ? [hash] : null;
    }
    const totalFrames = metadata.pages;
    const frameIdxs = [
      Math.floor(totalFrames * 0.1),
      Math.floor(totalFrames * 0.5),
      Math.max(0, Math.floor(totalFrames * 0.9) - 1)
    ];
    const hashes = [];
    for (const idx of frameIdxs) {
      const frameBuffer = await sharp(buffer, { animated: true, page: idx })
        .extractFrame(idx)
        .toBuffer();
      const hash = await getDHash(frameBuffer);
      if (hash) hashes.push(hash);
    }
    return hashes.length === 3 ? hashes : null;
  } catch {
    return null;
  }
}