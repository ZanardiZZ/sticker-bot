// Migração para adicionar tabelas de controle de permissões, funções, bloqueios, frequência e comandos permitidos

module.exports = {
  up: async (db) => {
    // Tabela de usuários do grupo
    await db.run(`
      CREATE TABLE IF NOT EXISTS group_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        blocked INTEGER NOT NULL DEFAULT 0,
        last_activity DATETIME,
        interaction_count INTEGER NOT NULL DEFAULT 0,
        allowed_commands TEXT,
        restricted_commands TEXT,
        UNIQUE(group_id, user_id)
      );
    `);

    // Tabela de permissões de comandos por grupo
    await db.run(`
      CREATE TABLE IF NOT EXISTS group_command_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT NOT NULL,
        command TEXT NOT NULL,
        allowed INTEGER NOT NULL DEFAULT 1,
        UNIQUE(group_id, command)
      );
    `);

    // Tabela de configurações do bot
    await db.run(`
      CREATE TABLE IF NOT EXISTS bot_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        value TEXT
      );
    `);
  },
  down: async (db) => {
    await db.run('DROP TABLE IF EXISTS group_users;');
    await db.run('DROP TABLE IF EXISTS group_command_permissions;');
    await db.run('DROP TABLE IF EXISTS bot_config;');
  }
};
