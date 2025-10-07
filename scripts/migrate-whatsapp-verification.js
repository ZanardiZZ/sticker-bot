/**
 * Migration script to add WhatsApp verification columns
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Use the same database path as the application
const dbPath = path.join(__dirname, '..', 'media.db');
const db = new sqlite3.Database(dbPath);

async function migrate() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      console.log('[MIGRATION] Starting WhatsApp verification migration...');
      
      // Add WhatsApp verification columns to users table
      db.run(`
        ALTER TABLE users ADD COLUMN whatsapp_verified INTEGER DEFAULT 0
      `, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.error('[MIGRATION] Error adding whatsapp_verified column:', err);
          return reject(err);
        }
        console.log('[MIGRATION] Added whatsapp_verified column');
        
        db.run(`
          ALTER TABLE users ADD COLUMN whatsapp_jid TEXT
        `, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            console.error('[MIGRATION] Error adding whatsapp_jid column:', err);
            return reject(err);
          }
          console.log('[MIGRATION] Added whatsapp_jid column');
          
          // Create WhatsApp verification codes table
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
          `, (err) => {
            if (err) {
              console.error('[MIGRATION] Error creating whatsapp_verification_codes table:', err);
              return reject(err);
            }
            console.log('[MIGRATION] Created whatsapp_verification_codes table');
            
            // Create indexes
            db.run(`CREATE INDEX IF NOT EXISTS idx_whatsapp_verification_code ON whatsapp_verification_codes(code)`, (err) => {
              if (err) console.warn('[MIGRATION] Warning creating code index:', err);
              
              db.run(`CREATE INDEX IF NOT EXISTS idx_whatsapp_verification_jid ON whatsapp_verification_codes(whatsapp_jid)`, (err) => {
                if (err) console.warn('[MIGRATION] Warning creating jid index:', err);
                
                db.run(`CREATE INDEX IF NOT EXISTS idx_whatsapp_verification_status ON whatsapp_verification_codes(status)`, (err) => {
                  if (err) console.warn('[MIGRATION] Warning creating status index:', err);
                  
                  db.run(`CREATE INDEX IF NOT EXISTS idx_users_whatsapp_jid ON users(whatsapp_jid)`, (err) => {
                    if (err) console.warn('[MIGRATION] Warning creating user jid index:', err);
                    
                    db.run(`CREATE INDEX IF NOT EXISTS idx_users_whatsapp_verified ON users(whatsapp_verified)`, (err) => {
                      if (err) console.warn('[MIGRATION] Warning creating user verified index:', err);
                      
                      console.log('[MIGRATION] WhatsApp verification migration completed successfully!');
                      resolve();
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

// Run migration
migrate()
  .then(() => {
    console.log('[MIGRATION] Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[MIGRATION] Migration failed:', error);
    process.exit(1);
  });
