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
      `WITH inferred_mapping AS (
         SELECT lid, MAX(pn) AS pn
         FROM (
           SELECT
             CASE
               WHEN sender_id LIKE '%@lid' THEN sender_id
               WHEN chat_id LIKE '%@lid' THEN chat_id
               WHEN group_id LIKE '%@lid' THEN group_id
             END AS lid,
             CASE
               WHEN sender_id LIKE '%@s.whatsapp.net' OR sender_id LIKE '%@c.us' THEN sender_id
               WHEN chat_id LIKE '%@s.whatsapp.net' OR chat_id LIKE '%@c.us' THEN chat_id
               WHEN group_id LIKE '%@s.whatsapp.net' OR group_id LIKE '%@c.us' THEN group_id
             END AS pn
           FROM media
         )
         WHERE lid IS NOT NULL AND pn IS NOT NULL
         GROUP BY lid
       ),
       normalized_media AS (
         SELECT
           m.*,
           COALESCE(m.sender_id, m.chat_id, m.group_id) AS primary_id,
           CASE
             WHEN m.sender_id LIKE '%@lid' THEN m.sender_id
             WHEN m.chat_id LIKE '%@lid' THEN m.chat_id
             WHEN m.group_id LIKE '%@lid' THEN m.group_id
           END AS lid_in_row,
           CASE
             WHEN m.sender_id LIKE '%@s.whatsapp.net' OR m.sender_id LIKE '%@c.us' THEN m.sender_id
             WHEN m.chat_id LIKE '%@s.whatsapp.net' OR m.chat_id LIKE '%@c.us' THEN m.chat_id
             WHEN m.group_id LIKE '%@s.whatsapp.net' OR m.group_id LIKE '%@c.us' THEN m.group_id
           END AS pn_in_row
         FROM media m
       ),
       stats AS (
         SELECT
           CASE
             WHEN nm.lid_in_row IS NOT NULL THEN
               COALESCE(
                 NULLIF(lm.pn, ''),
                 im.pn,
                 nm.pn_in_row,
                 nm.lid_in_row
               )
             WHEN nm.pn_in_row IS NOT NULL THEN nm.pn_in_row
             ELSE nm.primary_id
           END AS effective_sender,
           MAX(nm.group_id) AS group_id,
           MAX(nm.chat_id) AS chat_id,
           COUNT(nm.id) AS sticker_count,
           SUM(COALESCE(nm.count_random, 0)) AS total_usos
         FROM normalized_media nm
         LEFT JOIN lid_mapping lm ON nm.lid_in_row IS NOT NULL AND lm.lid = nm.lid_in_row
         LEFT JOIN inferred_mapping im ON nm.lid_in_row IS NOT NULL AND im.lid = nm.lid_in_row
         WHERE nm.primary_id IS NOT NULL
           AND nm.primary_id <> ''
           AND NOT (
             COALESCE(nm.sender_id, nm.chat_id) LIKE '%bot%' OR
             (nm.sender_id = nm.chat_id AND nm.group_id IS NULL)
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
