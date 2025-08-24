const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const fs = require('fs');
const { getAiAnnotations } = require('./services/ai'); // Importa a função IA
const axios = require('axios');

// Variável para caminho da pasta de figurinhas antigas será lida do .env
const OLD_STICKERS_PATH = process.env.OLD_STICKERS_PATH || null;
// Limite de figurinhas para processar por vez
const PROCESS_BATCH_SIZE = 5;

const dbPath = path.resolve(__dirname, 'media.db');
const db = new sqlite3.Database(dbPath);

db.get('SELECT COUNT(*) as total FROM media', (err, row) => {
  if (err) {
    console.error("[DB] ERRO ao acessar tabela 'media':", err);
  } else {
    console.log(`[DB] Tabela 'media' tem ${row.total} registros.`);
  }
});

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

  // Nova tabela para tags únicas
  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      usage_count INTEGER DEFAULT 0
    )
  `);

  // Tabela intermediária para relação N:N entre media e tags
  db.run(`
    CREATE TABLE IF NOT EXISTS media_tags (
      media_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY(media_id, tag_id),
      FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE,
      FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )
  `);
  // Tabela de usuários para login do painel
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at INTEGER NOT NULL
    )
  `);
  // Índices auxiliares
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_timestamp ON media(timestamp DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_sender_id ON media(sender_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_nsfw ON media(nsfw)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_tags_tag_id ON media_tags(tag_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_tags_media_id ON media_tags(media_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)`);
 });

// Gera hash MD5 de um buffer
function getMD5(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}
//Função para buscar sinônimos
async function getSynonyms(word) {
  try {
    const res = await axios.post('http://localhost:5000/synonyms', { word });
    return res.data.synonyms || [];
  } catch (err) {
    console.error('Erro consultando sinônimos:', err.message);
    return [];
  }
}
// Função para expandir as tags com sinônimos via WordNet+OMW microserviço
async function expandTagsWithSynonyms(tags) {
  const expandedSet = new Set();

  for (const tag of tags) {
    const trimmedTag = tag.trim();
    if (!trimmedTag) continue;
    expandedSet.add(trimmedTag.toLowerCase());

    try {
      const syns = await getSynonyms(trimmedTag);
      syns.forEach(s => expandedSet.add(s.toLowerCase()));
    } catch (e) {
      console.warn(`Falha ao obter sinônimos para tag "${trimmedTag}":`, e);
    }
  }

  return Array.from(expandedSet);
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

// Busca tags semelhantes para certos termos (simplificação com LIKE)
async function findSimilarTags(tagCandidates) {
  if (!tagCandidates.length) return [];

  // Expande as tags com seus sinônimos
  const expandedTags = await expandTagsWithSynonyms(tagCandidates);

  return new Promise((resolve, reject) => {
    const placeholders = expandedTags.map(() => 'LOWER(name) LIKE ?').join(' OR ');
    const params = expandedTags.map(t => `%${t}%`);

    db.all(
      `SELECT id, name FROM tags WHERE ${placeholders} LIMIT 10`,
      params,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

// Adiciona tags que não existem e atualiza uso_count para existentes
async function addOrUpdateTags(tags) {
  const tagIds = [];
  for (const tag of tags) {
    const tagTrim = tag.trim();
    if (!tagTrim) continue;

    const existingTag = await new Promise((resolve, reject) =>
      db.get(`SELECT id, usage_count FROM tags WHERE LOWER(name) = LOWER(?)`, [tagTrim], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      })
    );

    if (existingTag) {
      await new Promise((resolve, reject) =>
        db.run(`UPDATE tags SET usage_count = usage_count + 1 WHERE id = ?`, [existingTag.id], function (e) {
          if (e) reject(e);
          else resolve();
        })
      );
      tagIds.push(existingTag.id);
    } else {
      const newTagId = await new Promise((resolve, reject) =>
        db.run(`INSERT INTO tags(name, usage_count) VALUES (?, 1)`, [tagTrim], function (e) {
          if (e) reject(e);
          else resolve(this.lastID);
        })
      );
      tagIds.push(newTagId);
    }
  }
  return tagIds;
}

// Associa tags de tagIds a uma mídia mediaId na tabela media_tags
function associateTagsToMedia(mediaId, tagIds) {
  return new Promise((resolve, reject) => {
    if (!tagIds.length) return resolve();
    const placeholders = tagIds.map(() => '(?, ?)').join(',');
    const params = [];
    tagIds.forEach(tagId => { params.push(mediaId, tagId) });
    const sql = `INSERT OR IGNORE INTO media_tags(media_id, tag_id) VALUES ${placeholders}`;
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Processa e associa tags ao salvar mídia
async function processAndAssociateTags(mediaId, newTagsRaw) {
  if (!newTagsRaw) return;

  let newTags = Array.isArray(newTagsRaw) ? newTagsRaw : newTagsRaw.split(',').map(t => t.trim()).filter(Boolean);

  // Buscar tags similares existentes considerando sinônimos expandidos
  const similarTags = await findSimilarTags(newTags);
  const similarTagNames = similarTags.map(t => t.name.toLowerCase());

  // Tags para inserir (quando poucas similares)
  const tagsToInsert = [];

  for (const tag of newTags) {
    const lowerTag = tag.toLowerCase();
    const matched = similarTagNames.filter(n => n.includes(lowerTag) || lowerTag.includes(n));
    if (matched.length < 3) {
      tagsToInsert.push(tag);
    }
  }

  const combinedTags = [...new Set(similarTags.map(t => t.name).concat(tagsToInsert))];

  // Inserir/atualizar tags e pegar IDs
  const tagIds = await addOrUpdateTags(combinedTags);

  // Associar tags à media
  await associateTagsToMedia(mediaId, tagIds);
}
async function replaceTagsForMedia(mediaId, newTags) {
  return new Promise((resolve, reject) => {
    db.serialize(async () => {
      try {
        // 1. Deleta associações antigas
        db.run(`DELETE FROM media_tags WHERE media_id = ?`, [mediaId], async (err) => {
          if (err) return reject(err);

          // 2. Insere/atualiza tags na tabela tags e obtém ids
          const tagIds = await addOrUpdateTags(newTags);

          // 3. Associa tags à mídia
          await associateTagsToMedia(mediaId, tagIds);

          resolve();
        });
      } catch (ex) {
        reject(ex);
      }
    });
  });
}
async function saveMedia({
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
      INSERT INTO media (chat_id, group_id, sender_id, file_path, mimetype, timestamp, description, hash_visual, hash_md5, nsfw, count_random)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
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
      hashVisual,
      hashMd5,
      nsfw,
      async function (err) {
        if (err) return reject(err);
        const mediaId = this.lastID;
        try {
          await processAndAssociateTags(mediaId, tags);
          resolve(mediaId);
        } catch (e) {
          reject(e);
        }
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
// Função para obter as tags associadas a uma mídia via tabela media_tags e tags
function getTagsForMedia(mediaId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT tags.name FROM tags INNER JOIN media_tags ON tags.id = media_tags.tag_id WHERE media_tags.media_id = ?`,
      [mediaId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(r => r.name));
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

// Atualiza tags da mídia usando estrutura de tabelas normalizadas media_tags e tags
async function updateMediaTags(mediaId, newTagsToAdd) {
  if (!mediaId) throw new Error('mediaId obrigatório');

  let newTagsArray = [];
  if (typeof newTagsToAdd === 'string') {
    newTagsArray = newTagsToAdd.split(',').map(t => t.trim()).filter(Boolean);
  } else if (Array.isArray(newTagsToAdd)) {
    newTagsArray = newTagsToAdd.map(t => t.trim()).filter(Boolean);
  }

  // Usa a função que remove associações antigas e associa as novas tags
  await replaceTagsForMedia(mediaId, newTagsArray);

  return newTagsArray.length;
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

//Atualiza a descrição da figurinha, tentando primeiro adicionar na descrição existente
//se for muito grande, limpa a anterio e aí sim adiciona
async function updateMediaDescription(mediaId, newDescriptionToAdd) {
  if (!mediaId) throw new Error('mediaId obrigatório');

  const MAX_DESCRIPTION_LENGTH = 1024;

  const media = await findById(mediaId);
  if (!media) throw new Error('Mídia não encontrada');

  let currentDescription = media.description || '';
  let currentTags = media.tags || '';

  // Normaliza tags para string
  if (Array.isArray(currentTags)) currentTags = currentTags.join(',');

  if (typeof newDescriptionToAdd !== 'string') newDescriptionToAdd = String(newDescriptionToAdd);

  let combinedDescription = currentDescription ? (currentDescription.trim() + ' ' + newDescriptionToAdd.trim()) : newDescriptionToAdd.trim();

  if (combinedDescription.length > MAX_DESCRIPTION_LENGTH) {
    // Se exceder limite, substitui descrição e limpa tags
    combinedDescription = newDescriptionToAdd.trim();
    currentTags = '';
    // Atualiza tags limpando
    await updateMediaTags(mediaId, currentTags);
  }

  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE media SET description = ? WHERE id = ?`,
      [combinedDescription, mediaId],
      function (err) {
        if (err) reject(err);
        else resolve(this.changes);
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
  db,
  saveMedia,
  getRandomMedia,
  incrementRandomCount,
  getMD5,
  getHashVisual,
  findByHashVisual,
  findById,
  updateMediaTags,
  getTagsForMedia,
  updateMediaDescription,
  processOldStickers,
  getMediaWithLowestRandomCount,
  getTop10Media,
  getTop5UsersByStickerCount,
  countMedia
};

// Bootstrap do usuário admin (usa variáveis de ambiente ADMIN_USER / ADMIN_PASS)
const bcryptBootstrap = require('bcryptjs');
(function ensureAdmin() {
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASS || 'admin123';
  db.get(`SELECT id FROM users WHERE username = ?`, [username], async (err, row) => {
    if (err) return console.error('Erro ao verificar admin:', err);
    if (row) return;
    try {
      const hash = await bcryptBootstrap.hash(password, 10);
      db.run(
        `INSERT INTO users (username, password_hash, role, created_at) VALUES (?,?,?,?)`,
        [username, hash, 'admin', Date.now()],
        (e2) => {
          if (e2) console.error('Erro criando admin:', e2);
          else console.log('[bootstrap] Usuário admin criado:', username);
        }
      );
    } catch (e) {
      console.error('Erro hash admin:', e);
    }
  });
})();