/**
 * Database schema initialization and migrations
 */

function initializeTables(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Main media table
      db.run(`
        CREATE TABLE IF NOT EXISTS media (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id TEXT NOT NULL,
          group_id TEXT,
          sender_id TEXT,
          file_path TEXT NOT NULL,
          mimetype TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          description TEXT,
          hash_visual TEXT,
          hash_md5 TEXT,
          nsfw INTEGER DEFAULT 0,
          count_random INTEGER DEFAULT 0
        )
      `);

      // Processed files tracking table
      db.run(`
        CREATE TABLE IF NOT EXISTS processed_files (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_name TEXT UNIQUE NOT NULL,
          last_modified INTEGER NOT NULL
        )
      `);

      // Tags table
      db.run(`
        CREATE TABLE IF NOT EXISTS tags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          usage_count INTEGER DEFAULT 0
        )
      `);

      // Media-tags relationship table
      db.run(`
        CREATE TABLE IF NOT EXISTS media_tags (
          media_id INTEGER NOT NULL,
          tag_id INTEGER NOT NULL,
          PRIMARY KEY(media_id, tag_id),
          FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE,
          FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )
      `);

      // Users table for web interface
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'admin',
          created_at INTEGER NOT NULL,
          status TEXT DEFAULT 'approved',
          must_change_password INTEGER DEFAULT 0,
          password_updated_at INTEGER,
          phone_number TEXT,
          email TEXT,
          email_confirmed INTEGER DEFAULT 0,
          email_confirmation_token TEXT,
          email_confirmation_expires INTEGER
        )
      `);

      // Contacts table for display names
      db.run(`
        CREATE TABLE IF NOT EXISTS contacts (
          sender_id TEXT PRIMARY KEY,
          display_name TEXT,
          updated_at INTEGER DEFAULT (strftime('%s','now'))
        )
      `);

      // Analytics tables (if enabled)
      db.run(`
        CREATE TABLE IF NOT EXISTS request_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts INTEGER NOT NULL,
          ip TEXT,
          path TEXT,
          method TEXT,
          status INTEGER,
          duration_ms INTEGER,
          referrer TEXT,
          user_agent TEXT,
          user_id INTEGER
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS ip_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ip TEXT NOT NULL,
          action TEXT NOT NULL,
          reason TEXT,
          expires_at INTEGER,
          created_at INTEGER NOT NULL,
          created_by TEXT
        )
      `);

      // Create indexes for performance
      createIndexes(db);

      // Check media count after tables are created
      db.get('SELECT COUNT(*) as total FROM media', (err, row) => {
        if (err) {
          console.error("[DB] ERRO ao acessar tabela 'media':", err);
          reject(err);
        } else {
          console.log(`[DB] Tabela 'media' tem ${row.total} registros.`);
          resolve();
        }
      });
    });
  });
}

function createIndexes(db) {
  // Primary indexes for media table
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_timestamp ON media(timestamp DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_sender_id ON media(sender_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_nsfw ON media(nsfw)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_count_random ON media(count_random DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_file_path ON media(file_path)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_description ON media(description)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_nsfw_timestamp ON media(nsfw, timestamp DESC)`);
  
  // Critical indexes for duplicate detection
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_hash_visual ON media(hash_visual)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_hash_md5 ON media(hash_md5)`);

  // Tag-related indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_tags_tag_id ON media_tags(tag_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_tags_media_id ON media_tags(media_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tags_usage_count ON tags(usage_count DESC)`);

  // Contact indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_contacts_display_name ON contacts(display_name)`);
}

module.exports = { initializeTables };