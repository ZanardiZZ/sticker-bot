const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Garante que a pasta de dados exista
const dbPath = path.resolve(__dirname, 'data');
if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath);

// Banco local
const db = new Database(path.join(dbPath, 'figurinhas.sqlite3'));

// Cria a tabela se não existir
db.exec(`
  CREATE TABLE IF NOT EXISTS figurinhas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file TEXT UNIQUE,
    descricao TEXT,
    nsfw BOOLEAN,
    remetente TEXT,
    grupo TEXT,
    data TEXT
  )
`);

// Insere a figurinha no banco
function inserirFigurinha({ file, descricao, nsfw, remetente, grupo, data }) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO figurinhas (file, descricao, nsfw, remetente, grupo, data)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(file, descricao, nsfw ? 1 : 0, remetente, grupo, data);
}

// Consulta se o hash já existe
function jaExiste(hash) {
  const stmt = db.prepare(`SELECT 1 FROM figurinhas WHERE file = ?`);
  return !!stmt.get(hash);
}

module.exports = {
  inserirFigurinha,
  jaExiste,
};
