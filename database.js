const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const fs = require('fs');
const { getAiAnnotations } = require('./services/ai'); // Importa a função IA

// Variável para caminho da pasta de figurinhas antigas será lida do .env
const OLD_STICKERS_PATH = process.env.OLD_STICKERS_PATH || null;
// Limite de figurinhas para processar por vez
const PROCESS_BATCH_SIZE = 5;

const dbPath = path.resolve(__dirname, 'media.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
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
      tags TEXT,
      hash_visual TEXT,
      hash_md5 TEXT,
      nsfw INTEGER DEFAULT 0,
      count_random INTEGER DEFAULT 0
    )
  `);

  // Nova tabela para registro dos arquivos processados
  db.run(`
    CREATE TABLE IF NOT EXISTS processed_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT UNIQUE NOT NULL,
      last_modified INTEGER NOT NULL
    )
  `);
});

// Gera hash MD5 de um buffer
function getMD5(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

// Gera hash visual simples (resize e md5) do buffer de imagem
async function getHashVisual(buffer) {
  try {
    const small = await sharp(buffer)
      .resize(16, 16, { fit: 'inside' })
      .grayscale()
      .raw()
      .toBuffer();
    return crypto.createHash('md5').update(small).digest('hex');
  } catch {
    return null;
  }
}

// Verifica no banco se arquivo já foi processado recentemente (com base em lastModified)
function isFileProcessed(fileName, lastModified) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT last_modified FROM processed_files WHERE file_name = ?`,
      [fileName],
      (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve(false);
        resolve(row.last_modified === lastModified);
      }
    );
  });
}

// Atualiza ou insere informação do arquivo processado
function upsertProcessedFile(fileName, lastModified) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT INTO processed_files(file_name, last_modified)
      VALUES (?, ?)
      ON CONFLICT(file_name) DO UPDATE SET last_modified=excluded.last_modified
      `,
      [fileName, lastModified],
      function(err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

// Processa figurinhas antigas da pasta para inserir no banco as que ainda não existem ou modificadas
async function processOldStickers() {
  if (!OLD_STICKERS_PATH) {
    console.warn('OLD_STICKERS_PATH não configurado no .env');
    return [];
  }

  const insertedMedias = [];

  try {
    const files = fs.readdirSync(OLD_STICKERS_PATH);
    
    // Filtra os arquivos que ainda não foram processados ou foram modificados
    const filesToProcess = [];
    for (const file of files) {
      const filePath = path.join(OLD_STICKERS_PATH, file);
      const stats = fs.statSync(filePath);
      const lastModified = stats.mtimeMs;

      const alreadyProcessed = await isFileProcessed(file, lastModified);
      if (!alreadyProcessed) {
        filesToProcess.push({ file, filePath, lastModified });
      }
      if (filesToProcess.length >= PROCESS_BATCH_SIZE) break;
    }

    // Processa o batch limitado
    for (const { file, filePath, lastModified } of filesToProcess) {
      const bufferOriginal = fs.readFileSync(filePath);

      // Converter para webp antes do hash visual para padronizar
      const bufferWebp = await sharp(bufferOriginal).webp().toBuffer();

      const hashVisual = await getHashVisual(bufferWebp);

      if (!hashVisual) continue;

      const existing = await findByHashVisual(hashVisual);
      if (existing) continue; // Já existe no banco

      // Chama IA para gerar descrição e tags
      let description = null;
      let tags = null;
      try {
        const aiResult = await getAiAnnotations(bufferWebp);
        description = aiResult.description || null;
        tags = aiResult.tags ? aiResult.tags.join(',') : null;
      } catch (e) {
        console.warn('Erro ao chamar IA para figurinha antiga:', e);
      }

      const mediaId = await saveMedia({
        chatId: 'old-stickers',
        groupId: null,
        filePath,
        mimetype: 'image/webp',
        timestamp: Date.now(),
        description,
        tags,
        hashVisual,
        hashMd5: getMD5(bufferWebp),
        nsfw: 0,
      });

      await upsertProcessedFile(file, lastModified);

      insertedMedias.push({ id: mediaId, filePath });

      console.log(`Figurinha antiga processada e salva: ${file}`);
    }
  } catch (e) {
    console.error('Erro ao processar figurinhas antigas:', e);
  }

  return insertedMedias;
}

// Retorna mídia com menor count_random (menos usada)
function getMediaWithLowestRandomCount() {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM media ORDER BY count_random ASC, RANDOM() LIMIT 1`,
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

function saveMedia({
  chatId,
  groupId,
  senderId = null,
  filePath,
  mimetype,
  timestamp,
  description = null,
  tags = null,
  hashVisual = null,
  hashMd5 = null,
  nsfw = 0,
}) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      `
      INSERT INTO media (chat_id, group_id, sender_id, file_path, mimetype, timestamp, description, tags, hash_visual, hash_md5, nsfw, count_random)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `
    );
    stmt.run(
      chatId,
      groupId,
      senderId,
      filePath,
      mimetype,
      timestamp,
      description,
      tags,
      hashVisual,
      hashMd5,
      nsfw,
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
    stmt.finalize();
  });
}

function incrementRandomCount(id) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE media SET count_random = count_random + 1 WHERE id = ?`,
      id,
      function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
}

function countMedia() {
  return new Promise((resolve, reject) => {
    db.get(`SELECT COUNT(*) as total FROM media`, (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.total : 0);
    });
  });
}

function getRandomMedia() {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM media ORDER BY RANDOM() LIMIT 1`, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function findByHashVisual(hashVisual) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM media WHERE hash_visual = ? LIMIT 1`,
      [hashVisual],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

function findById(id) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM media WHERE id = ? LIMIT 1`, [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function updateMediaTags(id, tags) {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE media SET tags = ? WHERE id = ?`, [tags, id], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

function getTop10Media() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM media ORDER BY count_random DESC LIMIT 10`,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

// Atualizar getTop5UsersByStickerCount para usar sender_id e filtrar pelo grupo (parâmetro opcional)
function getTop5UsersByStickerCount(groupId = null) {
  return new Promise((resolve, reject) => {
    let sql = `SELECT sender_id as chat_id, COUNT(*) as sticker_count FROM media`;
    const params = [];
    if (groupId) {
      sql += ` WHERE group_id = ?`;
      params.push(groupId);
    }
    sql += ` GROUP BY sender_id ORDER BY sticker_count DESC LIMIT 5`;
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}
module.exports = {
  saveMedia,
  getRandomMedia,
  incrementRandomCount,
  getMD5,
  getHashVisual,
  findByHashVisual,
  findById,
  updateMediaTags,
  processOldStickers,
  getMediaWithLowestRandomCount,
  getTop10Media,
  getTop5UsersByStickerCount,
  countMedia
};