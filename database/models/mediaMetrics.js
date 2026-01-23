/**
 * Media Metrics model - handles media processing metrics tracking
 */

const { db } = require('../connection');

/**
 * Logs a media processing event
 * @param {object} data - Processing data
 * @param {number} data.mediaId - Media ID (can be null for failed processing)
 * @param {number} data.processingStartTs - Start timestamp (seconds)
 * @param {number} data.processingEndTs - End timestamp (seconds)
 * @param {number} data.durationMs - Processing duration in milliseconds
 * @param {string} data.mediaType - Media type (image, video, gif, animated_webp)
 * @param {number} data.fileSizeBytes - File size in bytes
 * @param {boolean} data.success - Whether processing succeeded
 * @returns {Promise<void>}
 */
function logProcessing(data) {
  return new Promise((resolve, reject) => {
    const {
      mediaId = null,
      processingStartTs,
      processingEndTs,
      durationMs,
      mediaType,
      fileSizeBytes = null,
      success = true
    } = data;

    db.run(
      `INSERT INTO media_processing_log
       (media_id, processing_start_ts, processing_end_ts, duration_ms, media_type, file_size_bytes, success)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [mediaId, processingStartTs, processingEndTs, durationMs, mediaType, fileSizeBytes, success ? 1 : 0],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

/**
 * Gets average processing time for the last N seconds
 * @param {number} secondsAgo - Time window in seconds (3600 = 1 hour, 86400 = 1 day)
 * @returns {Promise<number|null>} Average duration in milliseconds, or null if no data
 */
function getAverageProcessingTime(secondsAgo) {
  return new Promise((resolve, reject) => {
    const cutoffTs = Math.floor(Date.now() / 1000) - secondsAgo;

    db.get(
      `SELECT AVG(duration_ms) as avg_duration, COUNT(*) as count
       FROM media_processing_log
       WHERE processing_end_ts >= ? AND success = 1`,
      [cutoffTs],
      (err, row) => {
        if (err) reject(err);
        else if (!row || row.count === 0) resolve(null);
        else resolve(Math.round(row.avg_duration));
      }
    );
  });
}

/**
 * Gets total media storage size in bytes
 * @returns {Promise<number>} Total size in bytes
 */
function getTotalMediaSize() {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT SUM(file_size_bytes) as total_size
       FROM media_processing_log
       WHERE file_size_bytes IS NOT NULL AND success = 1`,
      [],
      (err, row) => {
        if (err) reject(err);
        else resolve(row?.total_size || 0);
      }
    );
  });
}

/**
 * Gets processing stats breakdown by media type
 * @param {number} secondsAgo - Time window in seconds
 * @returns {Promise<Array>} Array of stats per media type
 */
function getProcessingStatsByType(secondsAgo) {
  return new Promise((resolve, reject) => {
    const cutoffTs = Math.floor(Date.now() / 1000) - secondsAgo;

    db.all(
      `SELECT
         media_type,
         COUNT(*) as count,
         AVG(duration_ms) as avg_duration,
         MIN(duration_ms) as min_duration,
         MAX(duration_ms) as max_duration
       FROM media_processing_log
       WHERE processing_end_ts >= ? AND success = 1
       GROUP BY media_type
       ORDER BY count DESC`,
      [cutoffTs],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

module.exports = {
  logProcessing,
  getAverageProcessingTime,
  getTotalMediaSize,
  getProcessingStatsByType
};
