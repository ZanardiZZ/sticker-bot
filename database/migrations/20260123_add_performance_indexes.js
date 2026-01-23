/**
 * Migration: Add performance indexes
 * Date: 2026-01-23
 *
 * Adds missing indexes to improve query performance:
 * - contacts.sender_id (for joins with media)
 * - media.chat_id (for filtering by chat)
 */

module.exports = {
  up: async (db) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        console.log('[Migration] Adding performance indexes...');

        // Add index on contacts.sender_id for better join performance
        db.run(
          `CREATE INDEX IF NOT EXISTS idx_contacts_sender_id ON contacts(sender_id)`,
          (err) => {
            if (err) {
              console.error('[Migration] Error creating idx_contacts_sender_id:', err.message);
              return reject(err);
            }
            console.log('[Migration] Created index: idx_contacts_sender_id');
          }
        );

        // Add index on media.chat_id for filtering
        db.run(
          `CREATE INDEX IF NOT EXISTS idx_media_chat_id ON media(chat_id)`,
          (err) => {
            if (err) {
              console.error('[Migration] Error creating idx_media_chat_id:', err.message);
              return reject(err);
            }
            console.log('[Migration] Created index: idx_media_chat_id');
            resolve();
          }
        );
      });
    });
  },

  down: async (db) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        console.log('[Migration] Removing performance indexes...');

        db.run(`DROP INDEX IF EXISTS idx_contacts_sender_id`, (err) => {
          if (err) {
            console.error('[Migration] Error dropping idx_contacts_sender_id:', err.message);
            return reject(err);
          }
          console.log('[Migration] Dropped index: idx_contacts_sender_id');
        });

        db.run(`DROP INDEX IF EXISTS idx_media_chat_id`, (err) => {
          if (err) {
            console.error('[Migration] Error dropping idx_media_chat_id:', err.message);
            return reject(err);
          }
          console.log('[Migration] Dropped index: idx_media_chat_id');
          resolve();
        });
      });
    });
  }
};
