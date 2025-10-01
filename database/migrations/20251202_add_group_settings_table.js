// Migração para adicionar a tabela de configurações de grupos

module.exports = {
  up: async (db) => {
    await db.run(`
      CREATE TABLE IF NOT EXISTS group_settings (
        group_id TEXT PRIMARY KEY,
        display_name TEXT,
        auto_send_enabled INTEGER NOT NULL DEFAULT 0,
        processing_enabled INTEGER NOT NULL DEFAULT 1,
        last_seen_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
      )
    `);
  },
  down: async (db) => {
    await db.run('DROP TABLE IF EXISTS group_settings;');
  }
};
