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
      `WITH stats AS (
         SELECT
           CASE
             WHEN COALESCE(m.sender_id, m.chat_id, m.group_id) LIKE '%@lid'
               THEN COALESCE(NULLIF(lm.pn, ''), m.chat_id, m.group_id, m.sender_id)
             ELSE COALESCE(m.sender_id, m.chat_id, m.group_id)
           END AS effective_sender,
           MAX(m.group_id) AS group_id,
           MAX(m.chat_id) AS chat_id,
           COUNT(m.id) AS sticker_count,
           SUM(COALESCE(m.count_random, 0)) AS total_usos
         FROM media m
         LEFT JOIN lid_mapping lm ON lm.lid = COALESCE(m.sender_id, m.chat_id, m.group_id)
         WHERE COALESCE(m.sender_id, m.chat_id, m.group_id) IS NOT NULL
           AND COALESCE(m.sender_id, m.chat_id, m.group_id) <> ''
           AND NOT (
             COALESCE(m.sender_id, m.chat_id) LIKE '%bot%' OR
             (m.sender_id = m.chat_id AND m.group_id IS NULL)
           )
         GROUP BY effective_sender
         HAVING effective_sender LIKE '%@%'
         ORDER BY sticker_count DESC
         LIMIT 5
       )
       SELECT 
         (
           SELECT COALESCE(NULLIF(TRIM(c.display_name), ''), '')
           FROM contacts c
           WHERE REPLACE(REPLACE(LOWER(TRIM(c.sender_id)), '@s.whatsapp.net', ''), '@c.us', '') =
                 REPLACE(REPLACE(LOWER(TRIM(s.effective_sender)), '@s.whatsapp.net', ''), '@c.us', '')
           ORDER BY c.updated_at DESC
           LIMIT 1
         ) AS display_name,
         s.effective_sender,
         s.group_id,
         CASE WHEN s.effective_sender LIKE '%@g.us' THEN 1 ELSE 0 END AS is_group,
         s.sticker_count,
         s.total_usos
       FROM stats s
       ORDER BY s.sticker_count DESC, s.effective_sender`,
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
