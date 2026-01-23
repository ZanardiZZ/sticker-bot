// Script para rodar uma única migração específica
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, '../media.db');
const migrationName = process.argv[2];

if (!migrationName) {
  console.error('Uso: node run-single-migration.js <nome-da-migration>');
  process.exit(1);
}

const db = new sqlite3.Database(DB_PATH);
const dbAsync = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  },
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },
  serialize(fn) {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        try {
          fn();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }
};

async function runMigration() {
  try {
    const migrationPath = path.join(__dirname, '../database/migrations', migrationName);
    const migration = require(migrationPath);

    if (typeof migration.up === 'function') {
      console.log(`[MIGRATION] Executando: ${migrationName}`);
      await migration.up(dbAsync);
      console.log(`[MIGRATION] OK: ${migrationName}`);
    } else {
      console.log(`[MIGRATION] Erro: ${migrationName} não tem método up`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`[MIGRATION] ERRO:`, err);
    process.exit(1);
  } finally {
    db.close();
  }
}

runMigration();
