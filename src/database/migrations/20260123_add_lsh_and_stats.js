/**
 * Migration: Add LSH optimization and sender stats
 * Date: 2026-01-23
 *
 * Adds:
 * 1. hash_buckets table for Locality-Sensitive Hashing optimization
 * 2. sender_stats table for materialized view optimization
 * 3. Triggers to keep sender_stats updated
 */

module.exports = {
  up: async (db) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        console.log('[Migration] Adding LSH and stats tables...');

        // Create hash_buckets table
        db.run(
          `CREATE TABLE IF NOT EXISTS hash_buckets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER NOT NULL,
            bucket_key TEXT NOT NULL,
            hash_visual TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE
          )`,
          (err) => {
            if (err) {
              console.error('[Migration] Error creating hash_buckets:', err.message);
              return reject(err);
            }
            console.log('[Migration] Created table: hash_buckets');
          }
        );

        // Create indexes for hash_buckets
        db.run(
          `CREATE INDEX IF NOT EXISTS idx_hash_buckets_bucket_key ON hash_buckets(bucket_key)`,
          (err) => {
            if (err) console.error('[Migration] Error creating idx_hash_buckets_bucket_key:', err.message);
            else console.log('[Migration] Created index: idx_hash_buckets_bucket_key');
          }
        );

        db.run(
          `CREATE INDEX IF NOT EXISTS idx_hash_buckets_media_id ON hash_buckets(media_id)`,
          (err) => {
            if (err) console.error('[Migration] Error creating idx_hash_buckets_media_id:', err.message);
            else console.log('[Migration] Created index: idx_hash_buckets_media_id');
          }
        );

        // Create sender_stats table
        db.run(
          `CREATE TABLE IF NOT EXISTS sender_stats (
            sender_id TEXT PRIMARY KEY,
            sticker_count INTEGER DEFAULT 0,
            last_updated INTEGER NOT NULL DEFAULT (strftime('%s','now'))
          )`,
          (err) => {
            if (err) {
              console.error('[Migration] Error creating sender_stats:', err.message);
              return reject(err);
            }
            console.log('[Migration] Created table: sender_stats');
          }
        );

        // Create index for sender_stats
        db.run(
          `CREATE INDEX IF NOT EXISTS idx_sender_stats_count ON sender_stats(sticker_count DESC)`,
          (err) => {
            if (err) console.error('[Migration] Error creating idx_sender_stats_count:', err.message);
            else console.log('[Migration] Created index: idx_sender_stats_count');
          }
        );

        // Create trigger to update sender_stats on INSERT
        db.run(
          `CREATE TRIGGER IF NOT EXISTS update_sender_stats_on_insert
           AFTER INSERT ON media
           BEGIN
             INSERT INTO sender_stats (sender_id, sticker_count, last_updated)
             VALUES (NEW.sender_id, 1, strftime('%s', 'now'))
             ON CONFLICT(sender_id) DO UPDATE SET
               sticker_count = sticker_count + 1,
               last_updated = strftime('%s', 'now');
           END`,
          (err) => {
            if (err) console.error('[Migration] Error creating trigger insert:', err.message);
            else console.log('[Migration] Created trigger: update_sender_stats_on_insert');
          }
        );

        // Create trigger to update sender_stats on DELETE
        db.run(
          `CREATE TRIGGER IF NOT EXISTS update_sender_stats_on_delete
           AFTER DELETE ON media
           BEGIN
             UPDATE sender_stats
             SET sticker_count = sticker_count - 1,
                 last_updated = strftime('%s', 'now')
             WHERE sender_id = OLD.sender_id;
           END`,
          (err) => {
            if (err) {
              console.error('[Migration] Error creating trigger delete:', err.message);
              return reject(err);
            }
            console.log('[Migration] Created trigger: update_sender_stats_on_delete');

            // Initialize sender_stats with existing data
            db.run(
              `INSERT INTO sender_stats (sender_id, sticker_count, last_updated)
               SELECT sender_id, COUNT(*) as count, strftime('%s', 'now')
               FROM media
               WHERE sender_id IS NOT NULL
               GROUP BY sender_id
               ON CONFLICT(sender_id) DO UPDATE SET
                 sticker_count = excluded.sticker_count,
                 last_updated = excluded.last_updated`,
              (err) => {
                if (err) {
                  console.error('[Migration] Error initializing sender_stats:', err.message);
                  return reject(err);
                }
                console.log('[Migration] Initialized sender_stats with existing data');
                resolve();
              }
            );
          }
        );
      });
    });
  },

  down: async (db) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        console.log('[Migration] Removing LSH and stats tables...');

        db.run(`DROP TRIGGER IF EXISTS update_sender_stats_on_insert`);
        db.run(`DROP TRIGGER IF EXISTS update_sender_stats_on_delete`);
        db.run(`DROP TABLE IF EXISTS hash_buckets`);
        db.run(`DROP TABLE IF EXISTS sender_stats`, (err) => {
          if (err) {
            console.error('[Migration] Error dropping tables:', err.message);
            return reject(err);
          }
          console.log('[Migration] Removed LSH and stats tables');
          resolve();
        });
      });
    });
  }
};
