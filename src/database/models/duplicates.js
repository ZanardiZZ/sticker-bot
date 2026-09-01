/**
 * Duplicates model - handles duplicate media detection and management
 */

const fs = require('fs');
const path = require('path');
const { db, dbHandler } = require('../connection');
const { ROOT_DIR, MEDIA_DIR } = require('../../paths');
const { hammingDistance, getVisualBucketKey, isDegenerateHash } = require('../utils');

// Get media queue for transaction safety
let mediaQueue = null;
try {
  const MediaQueue = require('../../services/mediaQueue');
  if (!mediaQueue) {
    mediaQueue = new MediaQueue({ 
      concurrency: 3, 
      retryAttempts: 5, 
      retryDelay: 1000 
    });
  }
} catch (err) {
  console.warn('[Duplicates] MediaQueue not available, using fallback');
}

// Every dependent row must be removed before an ID can be reused. SQLite's
// foreign-key cascades are not guaranteed to be enabled in every runtime path.
const MEDIA_DEPENDENT_TABLES = [
  'media_tags',
  'pending_edits',
  'media_delete_requests',
  'pack_stickers',
  'message_media_links',
  'media_reactions',
  'hash_buckets',
  'media_processing_log',
  'media_metadata',
  'public_dm_delivery_usage'
];

function buildMediaDeletionOperations(mediaId) {
  return MEDIA_DEPENDENT_TABLES.map((table) => ({
    sql: `DELETE FROM ${table} WHERE media_id = ?`,
    params: [mediaId]
  }));
}

function isComparableVisualHash(hashVisual) {
  if (!hashVisual) return false;
  const frames = hashVisual.split(':');
  const validFrames = frames.filter((frame) => frame && !isDegenerateHash(frame));
  return validFrames.length > 0 && (frames.length <= 1 || validFrames.length >= 2);
}

function visualBucket(hashVisual) {
  return getVisualBucketKey(hashVisual);
}

// Keep the ingestion threshold/semantics, but avoid repeatedly re-validating
// static 1024-bit hashes while scanning the duplicate list.
function visualDistance(hashA, hashB) {
  if (!hashA || !hashB) return 1024;
  if (!hashA.includes(':') && !hashB.includes(':') && hashA.length === 256 && hashB.length === 256) {
    let xor = BigInt(`0x${hashA}`) ^ BigInt(`0x${hashB}`);
    let distance = 0;
    while (xor > 0n) {
      distance += Number(xor & 1n);
      xor >>= 1n;
    }
    return distance;
  }
  return hammingDistance(hashA, hashB);
}

async function loadPerceptualMediaGroup(hashVisual) {
  if (!isComparableVisualHash(hashVisual)) return [];
  const rows = await dbHandler.all(
    `SELECT m.*, c.display_name
     FROM media m
     LEFT JOIN contacts c ON c.sender_id = m.sender_id
     WHERE m.hash_visual IS NOT NULL
       AND (
         CASE WHEN length(m.hash_visual) < 64 THEN m.hash_visual
              ELSE substr(m.hash_visual, 1, 16) || ':' || substr(m.hash_visual, 81, 16) || ':' || substr(m.hash_visual, 97, 16)
         END
       ) = ?
     ORDER BY m.timestamp ASC, m.id ASC`,
    [visualBucket(hashVisual)]
  );
  return rows.filter((row) =>
    isComparableVisualHash(row.hash_visual) && visualDistance(hashVisual, row.hash_visual) <= 102
  );
}

/**
 * Find duplicate media based on visual hash
 * Returns groups of duplicated media
 * @param {number} limit - Maximum number of duplicate groups to return
 * @returns {Promise<object[]>} Array of duplicate groups
 */
async function findDuplicateMedia(limit = 50) {
  const rows = await dbHandler.all(
    `SELECT id, hash_visual, timestamp
     FROM media
     WHERE hash_visual IS NOT NULL
     ORDER BY timestamp ASC, id ASC`
  );
  const comparable = rows.filter((row) => isComparableVisualHash(row.hash_visual));
  const byBucket = new Map();
  for (const row of comparable) {
    const bucket = visualBucket(row.hash_visual);
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    byBucket.get(bucket).push(row);
  }

  const parent = new Map(comparable.map((row) => [row.id, row.id]));
  const find = (id) => {
    let root = parent.get(id);
    while (root !== parent.get(root)) {
      parent.set(root, parent.get(parent.get(root)));
      root = parent.get(root);
    }
    return root;
  };
  const union = (a, b) => {
    const ra = find(a); const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  for (const bucketRows of byBucket.values()) {
    for (let i = 0; i < bucketRows.length; i += 1) {
      for (let j = i + 1; j < bucketRows.length; j += 1) {
        if (visualDistance(bucketRows[i].hash_visual, bucketRows[j].hash_visual) <= 102) {
          union(bucketRows[i].id, bucketRows[j].id);
        }
      }
    }
  }

  const groups = new Map();
  for (const row of comparable) {
    const root = find(row.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(row);
  }
  return [...groups.values()]
    .filter((group) => group.length > 1)
    .sort((a, b) => b.length - a.length || b[b.length - 1].timestamp - a[a.length - 1].timestamp)
    .slice(0, limit)
    .map((group) => {
      const ordered = [...group].sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
      return {
        hash_visual: ordered[0].hash_visual,
        duplicate_count: ordered.length,
        media_ids: ordered.map((row) => row.id),
        first_created: ordered[0].timestamp,
        last_created: ordered[ordered.length - 1].timestamp
      };
    });
}

/**
 * Get detailed information about duplicate media group
 * @param {string} hashVisual - Visual hash to get details for
 * @returns {Promise<object[]>} Array of media details
 */
async function getDuplicateMediaDetails(hashVisual) {
  
  const rows = await loadPerceptualMediaGroup(hashVisual);
  return rows.map((row) => {
    const rawPath = typeof row.file_path === 'string' ? row.file_path.trim() : '';
    const candidates = rawPath
      ? (path.isAbsolute(rawPath)
        ? [rawPath]
        : [path.resolve(ROOT_DIR, rawPath), path.resolve(MEDIA_DIR, rawPath.replace(/^media[\/]/, ''))])
      : [];
    return {
      ...row,
      file_exists: candidates.some((candidate) => fs.existsSync(candidate))
    };
  });
}

/**
 * Delete duplicate media (keeps the oldest one)
 * Returns count of deleted records
 * @param {string} hashVisual - Visual hash of duplicates to delete
 * @param {boolean} keepOldest - Whether to keep oldest or newest
 * @returns {Promise<number>} Number of deleted records
 */
async function deleteDuplicateMedia(hashVisual, keepOldest = true) {
  console.log(`[DELETE_DUPLICATES] Starting deletion for hash: ${hashVisual}, keepOldest: ${keepOldest}`);
  const processDelete = async () => {
    const duplicates = await getDuplicateMediaDetails(hashVisual);
    console.log(`[DELETE_DUPLICATES] Found ${duplicates.length} media files with hash ${hashVisual}`);
    if (duplicates.length <= 1) {
      console.log(`[DELETE_DUPLICATES] No duplicates to delete (count: ${duplicates.length})`);
      return 0;
    }

    const sorted = duplicates.sort((a, b) => keepOldest ? a.timestamp - b.timestamp : b.timestamp - a.timestamp);
    const toKeep = sorted[0];
    const toDelete = sorted.slice(1);
    const batchSize = 50;
    let deletedCount = 0;

    for (let offset = 0; offset < toDelete.length; offset += batchSize) {
      const batch = toDelete.slice(offset, offset + batchSize);
      const operations = [];
      for (const media of batch) {
        operations.push(...buildMediaDeletionOperations(media.id));
        operations.push({ sql: 'DELETE FROM media WHERE id = ?', params: [media.id] });
      }
      console.log(`[DELETE_DUPLICATES] Executing batch ${Math.floor(offset / batchSize) + 1} (${batch.length} media, ${operations.length} operations)`);
      await dbHandler.transaction('deleteDuplicateMedia', operations);
      deletedCount += batch.length;

      for (const media of batch) {
        if (media.file_path && fs.existsSync(media.file_path)) {
          try {
            fs.unlinkSync(media.file_path);
            console.log(`[DELETE_DUPLICATES] Deleted file: ${media.file_path}`);
          } catch (err) {
            console.warn(`[DELETE_DUPLICATES] Failed to delete file ${media.file_path}:`, err.message);
          }
        }
      }
    }

    console.log(`[DELETE_DUPLICATES] Successfully deleted ${deletedCount} duplicate media files, kept media ID ${toKeep.id}`);
    return deletedCount;
  };

  if (mediaQueue) return mediaQueue.add(processDelete);
  return processDelete();
}

/**
 * Delete specific media by IDs (for manual selection)
 * @param {number[]} mediaIds - Array of media IDs to delete
 * @returns {Promise<number>} Number of deleted records
 */
async function deleteMediaByIds(mediaIds) {
  if (!Array.isArray(mediaIds) || mediaIds.length === 0) return 0;

  const processDelete = async () => {
    const pending = [];
    for (const mediaId of mediaIds) {
      const media = await dbHandler.get('SELECT file_path FROM media WHERE id = ?', [mediaId]);
      if (media) pending.push({ id: mediaId, file_path: media.file_path });
    }

    const batchSize = 50;
    let deletedCount = 0;
    for (let offset = 0; offset < pending.length; offset += batchSize) {
      const batch = pending.slice(offset, offset + batchSize);
      const operations = [];
      for (const media of batch) {
        operations.push(...buildMediaDeletionOperations(media.id));
        operations.push({ sql: 'DELETE FROM media WHERE id = ?', params: [media.id] });
      }
      await dbHandler.transaction('deleteMediaByIds', operations);
      deletedCount += batch.length;

      for (const media of batch) {
        if (media.file_path && fs.existsSync(media.file_path)) {
          try {
            fs.unlinkSync(media.file_path);
          } catch (err) {
            const formatError = require('../../utils/formatError');
            console.warn('[DELETE_MEDIA] Failed to delete file %s: %s', media.file_path, formatError(err));
          }
        }
      }
    }

    console.log('Deleted %s media files by ID selection', deletedCount);
    return deletedCount;
  };

  if (mediaQueue) return mediaQueue.add(processDelete);
  return processDelete();
}

/**
 * Get duplicate statistics
 * @returns {Promise<object>} Statistics about duplicates
 */
async function getDuplicateStats() {
  const sql = `
    SELECT 
      COUNT(DISTINCT hash_visual) as duplicate_groups,
      SUM(duplicate_count) as total_duplicates,
      SUM(duplicate_count - 1) as potential_savings
    FROM (
      SELECT hash_visual, COUNT(*) as duplicate_count
      FROM media 
      WHERE hash_visual IS NOT NULL 
      GROUP BY hash_visual 
      HAVING COUNT(*) > 1
    ) as duplicates
  `;
  
  const result = await dbHandler.get(sql);
  return result || { duplicate_groups: 0, total_duplicates: 0, potential_savings: 0 };
}

module.exports = {
  findDuplicateMedia,
  getDuplicateMediaDetails,
  deleteDuplicateMedia,
  deleteMediaByIds,
  getDuplicateStats
};