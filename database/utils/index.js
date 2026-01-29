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
 * 1024-bit version using 32x32 grid for maximum precision
 * @param {Buffer} buffer - Image buffer
 * @returns {Promise<string|null>} dHash hex string or null if error
 */
async function getDHash(buffer) {
  try {
    // Resize to 33x32 (dHash needs n+1 x n for horizontal comparison)
    const small = await sharp(buffer)
      .resize(33, 32, { fit: 'inside' })
      .grayscale()
      .raw()
      .toBuffer();

    // Calculate dHash (compare adjacent pixels horizontally)
    let hash = '';
    for (let row = 0; row < 32; row++) {
      for (let col = 0; col < 32; col++) {
        const left = small[row * 33 + col];
        const right = small[row * 33 + col + 1];
        hash += left > right ? '1' : '0';
      }
    }

    // Convert binary string to hex (1024 bits = 256 hex chars)
    return BigInt('0b' + hash).toString(16).padStart(256, '0');
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

/**
 * Calculates Hamming distance between two single hex hash strings
 * Supports both 64-bit (16 chars) and 1024-bit (256 chars) hashes
 * @param {string} hash1 - First hex hash string (16 or 256 chars)
 * @param {string} hash2 - Second hex hash string (16 or 256 chars)
 * @returns {number} Number of differing bits
 */
function hammingDistanceSingle(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) {
    // Return max distance based on hash length
    return hash1 && hash1.length === 256 ? 1024 : 64;
  }

  try {
    // Convert hex strings to BigInt for XOR operation
    const val1 = BigInt('0x' + hash1);
    const val2 = BigInt('0x' + hash2);

    // XOR to find differing bits
    let xor = val1 ^ val2;

    // Count set bits (popcount)
    let distance = 0;
    while (xor > 0n) {
      distance += Number(xor & 1n);
      xor >>= 1n;
    }

    return distance;
  } catch (err) {
    // Return max distance based on hash length
    return hash1.length === 256 ? 1024 : 64;
  }
}

/**
 * Checks if a hash is degenerate (all zeros, all ones, or mostly uniform)
 * These hashes cause false positive matches
 * Supports both 64-bit (10-16 chars) and 1024-bit (200-256 chars) hashes
 * @param {string} hash - Hex hash string
 * @returns {boolean}
 */
function isDegenerateHash(hash) {
  if (!hash) return true;
  const h = hash.toLowerCase();
  const len = h.length;

  // Determine hash type based on length
  const is64Bit = len >= 10 && len <= 16;
  const is1024Bit = len >= 200 && len <= 256;

  if (!is64Bit && !is1024Bit) return true;

  // All zeros or all ones
  const allZeros = '0'.repeat(len);
  const allOnes = 'f'.repeat(len);
  if (h === allZeros || h === allOnes) return true;

  // Check if hash is mostly zeros (>90% zeros indicates very low entropy)
  const zeroCount = (h.match(/0/g) || []).length;
  const zeroRatio = zeroCount / len;
  if (zeroRatio > 0.9) return true;

  // Check if hash is mostly ones (>90% 'f's indicates very low entropy)
  const onesCount = (h.match(/f/g) || []).length;
  const onesRatio = onesCount / len;
  if (onesRatio > 0.9) return true;

  // Count unique characters - if too few unique chars relative to length, it's degenerate
  // For 1024-bit hashes, we need at least 4 unique chars (very low bar)
  // For 64-bit hashes, we need at least 3 unique chars
  const uniqueChars = new Set(h).size;
  const uniqueThreshold = is1024Bit ? 4 : 3;
  if (uniqueChars <= uniqueThreshold) return true;

  // Check for repeating patterns (e.g., "0000000000000000..." or "ababababab...")
  // Split into chunks and check if they're all the same
  const chunkSize = is1024Bit ? 32 : 4;
  const chunks = [];
  for (let i = 0; i < len; i += chunkSize) {
    chunks.push(h.slice(i, i + chunkSize));
  }

  // If all chunks are identical, it's degenerate
  const uniqueChunks = new Set(chunks);
  if (uniqueChunks.size === 1) return true;

  // Not degenerate
  return false;
}

/**
 * Calculates Hamming distance between two hash strings
 * Supports both single hashes and multi-frame hashes (separated by :)
 * Supports both 64-bit (16 chars) and 1024-bit (256 chars) hashes
 * @param {string} hash1 - First hash string (single or multi-frame)
 * @param {string} hash2 - Second hash string (single or multi-frame)
 * @returns {number} Minimum Hamming distance found between frames
 */
function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2) {
    return 1024; // Max distance if invalid
  }

  // Split multi-frame hashes and filter out degenerate frames
  // Support both 16-char (64-bit) and 256-char (1024-bit) hashes
  const frames1 = hash1.split(':').filter(h => {
    const len = h ? h.length : 0;
    return h && (len === 16 || len === 256) && !isDegenerateHash(h);
  });
  const frames2 = hash2.split(':').filter(h => {
    const len = h ? h.length : 0;
    return h && (len === 16 || len === 256) && !isDegenerateHash(h);
  });

  // If no valid frames, return max distance
  if (frames1.length === 0 || frames2.length === 0) {
    // Determine max distance from hash length
    const maxBits = (hash1.length > 20 || hash2.length > 20) ? 1024 : 64;
    return maxBits;
  }

  // For single frame hashes, compare directly
  if (frames1.length === 1 && frames2.length === 1) {
    return hammingDistanceSingle(frames1[0], frames2[0]);
  }

  const maxBits = frames1[0].length === 256 ? 1024 : 64;
  const threshold = Math.floor(maxBits * 0.1); // 10% difference = 90% similarity

  // For multi-frame comparison, use more robust logic to prevent false positives
  // Case 1: Single-frame vs Multi-frame (e.g., static image vs GIF)
  if (frames1.length === 1 || frames2.length === 1) {
    const singleFrame = frames1.length === 1 ? frames1[0] : frames2[0];
    const multiFrames = frames1.length === 1 ? frames2 : frames1;

    // Count how many frames are similar to the single frame
    let similarFrameCount = 0;
    let bestDistance = maxBits;
    const distances = [];

    for (const frame of multiFrames) {
      const dist = hammingDistanceSingle(singleFrame, frame);
      distances.push(dist);
      if (dist < bestDistance) {
        bestDistance = dist;
      }
      if (dist <= threshold) {
        similarFrameCount++;
      }
      // Early exit on exact match
      if (dist === 0) return 0;
    }

    // Require majority of frames to be similar (>50%) to avoid false positives
    // e.g., if GIF has 5 frames, need at least 3 to be similar to static image
    const requiredSimilarFrames = Math.ceil(multiFrames.length / 2);

    // DEBUG LOG
    if (similarFrameCount > 0) {
      console.log(`[HammingDistance] Static vs Animated comparison:
  Total frames: ${multiFrames.length}
  Similar frames (≤${threshold}): ${similarFrameCount}
  Required frames: ${requiredSimilarFrames}
  Best distance: ${bestDistance}
  All distances: ${distances.join(', ')}
  Single frame hash: ${singleFrame.substring(0, 32)}...
  Result: ${similarFrameCount >= requiredSimilarFrames ? 'DUPLICATE' : 'DIFFERENT'}`);
    }

    if (similarFrameCount >= requiredSimilarFrames) {
      return bestDistance;
    } else {
      // Not enough similar frames - likely different content
      return maxBits;
    }
  }

  // Case 2: Multi-frame vs Multi-frame (e.g., GIF vs GIF)
  // Count matching frame pairs
  let matchingPairs = 0;
  let bestDistance = maxBits;

  for (const f1 of frames1) {
    for (const f2 of frames2) {
      const dist = hammingDistanceSingle(f1, f2);
      if (dist < bestDistance) {
        bestDistance = dist;
      }
      if (dist <= threshold) {
        matchingPairs++;
      }
      // Early exit on exact match
      if (dist === 0) return 0;
    }
  }

  // Require at least 2 matching frame pairs to consider it a duplicate
  // This prevents single-frame coincidences in complex animations
  if (matchingPairs >= 2) {
    return bestDistance;
  } else {
    return maxBits;
  }
}

/**
 * Validates if a hash is valid (not null, not degenerate, correct size)
 * @param {string} hash - Hash string to validate
 * @param {boolean} allowMultiFrame - Allow multi-frame hashes (separated by :)
 * @returns {boolean} True if hash is valid
 */
function isValidHash(hash, allowMultiFrame = true) {
  if (!hash || typeof hash !== 'string') return false;

  // Multi-frame hash check
  if (allowMultiFrame && hash.includes(':')) {
    const frames = hash.split(':');
    return frames.every(frame => isValidHash(frame, false));
  }

  // Single hash validation
  // Allow flexible lengths to account for leading zeros being stripped
  // 64-bit hashes: 10-16 chars (some leading zeros might be missing)
  // 1024-bit hashes: 200-256 chars (same reason)
  const is64Bit = hash.length >= 10 && hash.length <= 16;
  const is1024Bit = hash.length >= 200 && hash.length <= 256;

  if (!is64Bit && !is1024Bit) return false;

  // Check if it's hex
  if (!/^[0-9a-f]+$/i.test(hash)) return false;

  // Check if it's degenerate
  if (isDegenerateHash(hash)) return false;

  return true;
}

/**
 * Validates hash integrity by comparing file hash vs database hash
 * @param {string} filePath - Path to media file
 * @param {string} dbHashMd5 - MD5 hash from database
 * @param {string} dbHashVisual - Visual hash from database
 * @returns {Promise<object>} Integrity status
 */
async function validateHashIntegrity(filePath, dbHashMd5, dbHashVisual) {
  const fs = require('fs');

  const result = {
    valid: true,
    md5Match: null,
    visualHashMatch: null,
    fileHashMd5: null,
    fileHashVisual: null,
    errors: []
  };

  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      result.valid = false;
      result.errors.push('File does not exist');
      return result;
    }

    // Read file
    const buffer = await fs.promises.readFile(filePath);

    // Calculate MD5
    const fileHashMd5 = getMD5(buffer);
    result.fileHashMd5 = fileHashMd5;
    result.md5Match = fileHashMd5 === dbHashMd5;

    // Calculate visual hash (only for images)
    try {
      const metadata = await sharp(buffer).metadata();
      if (metadata.format) {
        // Try to generate PNG buffer for hash
        let pngBuffer;
        if (metadata.pages && metadata.pages > 1) {
          // Animated - use first frame
          pngBuffer = await sharp(buffer, { animated: true, page: 0 }).png().toBuffer();
        } else {
          pngBuffer = await sharp(buffer).png().toBuffer();
        }

        const fileHashVisual = await getHashVisual(pngBuffer);
        result.fileHashVisual = fileHashVisual;

        if (dbHashVisual) {
          result.visualHashMatch = fileHashVisual === dbHashVisual;
        }
      }
    } catch (err) {
      result.errors.push(`Failed to calculate visual hash: ${err.message}`);
    }

    // Overall validity check
    if (result.md5Match === false) {
      result.valid = false;
      result.errors.push('MD5 hash mismatch - file modified after save');
    }

    if (result.visualHashMatch === false) {
      result.valid = false;
      result.errors.push('Visual hash mismatch - file modified after save');
    }

  } catch (err) {
    result.valid = false;
    result.errors.push(`Validation error: ${err.message}`);
  }

  return result;
}

/**
 * Recalculates hashes for a media file and updates database
 * @param {number} mediaId - Media ID
 * @param {string} filePath - Path to media file
 * @param {boolean} dryRun - If true, only check without updating
 * @returns {Promise<object>} Recalculation result
 */
async function recalculateHashForMedia(mediaId, filePath, dryRun = false) {
  const fs = require('fs');
  const { dbHandler } = require('../connection');

  const result = {
    mediaId,
    updated: false,
    md5Updated: false,
    visualHashUpdated: false,
    oldHashMd5: null,
    newHashMd5: null,
    oldHashVisual: null,
    newHashVisual: null,
    errors: []
  };

  try {
    // Get current hashes from database
    const media = await dbHandler.get(
      'SELECT hash_md5, hash_visual FROM media WHERE id = ?',
      [mediaId]
    );

    if (!media) {
      result.errors.push('Media not found in database');
      return result;
    }

    result.oldHashMd5 = media.hash_md5;
    result.oldHashVisual = media.hash_visual;

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      result.errors.push('File does not exist');
      return result;
    }

    // Read file
    const buffer = await fs.promises.readFile(filePath);

    // Calculate new MD5
    const newHashMd5 = getMD5(buffer);
    result.newHashMd5 = newHashMd5;
    result.md5Updated = newHashMd5 !== media.hash_md5;

    // Calculate new visual hash (only for images)
    let newHashVisual = null;
    try {
      const metadata = await sharp(buffer).metadata();
      if (metadata.format) {
        let pngBuffer;
        if (metadata.pages && metadata.pages > 1) {
          // Animated - use first frame
          pngBuffer = await sharp(buffer, { animated: true, page: 0 }).png().toBuffer();
        } else {
          pngBuffer = await sharp(buffer).png().toBuffer();
        }

        newHashVisual = await getHashVisual(pngBuffer);
        result.newHashVisual = newHashVisual;
        result.visualHashUpdated = newHashVisual !== media.hash_visual;
      }
    } catch (err) {
      result.errors.push(`Failed to calculate visual hash: ${err.message}`);
    }

    // Update database if not dry run and hashes changed
    if (!dryRun && (result.md5Updated || result.visualHashUpdated)) {
      const updates = [];
      const params = [];

      if (result.md5Updated) {
        updates.push('hash_md5 = ?');
        params.push(newHashMd5);
      }

      if (result.visualHashUpdated && newHashVisual) {
        updates.push('hash_visual = ?');
        params.push(newHashVisual);
      }

      params.push(mediaId);

      const sql = `UPDATE media SET ${updates.join(', ')} WHERE id = ?`;
      await dbHandler.run(sql, params);

      result.updated = true;
      console.log(`[HashIntegrity] Updated hashes for media ${mediaId}`);
    }

  } catch (err) {
    result.errors.push(`Recalculation error: ${err.message}`);
  }

  return result;
}

module.exports = {
  getMD5,
  getSynonyms,
  expandTagsWithSynonyms,
  getHashVisual,
  getDHash,
  getAnimatedDHashes,
  hammingDistance,
  isDegenerateHash,
  isFileProcessed,
  upsertProcessedFile,
  parseSemVer,
  compareSemVer,
  isValidSemVer,
  isValidHash,
  validateHashIntegrity,
  recalculateHashForMedia
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