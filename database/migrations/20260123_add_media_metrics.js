/**
 * Migration: Add media processing metrics tracking
 * Created: 2026-01-23
 */

module.exports = {
  up: async (db) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Create media_processing_log table
        db.run(
          `CREATE TABLE IF NOT EXISTS media_processing_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER,
            processing_start_ts INTEGER NOT NULL,
            processing_end_ts INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL,
            media_type TEXT NOT NULL,
            file_size_bytes INTEGER,
            success INTEGER DEFAULT 1,
            FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE
          )`,
          (err) => {
            if (err) return reject(err);
          }
        );

        // Create indexes for performance
        db.run(
          `CREATE INDEX IF NOT EXISTS idx_media_processing_log_ts
           ON media_processing_log(processing_end_ts DESC)`,
          (err) => {
            if (err) return reject(err);
          }
        );

        db.run(
          `CREATE INDEX IF NOT EXISTS idx_media_processing_log_media_id
           ON media_processing_log(media_id)`,
          (err) => {
            if (err) return reject(err);
            resolve();
          }
        );
      });
    });
  },

  down: async (db) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run(`DROP INDEX IF EXISTS idx_media_processing_log_ts`);
        db.run(`DROP INDEX IF EXISTS idx_media_processing_log_media_id`);
        db.run(`DROP TABLE IF EXISTS media_processing_log`, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  }
};
