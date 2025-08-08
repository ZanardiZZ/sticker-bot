// database.js
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { getConfig } = require('./configRuntime.js');

const dbPath = '/opt/sticker-bot/stickers.db';
const db = new Database(dbPath);

// Cria tabela de figurinhas se não existir
db.exec(`
  CREATE TABLE IF NOT EXISTS figurinhas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file TEXT NOT NULL,
    descricao TEXT,
    tag TEXT,
    nsfw INTEGER DEFAULT 0,
    remetente TEXT,
    grupo TEXT,
    data TEXT DEFAULT CURRENT_TIMESTAMP,
    shuffle_count INTEGER DEFAULT 0,
    visual_hash TEXT
  );
`);

// Cria tabela de vídeos se não existir
db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file TEXT NOT NULL,
    descricao TEXT,
    tag TEXT,
    remetente TEXT,
    grupo TEXT,
    data TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// ---------- FIGURINHAS ----------

function resolveStickerPath(dbFileValue, baseDir) {
  if (!dbFileValue) return null;
  if (path.isAbsolute(dbFileValue) && fs.existsSync(dbFileValue)) {
    return dbFileValue;
  }
  const p = path.join(baseDir, dbFileValue);
  if (fs.existsSync(p)) {
    return p;
  }
  const p2 = path.join(baseDir, path.basename(dbFileValue));
  if (fs.existsSync(p2)) {
    return p2;
  }
  return null;
}

function inserirFigurinha({ file, descricao, tag, nsfw = 0, remetente, grupo, visual_hash = null }) {
  const stmt = db.prepare(`
    INSERT INTO figurinhas (file, descricao, tag, nsfw, remetente, grupo, visual_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(file, descricao, tag, nsfw ? 1 : 0, remetente, grupo, visual_hash);
  return info.lastInsertRowid;
}

function marcarFigurinhaComoUsada(id) {
  db.prepare(`UPDATE figurinhas SET shuffle_count = shuffle_count + 1 WHERE id = ?`).run(id);
}

function buscarFigurinhaPorId(id) {
  const { STICKERS_DIR } = getConfig();
  const row = db.prepare(`
    SELECT id, file, descricao, tag, nsfw
    FROM figurinhas
    WHERE id = ?
  `).get(id);
  if (!row) return null;

  const filePath = resolveStickerPath(row.file, STICKERS_DIR);
  if (!filePath || !filePath.toLowerCase().endsWith('.webp')) return null;

  return {
    id: row.id,
    filePath,
    description: row.descricao || '(sem descrição)',
    tag: row.tag ? (row.tag.startsWith('#') ? row.tag : `#${row.tag}`) : '#gerado'
  };
}

function getShuffledSticker() {
  const { STICKERS_DIR, SKIP_NSFW } = getConfig();
  const row = db.prepare(`
    SELECT id, file, descricao, tag, nsfw
    FROM figurinhas
    WHERE file IS NOT NULL
      ${SKIP_NSFW ? 'AND IFNULL(nsfw,0)=0' : ''}
    ORDER BY shuffle_count ASC, RANDOM()
    LIMIT 1
  `).get();
  if (!row) return null;

  const filePath = resolveStickerPath(row.file, STICKERS_DIR);
  if (!filePath || !filePath.toLowerCase().endsWith('.webp')) return null;

  marcarFigurinhaComoUsada(row.id);
  return {
    id: row.id,
    filePath,
    description: row.descricao || '(sem descrição)',
    tag: row.tag ? (row.tag.startsWith('#') ? row.tag : `#${row.tag}`) : '#gerado'
  };
}

function topFigurinhas(limit = 10) {
  return db.prepare(`
    SELECT id, descricao, tag, shuffle_count
    FROM figurinhas
    WHERE shuffle_count > 0
    ORDER BY shuffle_count DESC
    LIMIT ?
  `).all(limit);
}

function existeVisualHash(hash) {
  const row = db.prepare(`SELECT id FROM figurinhas WHERE visual_hash = ?`).get(hash);
  return !!row;
}

function listarFigurinhas() {
  return db.prepare(`
    SELECT id, file, descricao, tag, visual_hash
    FROM figurinhas
    WHERE visual_hash IS NOT NULL
  `).all();
}

function buscarPorHash(hash) {
  return db.prepare(`
    SELECT id, descricao, tag
    FROM figurinhas
    WHERE file = ?
  `).get(hash);
}

function atualizarDescricao(id, descricao, tag) {
  db.prepare(`
    UPDATE figurinhas
    SET descricao = ?, tag = ?
    WHERE id = ?
  `).run(descricao, tag, id);
}

// ---------- VÍDEOS ----------

function inserirVideo({ file, descricao, tag, remetente, grupo }) {
  const stmt = db.prepare(`
    INSERT INTO videos (file, descricao, tag, remetente, grupo)
    VALUES (?, ?, ?, ?, ?)
  `);
  const info = stmt.run(file, descricao, tag, remetente, grupo);
  return info.lastInsertRowid;
}

function jaExisteVideo(hash) {
  return db.prepare(`
    SELECT id, descricao, tag
    FROM videos
    WHERE file = ?
  `).get(hash);
}

function getVideoById(id) {
  return db.prepare(`
    SELECT id, file, descricao, tag, remetente, grupo, data
    FROM videos
    WHERE id = ?
  `).get(id);
}

function atualizarDescricaoVideo(id, descricao, tag) {
  db.prepare(`
    UPDATE videos
    SET descricao = ?, tag = ?
    WHERE id = ?
  `).run(descricao, tag, id);
}

module.exports = {
  inserirFigurinha,
  marcarFigurinhaComoUsada,
  buscarFigurinhaPorId,
  getShuffledSticker,
  topFigurinhas,
  existeVisualHash,
  listarFigurinhas,
  buscarPorHash,
  atualizarDescricao,
  inserirVideo,
  jaExisteVideo,
  getVideoById,
  atualizarDescricaoVideo
};
