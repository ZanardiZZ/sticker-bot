// Migration to create media_delete_requests table for delete voting

module.exports = {
  up: async (db) => {
    await db.run(`
      CREATE TABLE IF NOT EXISTS media_delete_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        group_id TEXT,
        first_requested_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        last_requested_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        UNIQUE(media_id, user_id),
        FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE
      )
    `);

    await db.run(`
      CREATE INDEX IF NOT EXISTS idx_media_delete_requests_media_id
      ON media_delete_requests(media_id)
    `);

    await db.run(`
      CREATE INDEX IF NOT EXISTS idx_media_delete_requests_group_media
      ON media_delete_requests(group_id, media_id)
    `);
  },

  down: async (db) => {
    await db.run('DROP TABLE IF EXISTS media_delete_requests');
  }
};
