/**
 * Migration: Add sticker packs support
 * Date: 2025-11-13
 * 
 * Creates tables for managing sticker packs:
 * - sticker_packs: Main pack metadata
 * - pack_stickers: Many-to-many relationship between packs and media
 */

function createPackTables(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Main sticker packs table
      db.run(`
        CREATE TABLE IF NOT EXISTS sticker_packs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          created_by TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
          sticker_count INTEGER DEFAULT 0,
          max_stickers INTEGER DEFAULT 30
        )
      `, (err) => {
        if (err) {
          console.error('[Migration] Error creating sticker_packs table:', err);
          reject(err);
          return;
        }
      });

      // Pack-media relationship table
      db.run(`
        CREATE TABLE IF NOT EXISTS pack_stickers (
          pack_id INTEGER NOT NULL,
          media_id INTEGER NOT NULL,
          position INTEGER NOT NULL,
          added_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
          PRIMARY KEY(pack_id, media_id),
          FOREIGN KEY(pack_id) REFERENCES sticker_packs(id) ON DELETE CASCADE,
          FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) {
          console.error('[Migration] Error creating pack_stickers table:', err);
          reject(err);
          return;
        }
      });

      // Create indexes for performance
      db.run(`CREATE INDEX IF NOT EXISTS idx_sticker_packs_name ON sticker_packs(name)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_sticker_packs_created_at ON sticker_packs(created_at DESC)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_pack_stickers_pack_id ON pack_stickers(pack_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_pack_stickers_media_id ON pack_stickers(media_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_pack_stickers_position ON pack_stickers(pack_id, position)`);

      console.log('[Migration] Sticker packs tables created successfully');
      resolve();
    });
  });
}

function runMigration(db) {
  return createPackTables(db);
}

module.exports = { runMigration };
