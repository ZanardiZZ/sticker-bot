/**
 * Pending edits model - handles approval system for media edits
 */

const { db } = require('../connection');

/**
 * Creates a pending edit request
 * @param {number} mediaId - Media ID
 * @param {number} userId - User requesting the edit
 * @param {string} editType - Type of edit ('tags', 'description', 'nsfw')
 * @param {any} oldValue - Current value
 * @param {any} newValue - Proposed new value
 * @returns {Promise<number>} Pending edit ID
 */
function createPendingEdit(mediaId, userId, editType, oldValue, newValue) {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    const oldValueJson = JSON.stringify(oldValue);
    const newValueJson = JSON.stringify(newValue);

    db.run(
      `INSERT INTO pending_edits (media_id, user_id, edit_type, old_value, new_value, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [mediaId, userId, editType, oldValueJson, newValueJson, timestamp],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

/**
 * Gets pending edits with media and user information
 * @param {string} status - Filter by status ('pending', 'approved', 'rejected')
 * @returns {Promise<Array>} Array of pending edits
 */
function getPendingEdits(status = 'pending') {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT pe.*, 
              m.file_path, m.description as current_description, m.nsfw as current_nsfw,
              u.username as editor_username,
              approver.username as approver_username
       FROM pending_edits pe
       JOIN media m ON pe.media_id = m.id
       JOIN users u ON pe.user_id = u.id
       LEFT JOIN users approver ON pe.approved_by = approver.id
       WHERE pe.status = ?
       ORDER BY pe.created_at DESC`,
      [status],
      (err, rows) => {
        if (err) reject(err);
        else {
          // Parse JSON values
          const edits = rows.map(row => ({
            ...row,
            old_value: JSON.parse(row.old_value),
            new_value: JSON.parse(row.new_value)
          }));
          resolve(edits);
        }
      }
    );
  });
}

/**
 * Gets pending edits for a specific media item
 * @param {number} mediaId - Media ID
 * @returns {Promise<Array>} Array of pending edits for the media
 */
function getPendingEditsForMedia(mediaId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT pe.*, u.username as editor_username
       FROM pending_edits pe
       JOIN users u ON pe.user_id = u.id
       WHERE pe.media_id = ? AND pe.status = 'pending'
       ORDER BY pe.created_at DESC`,
      [mediaId],
      (err, rows) => {
        if (err) reject(err);
        else {
          const edits = rows.map(row => ({
            ...row,
            old_value: JSON.parse(row.old_value),
            new_value: JSON.parse(row.new_value)
          }));
          resolve(edits);
        }
      }
    );
  });
}

/**
 * Votes on a pending edit
 * @param {number} pendingEditId - Pending edit ID
 * @param {number} userId - User voting
 * @param {string} vote - 'approve' or 'reject'
 * @returns {Promise<boolean>} Success
 */
function voteOnEdit(pendingEditId, userId, vote) {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    
    db.run(
      `INSERT OR REPLACE INTO edit_votes (pending_edit_id, user_id, vote, created_at)
       VALUES (?, ?, ?, ?)`,
      [pendingEditId, userId, vote, timestamp],
      function (err) {
        if (err) reject(err);
        else resolve(true);
      }
    );
  });
}

/**
 * Gets vote counts for a pending edit
 * @param {number} pendingEditId - Pending edit ID
 * @returns {Promise<object>} Vote counts {approve: number, reject: number}
 */
function getVoteCounts(pendingEditId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT vote, COUNT(*) as count 
       FROM edit_votes 
       WHERE pending_edit_id = ? 
       GROUP BY vote`,
      [pendingEditId],
      (err, rows) => {
        if (err) reject(err);
        else {
          const counts = { approve: 0, reject: 0 };
          rows.forEach(row => {
            counts[row.vote] = row.count;
          });
          resolve(counts);
        }
      }
    );
  });
}

/**
 * Approves or rejects a pending edit
 * @param {number} pendingEditId - Pending edit ID
 * @param {number} approverId - User approving/rejecting
 * @param {string} status - 'approved' or 'rejected'
 * @param {string} reason - Optional reason for rejection
 * @returns {Promise<boolean>} Success
 */
function approvePendingEdit(pendingEditId, approverId, status, reason = null) {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    
    db.run(
      `UPDATE pending_edits 
       SET status = ?, approved_by = ?, approved_at = ?, reason = ?
       WHERE id = ?`,
      [status, approverId, timestamp, reason, pendingEditId],
      function (err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      }
    );
  });
}

/**
 * Gets a pending edit by ID
 * @param {number} pendingEditId - Pending edit ID
 * @returns {Promise<object|null>} Pending edit object or null
 */
function getPendingEditById(pendingEditId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT pe.*, 
              m.file_path, m.description as current_description, m.nsfw as current_nsfw,
              u.username as editor_username
       FROM pending_edits pe
       JOIN media m ON pe.media_id = m.id
       JOIN users u ON pe.user_id = u.id
       WHERE pe.id = ?`,
      [pendingEditId],
      (err, row) => {
        if (err) reject(err);
        else if (row) {
          resolve({
            ...row,
            old_value: JSON.parse(row.old_value),
            new_value: JSON.parse(row.new_value)
          });
        } else {
          resolve(null);
        }
      }
    );
  });
}

/**
 * Checks if user has voted on a pending edit
 * @param {number} pendingEditId - Pending edit ID
 * @param {number} userId - User ID
 * @returns {Promise<string|null>} Vote ('approve', 'reject') or null
 */
function getUserVote(pendingEditId, userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT vote FROM edit_votes WHERE pending_edit_id = ? AND user_id = ?`,
      [pendingEditId, userId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.vote : null);
      }
    );
  });
}

/**
 * Checks if a user is the original sender of a media item
 * @param {number} mediaId - Media ID
 * @param {number} userId - User ID
 * @returns {Promise<boolean>} True if user is original sender
 */
function isOriginalSender(mediaId, userId) {
  return new Promise((resolve, reject) => {
    // First get user's phone number
    db.get(
      'SELECT phone_number FROM users WHERE id = ?',
      [userId],
      (err, userRow) => {
        if (err || !userRow || !userRow.phone_number) {
          resolve(false);
          return;
        }

        // Check if media sender_id matches user's phone number
        db.get(
          'SELECT sender_id FROM media WHERE id = ?',
          [mediaId],
          (err, mediaRow) => {
            if (err || !mediaRow || !mediaRow.sender_id) {
              resolve(false);
              return;
            }

            // Format phone number to match sender_id format (usually includes @c.us)
            const userPhone = userRow.phone_number.replace(/\D/g, ''); // Remove non-digits
            const senderPhone = mediaRow.sender_id.replace(/\D/g, ''); // Remove non-digits
            
            resolve(userPhone === senderPhone);
          }
        );
      }
    );
  });
}

module.exports = {
  createPendingEdit,
  getPendingEdits,
  getPendingEditsForMedia,
  voteOnEdit,
  getVoteCounts,
  approvePendingEdit,
  getPendingEditById,
  getUserVote,
  isOriginalSender
};
