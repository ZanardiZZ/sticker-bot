/**
 * Reactions model - handles media reaction tracking
 */

const { db } = require('../connection');

/**
 * Links a WhatsApp message to a saved media entry
 * @param {string} messageId - WhatsApp message ID
 * @param {number} mediaId - Media ID in database
 * @param {string} chatId - Chat ID where the message was sent
 * @returns {Promise<void>}
 */
function linkMessageToMedia(messageId, mediaId, chatId) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO message_media_links (message_id, media_id, chat_id, created_at)
       VALUES (?, ?, ?, strftime('%s','now'))`,
      [messageId, mediaId, chatId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

/**
 * Gets the media ID linked to a message
 * @param {string} messageId - WhatsApp message ID
 * @returns {Promise<number|null>} Media ID or null if not found
 */
function getMediaIdFromMessage(messageId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT media_id FROM message_media_links WHERE message_id = ?',
      [messageId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.media_id : null);
      }
    );
  });
}

/**
 * Adds or updates a reaction to a media item
 * @param {number} mediaId - Media ID
 * @param {string} messageId - Original message ID that was reacted to
 * @param {string} reactorJid - JID of the user who reacted
 * @param {string} emoji - Reaction emoji
 * @returns {Promise<{action: 'added'|'updated'|'removed'}>}
 */
function upsertReaction(mediaId, messageId, reactorJid, emoji) {
  return new Promise((resolve, reject) => {
    if (!emoji || emoji === '') {
      // Empty emoji means remove reaction
      db.run(
        'DELETE FROM media_reactions WHERE media_id = ? AND reactor_jid = ?',
        [mediaId, reactorJid],
        function(err) {
          if (err) reject(err);
          else resolve({ action: 'removed', changes: this.changes });
        }
      );
      return;
    }

    // Check if reaction exists
    db.get(
      'SELECT id, emoji FROM media_reactions WHERE media_id = ? AND reactor_jid = ?',
      [mediaId, reactorJid],
      (err, existing) => {
        if (err) {
          reject(err);
          return;
        }

        if (existing) {
          if (existing.emoji === emoji) {
            // Same emoji, no change needed
            resolve({ action: 'unchanged' });
            return;
          }
          // Update existing reaction with new emoji
          db.run(
            `UPDATE media_reactions SET emoji = ?, message_id = ?, created_at = strftime('%s','now')
             WHERE id = ?`,
            [emoji, messageId, existing.id],
            (updateErr) => {
              if (updateErr) reject(updateErr);
              else resolve({ action: 'updated' });
            }
          );
        } else {
          // Insert new reaction
          db.run(
            `INSERT INTO media_reactions (media_id, message_id, reactor_jid, emoji, created_at)
             VALUES (?, ?, ?, ?, strftime('%s','now'))`,
            [mediaId, messageId, reactorJid, emoji],
            (insertErr) => {
              if (insertErr) reject(insertErr);
              else resolve({ action: 'added' });
            }
          );
        }
      }
    );
  });
}

/**
 * Removes a reaction from a media item
 * @param {number} mediaId - Media ID
 * @param {string} reactorJid - JID of the user who reacted
 * @returns {Promise<boolean>} True if reaction was removed
 */
function removeReaction(mediaId, reactorJid) {
  return new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM media_reactions WHERE media_id = ? AND reactor_jid = ?',
      [mediaId, reactorJid],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      }
    );
  });
}

/**
 * Gets all reactions for a media item
 * @param {number} mediaId - Media ID
 * @returns {Promise<Array<{emoji: string, reactor_jid: string, created_at: number}>>}
 */
function getReactionsForMedia(mediaId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT emoji, reactor_jid, created_at
       FROM media_reactions
       WHERE media_id = ?
       ORDER BY created_at DESC`,
      [mediaId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

/**
 * Gets reaction counts grouped by emoji for a media item
 * @param {number} mediaId - Media ID
 * @returns {Promise<Array<{emoji: string, count: number}>>}
 */
function getReactionCountsForMedia(mediaId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT emoji, COUNT(*) as count
       FROM media_reactions
       WHERE media_id = ?
       GROUP BY emoji
       ORDER BY count DESC`,
      [mediaId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

function getReactionCountForMediaInChat(mediaId, chatId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COUNT(*) AS total FROM media_reactions r
       WHERE r.media_id = ?
         AND EXISTS (SELECT 1 FROM message_media_links l WHERE l.media_id = r.media_id AND l.chat_id = ?)`,
      [mediaId, chatId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.total : 0);
      }
    );
  });
}

/**
 * Gets total reaction count for a media item
 * @param {number} mediaId - Media ID
 * @returns {Promise<number>}
 */
function getTotalReactionCount(mediaId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT COUNT(*) as total FROM media_reactions WHERE media_id = ?',
      [mediaId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.total : 0);
      }
    );
  });
}

/**
 * Gets most reacted media items
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array<{media_id: number, reaction_count: number, top_emoji: string}>>}
 */
function getMostReactedMedia(limit = 10) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT
         media_id,
         COUNT(*) as reaction_count,
         (SELECT emoji FROM media_reactions mr2
          WHERE mr2.media_id = media_reactions.media_id
          GROUP BY emoji ORDER BY COUNT(*) DESC LIMIT 1) as top_emoji
       FROM media_reactions
       GROUP BY media_id
       ORDER BY reaction_count DESC
       LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

/**
 * Gets reaction statistics for a user
 * @param {string} reactorJid - User JID
 * @returns {Promise<{total: number, emojis: Array<{emoji: string, count: number}>}>}
 */
function getUserReactionStats(reactorJid) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT emoji, COUNT(*) as count
       FROM media_reactions
       WHERE reactor_jid = ?
       GROUP BY emoji
       ORDER BY count DESC`,
      [reactorJid],
      (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        const total = rows ? rows.reduce((sum, r) => sum + r.count, 0) : 0;
        resolve({
          total,
          emojis: rows || []
        });
      }
    );
  });
}

async function getReactionAnalytics({ from, to, chatId = null, limit = 10 } = {}) {
  const start = Math.floor(Number(from || (Date.now() - 7 * 86400000)) / 1000);
  const end = Math.floor(Number(to || Date.now()) / 1000);
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const linkFilter = chatId
    ? ' AND EXISTS (SELECT 1 FROM message_media_links l WHERE l.media_id = r.media_id AND l.chat_id = ?)'
    : ' AND EXISTS (SELECT 1 FROM message_media_links l WHERE l.media_id = r.media_id)';
  const params = [start, end, ...(chatId ? [chatId] : [])];
  const topMedia = await new Promise((resolve, reject) => db.all(`SELECT r.media_id, COUNT(*) AS reaction_count,
      (SELECT r2.emoji FROM media_reactions r2
       WHERE r2.media_id = r.media_id AND r2.created_at BETWEEN ? AND ?
         ${chatId ? 'AND EXISTS (SELECT 1 FROM message_media_links l2 WHERE l2.media_id = r2.media_id AND l2.chat_id = ?)' : 'AND EXISTS (SELECT 1 FROM message_media_links l2 WHERE l2.media_id = r2.media_id)'}
       GROUP BY r2.emoji ORDER BY COUNT(*) DESC, r2.emoji LIMIT 1) AS top_emoji
    FROM media_reactions r
    WHERE r.created_at BETWEEN ? AND ?${linkFilter}
    GROUP BY r.media_id ORDER BY reaction_count DESC, r.media_id ASC LIMIT ?`,
  [start, end, ...(chatId ? [chatId] : []), start, end, ...(chatId ? [chatId] : []), safeLimit],
  (e, rows) => e ? reject(e) : resolve(rows || [])));
  const emojiCounts = await new Promise((resolve, reject) => db.all(`SELECT r.emoji, COUNT(*) AS count
    FROM media_reactions r WHERE r.created_at BETWEEN ? AND ?${linkFilter}
    GROUP BY r.emoji ORDER BY count DESC, r.emoji LIMIT 20`, params, (e, rows) => e ? reject(e) : resolve(rows || [])));
  const total = await new Promise((resolve, reject) => db.get(`SELECT COUNT(*) AS total
    FROM media_reactions r WHERE r.created_at BETWEEN ? AND ?${linkFilter}`, params, (e, row) => e ? reject(e) : resolve(row?.total || 0)));
  const trends = await getReactionTrends({ from: start * 1000, to: end * 1000, chatId });
  return { from: start * 1000, to: end * 1000, chatId: chatId || null, totalReactions: total, topMedia, emojiCounts, trends };
}

async function getReactionTrends({ from, to, chatId = null } = {}) {
  const start = Math.floor(Number(from || (Date.now() - 30 * 86400000)) / 1000);
  const end = Math.floor(Number(to || Date.now()) / 1000);
  const linkFilter = chatId
    ? ' AND EXISTS (SELECT 1 FROM message_media_links l WHERE l.media_id = r.media_id AND l.chat_id = ?)'
    : ' AND EXISTS (SELECT 1 FROM message_media_links l WHERE l.media_id = r.media_id)';
  const query = (bucket, params) => new Promise((resolve, reject) => db.all(`SELECT ${bucket} AS period, COUNT(*) AS count
    FROM media_reactions r WHERE r.created_at BETWEEN ? AND ?${linkFilter}
    GROUP BY period ORDER BY period ASC`, params, (e, rows) => e ? reject(e) : resolve(rows || [])));
  const params = [start, end, ...(chatId ? [chatId] : [])];
  return {
    weekly: await query("strftime('%Y-W%W', r.created_at, 'unixepoch')", params),
    monthly: await query("strftime('%Y-%m', r.created_at, 'unixepoch')", params)
  };
}

module.exports = {
  getReactionAnalytics,
  getReactionTrends,
  linkMessageToMedia,
  getMediaIdFromMessage,
  upsertReaction,
  removeReaction,
  getReactionsForMedia,
  getReactionCountsForMedia,
  getReactionCountForMediaInChat,
  getTotalReactionCount,
  getMostReactedMedia,
  getUserReactionStats
};
