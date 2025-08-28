/**
 * Duplicates model - handles duplicate media detection and management
 */

const fs = require('fs');
const { db, dbHandler } = require('../connection');

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

/**
 * Find duplicate media based on visual hash
 * Returns groups of duplicated media
 * @param {number} limit - Maximum number of duplicate groups to return
 * @returns {Promise<object[]>} Array of duplicate groups
 */
async function findDuplicateMedia(limit = 50) {
  const sql = `
    SELECT 
      hash_visual,
      COUNT(*) as duplicate_count,
      GROUP_CONCAT(id) as media_ids,
      MIN(timestamp) as first_created,
      MAX(timestamp) as last_created
    FROM media 
    WHERE hash_visual IS NOT NULL 
    GROUP BY hash_visual 
    HAVING COUNT(*) > 1
    ORDER BY duplicate_count DESC, first_created DESC
    LIMIT ?
  `;
  
  const rows = await dbHandler.all(sql, [limit]);
  
  // Parse the grouped results
  return rows.map(row => ({
    hash_visual: row.hash_visual,
    duplicate_count: row.duplicate_count,
    media_ids: row.media_ids.split(',').map(id => parseInt(id)),
    first_created: row.first_created,
    last_created: row.last_created
  }));
}

/**
 * Get detailed information about duplicate media group
 * @param {string} hashVisual - Visual hash to get details for
 * @returns {Promise<object[]>} Array of media details
 */
async function getDuplicateMediaDetails(hashVisual) {
  const sql = `
    SELECT 
      m.id,
      m.chat_id,
      m.group_id,
      m.sender_id,
      m.file_path,
      m.mimetype,
      m.timestamp,
      m.description,
      m.nsfw,
      m.count_random,
      c.display_name
    FROM media m
    LEFT JOIN contacts c ON c.sender_id = m.sender_id
    WHERE m.hash_visual = ?
    ORDER BY m.timestamp ASC
  `;
  
  return dbHandler.all(sql, [hashVisual]);
}

/**
 * Delete duplicate media (keeps the oldest one)
 * Returns count of deleted records
 * @param {string} hashVisual - Visual hash of duplicates to delete
 * @param {boolean} keepOldest - Whether to keep oldest or newest
 * @returns {Promise<number>} Number of deleted records
 */
async function deleteDuplicateMedia(hashVisual, keepOldest = true) {
  const processDelete = async () => {
    // Get all media with this hash
    const duplicates = await getDuplicateMediaDetails(hashVisual);
    
    if (duplicates.length <= 1) {
      return 0; // No duplicates to delete
    }
    
    // Determine which ones to delete
    const sorted = duplicates.sort((a, b) => 
      keepOldest ? a.timestamp - b.timestamp : b.timestamp - a.timestamp
    );
    
    const toKeep = sorted[0];
    const toDelete = sorted.slice(1);
    
    let deletedCount = 0;
    
    // Use transaction for atomicity
    const operations = [];
    
    for (const media of toDelete) {
      // Delete media_tags associations
      operations.push({
        sql: `DELETE FROM media_tags WHERE media_id = ?`,
        params: [media.id]
      });
      
      // Delete media record
      operations.push({
        sql: `DELETE FROM media WHERE id = ?`,
        params: [media.id]
      });
      
      // Delete file from filesystem if it exists
      if (media.file_path && fs.existsSync(media.file_path)) {
        try {
          fs.unlinkSync(media.file_path);
        } catch (err) {
          console.warn(`Failed to delete file ${media.file_path}:`, err.message);
        }
      }
      
      deletedCount++;
    }
    
    if (operations.length > 0) {
      await dbHandler.transaction(operations);
    }
    
    console.log(`Deleted ${deletedCount} duplicate media files, kept media ID ${toKeep.id}`);
    return deletedCount;
  };

  // Use media queue if available for safety, otherwise run directly
  if (mediaQueue) {
    return mediaQueue.add(processDelete);
  } else {
    return processDelete();
  }
}

/**
 * Delete specific media by IDs (for manual selection)
 * @param {number[]} mediaIds - Array of media IDs to delete
 * @returns {Promise<number>} Number of deleted records
 */
async function deleteMediaByIds(mediaIds) {
  if (!Array.isArray(mediaIds) || mediaIds.length === 0) {
    return 0;
  }
  
  const processDelete = async () => {
    let deletedCount = 0;
    const operations = [];
    
    for (const mediaId of mediaIds) {
      // Get file path before deletion
      const media = await dbHandler.get(`SELECT file_path FROM media WHERE id = ?`, [mediaId]);
      
      if (media) {
        // Delete media_tags associations
        operations.push({
          sql: `DELETE FROM media_tags WHERE media_id = ?`,
          params: [mediaId]
        });
        
        // Delete media record
        operations.push({
          sql: `DELETE FROM media WHERE id = ?`,
          params: [mediaId]
        });
        
        // Delete file from filesystem if it exists
        if (media.file_path && fs.existsSync(media.file_path)) {
          try {
            fs.unlinkSync(media.file_path);
          } catch (err) {
            console.warn(`Failed to delete file ${media.file_path}:`, err.message);
          }
        }
        
        deletedCount++;
      }
    }
    
    if (operations.length > 0) {
      await dbHandler.transaction(operations);
    }
    
    console.log(`Deleted ${deletedCount} media files by ID selection`);
    return deletedCount;
  };

  // Use media queue if available for safety, otherwise run directly
  if (mediaQueue) {
    return mediaQueue.add(processDelete);
  } else {
    return processDelete();
  }
}

/**
 * Get duplicate statistics
 * @returns {Promise<object>} Statistics about duplicates
 */
async function getDuplicateStats() {
  const sql = `
    SELECT 
      COUNT(DISTINCT hash_visual) as duplicate_groups,
      COUNT(*) as total_duplicates,
      SUM(CASE WHEN duplicate_count > 2 THEN duplicate_count - 1 ELSE 1 END) as potential_savings
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