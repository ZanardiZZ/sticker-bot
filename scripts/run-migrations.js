// Script para rodar todas as migrações da pasta database/migrations
// Executa todos os métodos 'up' dos arquivos de migração (exceto schema.js)

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const MIGRATIONS_DIR = path.join(__dirname, '../database/migrations');
const DB_PATH = path.join(__dirname, '../database/media.db');

const db = new sqlite3.Database(DB_PATH);

async function runMigration(migrationFile) {
  const migration = require(path.join(MIGRATIONS_DIR, migrationFile));
  if (typeof migration.up === 'function') {
    console.log(`[MIGRATION] Executando: ${migrationFile}`);
    await migration.up(db);
    console.log(`[MIGRATION] OK: ${migrationFile}`);
  } else {
    console.log(`[MIGRATION] Ignorado (sem método up): ${migrationFile}`);
  }
}

async function runAllMigrations() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.js') && f !== 'schema.js')
    .sort();

  for (const file of files) {
    try {
      await runMigration(file);
    } catch (err) {
      console.error(`[MIGRATION] ERRO em ${file}:`, err);
      process.exit(1);
    }
  }
  db.close();
  console.log('[MIGRATION] Todas as migrações concluídas.');
}

// Suporte a async/await no topo
runAllMigrations();
