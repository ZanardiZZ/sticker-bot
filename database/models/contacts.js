/**
 * Contacts model - handles contact-related database operations
 */

const { db } = require('../connection');
const { getGroupName } = require('../../utils/groupUtils');

/**
 * Gets top 5 users by sticker count
 * @returns {Promise<object[]>} Array of user stats
 */
function getTop5UsersByStickerCount() {
  return new Promise((resolve) => {
    db.all(
      `SELECT 
         c.display_name,
         m.sender_id as effective_sender,
         CASE WHEN m.sender_id LIKE '%@g.us' THEN 1 ELSE 0 END as is_group,
         CASE WHEN m.sender_id LIKE '%@g.us' THEN m.sender_id ELSE NULL END as group_id,
         COUNT(m.id) as sticker_count,
         SUM(m.count_random) as total_usos
       FROM media m
       LEFT JOIN contacts c ON m.sender_id = c.sender_id
       WHERE m.sender_id IS NOT NULL
       GROUP BY m.sender_id
       ORDER BY sticker_count DESC
       LIMIT 5`,
      (err, rows) => {
        resolve(err ? [] : rows);
      }
    );
  });
}

/**
 * Upserts a contact from a message
 * @param {string} senderId - Sender ID
 * @param {string} displayName - Display name
 * @returns {Promise<void>}
 */
function upsertContact(senderId, displayName) {
  return new Promise((resolve, reject) => {
    if (!senderId) {
      resolve();
      return;
    }
    
    db.run(
      `INSERT OR REPLACE INTO contacts (sender_id, display_name, updated_at)
       VALUES (?, ?, ?)`,
      [senderId, displayName, Date.now()],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

/**
 * Gets contact by sender ID
 * @param {string} senderId - Sender ID
 * @returns {Promise<object|null>} Contact object or null
 */
function getContact(senderId) {
  return new Promise((resolve) => {
    db.get(
      'SELECT * FROM contacts WHERE sender_id = ?',
      [senderId],
      (err, row) => {
        resolve(err ? null : row);
      }
    );
  });
}

/**
 * Gets all contacts
 * @returns {Promise<object[]>} Array of contacts
 */
function getAllContacts() {
  return new Promise((resolve) => {
    db.all(
      'SELECT * FROM contacts ORDER BY display_name',
      (err, rows) => {
        resolve(err ? [] : rows);
      }
    );
  });
}

module.exports = {
  getTop5UsersByStickerCount,
  upsertContact,
  getContact,
  getAllContacts,
  getGroupName
};