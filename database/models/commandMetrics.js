/**
 * Command Metrics model - handles command usage metrics
 */

const { db } = require('../connection');

/**
 * Gets total command usage count for the last N seconds
 * @param {number} secondsAgo - Time window in seconds (3600 = 1 hour, 86400 = 1 day)
 * @returns {Promise<number>} Total command count
 */
function getCommandCount(secondsAgo) {
  return new Promise((resolve, reject) => {
    const cutoffTs = Math.floor(Date.now() / 1000) - secondsAgo;

    db.get(
      `SELECT SUM(usage_count) as total_count
       FROM command_usage
       WHERE last_used >= ?`,
      [cutoffTs],
      (err, row) => {
        if (err) reject(err);
        else resolve(row?.total_count || 0);
      }
    );
  });
}

/**
 * Gets top commands in the last N seconds
 * @param {number} secondsAgo - Time window in seconds
 * @param {number} limit - Number of top commands to return
 * @returns {Promise<Array>} Array of {command, count}
 */
function getTopCommands(secondsAgo, limit = 5) {
  return new Promise((resolve, reject) => {
    const cutoffTs = Math.floor(Date.now() / 1000) - secondsAgo;

    db.all(
      `SELECT command, SUM(usage_count) as count
       FROM command_usage
       WHERE last_used >= ?
       GROUP BY command
       ORDER BY count DESC
       LIMIT ?`,
      [cutoffTs, limit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

module.exports = {
  getCommandCount,
  getTopCommands
};
