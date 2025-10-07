/**
 * Database schema initialization and migrations
 */

const { initializeLidMappingTable } = require('../models/lidMapping');

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
          email_confirmation_expires INTEGER,
          whatsapp_verified INTEGER DEFAULT 0,
          whatsapp_jid TEXT,
          can_edit INTEGER DEFAULT 0
        )
      `);

      // WhatsApp verification codes table
      db.run(`
        CREATE TABLE IF NOT EXISTS whatsapp_verification_codes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT UNIQUE NOT NULL,
          user_id INTEGER,
          whatsapp_jid TEXT,
          status TEXT DEFAULT 'pending',
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          verified_at INTEGER,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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

      db.run(`
        CREATE TABLE IF NOT EXISTS groups (
          group_id TEXT PRIMARY KEY,
          display_name TEXT,
          last_interaction_ts INTEGER,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        )
      `);

      // Version tracking table for SemVer implementation
      db.run(`
        CREATE TABLE IF NOT EXISTS version_info (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          major INTEGER NOT NULL DEFAULT 1,
          minor INTEGER NOT NULL DEFAULT 0,
          patch INTEGER NOT NULL DEFAULT 0,
          pre_release TEXT,
          build_metadata TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
          created_by TEXT,
          description TEXT,
          hidden_data TEXT,
          is_current INTEGER DEFAULT 1
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

      // Approval system tables
      db.run(`
        CREATE TABLE IF NOT EXISTS pending_edits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          media_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          edit_type TEXT NOT NULL,
          old_value TEXT,
          new_value TEXT,
          status TEXT DEFAULT 'pending',
          created_at INTEGER NOT NULL,
          approved_by INTEGER,
          approved_at INTEGER,
          reason TEXT,
          FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY(approved_by) REFERENCES users(id) ON DELETE SET NULL
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS edit_votes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pending_edit_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          vote TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE(pending_edit_id, user_id),
          FOREIGN KEY(pending_edit_id) REFERENCES pending_edits(id) ON DELETE CASCADE,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // Create indexes for performance
      createIndexes(db);

      // Initialize LID mapping table
      initializeLidMappingTable(db).then(() => {
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
      }).catch((error) => {
        console.error('[DB] Erro ao inicializar tabela LID mapping:', error);
        reject(error);
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

  // Group metadata indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_groups_display_name ON groups(display_name)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_groups_last_interaction ON groups(last_interaction_ts DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_tags_media_id ON media_tags(media_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tags_usage_count ON tags(usage_count DESC)`);

  // Contact indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_contacts_display_name ON contacts(display_name)`);

  // Version indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_version_info_current ON version_info(is_current)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_version_info_created_at ON version_info(created_at DESC)`);
  
  // Approval system indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_pending_edits_media_id ON pending_edits(media_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_pending_edits_user_id ON pending_edits(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_pending_edits_status ON pending_edits(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_edit_votes_pending_edit_id ON edit_votes(pending_edit_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_edit_votes_user_id ON edit_votes(user_id)`);
  
  // WhatsApp verification indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_whatsapp_verification_code ON whatsapp_verification_codes(code)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_whatsapp_verification_jid ON whatsapp_verification_codes(whatsapp_jid)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_whatsapp_verification_status ON whatsapp_verification_codes(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_whatsapp_jid ON users(whatsapp_jid)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_whatsapp_verified ON users(whatsapp_verified)`);
}

module.exports = { initializeTables };
