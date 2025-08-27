const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const fs = require('fs');
const os = require('os');
const mime = require('mime-types');
const { getAiAnnotations } = require('./services/ai'); // Importa a função IA
const axios = require('axios');
const MediaQueue = require('./services/mediaQueue');
const DatabaseHandler = require('./services/databaseHandler');

// Conditional loading for FFmpeg - these may fail in some environments due to network restrictions
let ffmpeg = null;
let ffmpegPath = null;

try {
  ffmpeg = require('fluent-ffmpeg');
  ffmpegPath = require('ffmpeg-static');
  
  if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
  }
} catch (error) {
  console.warn('[Database] FFmpeg não disponível:', error.message);
  console.warn('[Database] Funcionalidades de reparo de WebP serão desabilitadas');
}

// Variável para caminho da pasta de figurinhas antigas será lida do .env
const OLD_STICKERS_PATH = process.env.OLD_STICKERS_PATH || null;
// Limite de figurinhas para processar por vez
const PROCESS_BATCH_SIZE = 5;

const dbPath = path.resolve(__dirname, 'media.db');
const db = new sqlite3.Database(dbPath);

// Initialize enhanced database handler and media queue
const dbHandler = new DatabaseHandler(db);
const mediaQueue = new MediaQueue({ 
  concurrency: 3, 
  retryAttempts: 5, 
  retryDelay: 1000 
});

// Handle WAL recovery on startup
const walPath = path.resolve(__dirname, 'media.db-wal');
const dbExists = fs.existsSync(dbPath);
const walExists = fs.existsSync(walPath);

if (walExists && (!dbExists || fs.statSync(walPath).size > 0)) {
  console.log('[DB] WAL file detected, performing recovery checkpoint...');
  // Ensure WAL data is committed to main database
  setTimeout(async () => {
    try {
      await dbHandler.checkpointWAL();
      console.log('[DB] WAL checkpoint completed successfully');
    } catch (error) {
      console.error('[DB] WAL checkpoint failed:', error);
    }
  }, 100); // Small delay to ensure DB is ready
}

// Queue event listeners for monitoring
mediaQueue.on('jobAdded', (jobId) => {
  console.log(`[Queue] Job ${jobId} added to queue`);
});

mediaQueue.on('jobStarted', (jobId, attempt) => {
  console.log(`[Queue] Job ${jobId} started (attempt ${attempt})`);
});

mediaQueue.on('jobCompleted', (jobId) => {
  console.log(`[Queue] Job ${jobId} completed successfully`);
});

mediaQueue.on('jobRetry', (jobId, attempt, error) => {
  console.warn(`[Queue] Job ${jobId} retry attempt ${attempt}: ${error.message}`);
});

mediaQueue.on('jobFailed', (jobId, error) => {
  console.error(`[Queue] Job ${jobId} failed permanently: ${error.message}`);
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

  // Tabela de contatos (exibição de nome dos usuários no ranking)
  db.run(`
    CREATE TABLE IF NOT EXISTS contacts (
      sender_id TEXT PRIMARY KEY,
      display_name TEXT,
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    )
  `);

  // Índices auxiliares
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_timestamp ON media(timestamp DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_sender_id ON media(sender_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_nsfw ON media(nsfw)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_tags_tag_id ON media_tags(tag_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_tags_media_id ON media_tags(media_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_contacts_display_name ON contacts(display_name)`);
  
  // Additional performance indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_count_random ON media(count_random DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_file_path ON media(file_path)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_description ON media(description)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_nsfw_timestamp ON media(nsfw, timestamp DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tags_usage_count ON tags(usage_count DESC)`);
  
  // Critical index for duplicate detection - hash_visual is heavily used
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_hash_visual ON media(hash_visual)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_hash_md5 ON media(hash_md5)`);

  // Check media count after tables are created
  db.get('SELECT COUNT(*) as total FROM media', (err, row) => {
    if (err) {
      console.error("[DB] ERRO ao acessar tabela 'media':", err);
    } else {
      console.log(`[DB] Tabela 'media' tem ${row.total} registros.`);
    }
  });
 });

// Set up periodic WAL checkpoints to prevent data loss
setInterval(async () => {
  try {
    await dbHandler.checkpointWAL();
    console.log('[DB] Periodic WAL checkpoint completed');
  } catch (error) {
    console.warn('[DB] Periodic WAL checkpoint warning:', error.message);
  }
}, 5 * 60 * 1000); // Every 5 minutes

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

/**
 * Robustly processes WebP files with corruption handling and repair attempts
 * @param {Buffer} buffer - Original file buffer
 * @param {string} fileName - File name for logging
 * @returns {Promise<Buffer>} - Processed WebP buffer
 */
async function processWebpWithRepair(buffer, fileName) {
  // First attempt: Try standard Sharp processing
  try {
    const webpBuffer = await sharp(buffer, { animated: true }).webp().toBuffer();
    return webpBuffer;
  } catch (sharpError) {
    console.warn(`[old-stickers] Sharp failed for ${fileName}: ${sharpError.message}`);
    
    // Second attempt: Try without animated flag (may help with some corrupted animated WebPs)
    try {
      const webpBuffer = await sharp(buffer).webp().toBuffer();
      console.log(`[old-stickers] ✅ Recovered ${fileName} by disabling animated flag`);
      return webpBuffer;
    } catch (secondError) {
      console.warn(`[old-stickers] Sharp non-animated failed for ${fileName}: ${secondError.message}`);
      
      // Third attempt: Try to repair using ffmpeg conversion
      if (ffmpeg && ffmpegPath) {
      try {
        const tempDir = path.join(os.tmpdir(), 'myapp-temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const uniqueId = crypto.randomBytes(16).toString('hex');
        const tempInput = path.join(tempDir, `repair_input_${uniqueId}.webp`);
        const tempOutput = path.join(tempDir, `repair_output_${uniqueId}.webp`);
        try {
            // Write corrupted file to temp location
            fs.writeFileSync(tempInput, buffer);
            
            // Use ffmpeg to repair/re-encode the WebP
            await new Promise((resolve, reject) => {
              ffmpeg(tempInput)
                .outputOptions(['-c:v libwebp', '-q:v 80', '-preset default', '-an'])
                .output(tempOutput)
                .on('end', resolve)
                .on('error', reject)
                .run();
            });
            
            // Read the repaired file
            const repairedBuffer = fs.readFileSync(tempOutput);
            
            // Process with Sharp again
            const webpBuffer = await sharp(repairedBuffer, { animated: true }).webp().toBuffer();
            console.log(`[old-stickers] ✅ Recovered ${fileName} using ffmpeg repair`);
            return webpBuffer;
            
          } finally {
            // Always clean up temp files
            try { fs.unlinkSync(tempInput); } catch (err) {
              if (err.code !== 'ENOENT') {
                console.warn(`[old-stickers] Failed to delete tempInput (${tempInput}): ${err.message}`);
              }
            }
            try { fs.unlinkSync(tempOutput); } catch (err) {
              if (err.code !== 'ENOENT') {
                console.warn(`[old-stickers] Failed to delete tempOutput (${tempOutput}): ${err.message}`);
              }
            }
          }
          
        } catch (ffmpegError) {
          console.warn(`[old-stickers] ffmpeg repair failed for ${fileName}: ${ffmpegError.message}`);
        }
      } else {
        console.warn(`[old-stickers] FFmpeg não disponível, pulando tentativa de reparo para ${fileName}`);
      }
      
      // Fourth attempt: Try to extract first frame only if it's a WebP
        try {
          // For WebP files, try to extract just the first frame
          const metadata = await sharp(buffer).metadata();
          if (metadata.pages && metadata.pages > 1) {
            // This is animated, try to get first frame
            const webpBuffer = await sharp(buffer, { animated: false, page: 0 }).webp().toBuffer();
            console.log(`[old-stickers] ⚠️ Recovered ${fileName} by extracting first frame only (animation lost)`);
            return webpBuffer;
          }
        } catch (frameError) {
          console.warn(`[old-stickers] Frame extraction failed for ${fileName}: ${frameError.message}`);
        }
        
        // Final fallback: If it's not a WebP originally, try to convert from original format
        try {
          const webpBuffer = await sharp(buffer).webp().toBuffer();
          console.log(`[old-stickers] ⚠️ Recovered ${fileName} by treating as non-WebP format`);
          return webpBuffer;
        } catch (finalError) {
          // All recovery attempts failed
          throw new Error(`All repair attempts failed. Last error: ${finalError.message}`);
        }
      }
    }
  }

// Processa figurinhas antigas da pasta para inserir no banco as que ainda não existem ou modificadas
async function processOldStickers() {
  if (!OLD_STICKERS_PATH) {
    console.warn('OLD_STICKERS_PATH não configurado no .env');
    return [];
  }

  const insertedMedias = [];
  
  // Extensões de arquivos de imagem permitidas
  const allowedExts = new Set(['.webp', '.png', '.jpg', '.jpeg', '.gif', '.bmp']);

  try {
    const files = fs.readdirSync(OLD_STICKERS_PATH);
    
    // Filtra os arquivos que ainda não foram processados ou foram modificados
    const filesToProcess = [];
    for (const file of files) {
      const filePath = path.join(OLD_STICKERS_PATH, file);
      
      try {
        const stats = fs.statSync(filePath);
        
        // Ignora se não é arquivo, é oculto, ou não tem extensão permitida
        if (!stats.isFile()) continue;
        if (file.startsWith('.')) continue;
        
        const ext = path.extname(file).toLowerCase();
        if (!allowedExts.has(ext)) continue;
        
        const lastModified = stats.mtimeMs;

        const alreadyProcessed = await isFileProcessed(file, lastModified);
        if (!alreadyProcessed) {
          filesToProcess.push({ file, filePath, lastModified });
        }
        if (filesToProcess.length >= PROCESS_BATCH_SIZE) break;
      } catch (errStat) {
        console.warn(`[old-stickers] Erro ao verificar arquivo: ${file} - Motivo: ${errStat?.message || errStat}`);
        continue;
      }
    }

    // Processa o batch limitado
    for (const { file, filePath, lastModified } of filesToProcess) {
      try {
        const bufferOriginal = fs.readFileSync(filePath);

        // Converter para webp antes do hash visual para padronizar, com suporte a animados
        // Usa função robusta para lidar com arquivos corrompidos
        const bufferWebp = await processWebpWithRepair(bufferOriginal, file);

        const hashVisual = await getHashVisual(bufferWebp);

        if (!hashVisual) continue;

        const existing = await findByHashVisual(hashVisual);
        if (existing) {
          // Marca como processado mesmo se já existe para evitar retrabalho
          await upsertProcessedFile(file, lastModified);
          continue;
        }

        // Determina o mimetype baseado na extensão original
        const mimetype = mime.lookup(filePath) || 'application/octet-stream';

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
          mimetype,
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
      } catch (errFile) {
        console.warn(`[old-stickers] Ignorando arquivo inválido/corrompido: ${file} - Motivo: ${errFile?.message || errFile}`);
        continue;
      }
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
  
  // Use the queue to process tags sequentially to avoid race conditions
  for (const tag of tags) {
    const tagTrim = tag.trim();
    if (!tagTrim) continue;

    const tagId = await mediaQueue.add(async () => {
      // Check if tag exists
      const existingTag = await dbHandler.get(
        `SELECT id, usage_count FROM tags WHERE LOWER(name) = LOWER(?)`, 
        [tagTrim]
      );

      if (existingTag) {
        // Update usage count
        await dbHandler.run(
          `UPDATE tags SET usage_count = usage_count + 1 WHERE id = ?`, 
          [existingTag.id]
        );
        return existingTag.id;
      } else {
        // Insert new tag
        const result = await dbHandler.run(
          `INSERT INTO tags(name, usage_count) VALUES (?, 1)`, 
          [tagTrim]
        );
        return result.lastID;
      }
    });
    
    tagIds.push(tagId);
  }
  
  return tagIds;
}

// Associa tags de tagIds a uma mídia mediaId na tabela media_tags
function associateTagsToMedia(mediaId, tagIds) {
  if (!tagIds.length) return Promise.resolve();
  
  return mediaQueue.add(async () => {
    const placeholders = tagIds.map(() => '(?, ?)').join(',');
    const params = [];
    tagIds.forEach(tagId => { params.push(mediaId, tagId) });
    const sql = `INSERT OR IGNORE INTO media_tags(media_id, tag_id) VALUES ${placeholders}`;
    
    return dbHandler.run(sql, params);
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
  // Queue the media saving operation to prevent SQLITE_BUSY errors
  return mediaQueue.add(async () => {
    const sql = `
      INSERT INTO media (chat_id, group_id, sender_id, file_path, mimetype, timestamp, description, hash_visual, hash_md5, nsfw, count_random)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `;
    
    const result = await dbHandler.run(sql, [
      chatId,
      groupId,
      senderId,
      filePath,
      mimetype,
      timestamp,
      description,
      hashVisual,
      hashMd5,
      nsfw
    ]);
    
    const mediaId = result.lastID;
    
    // Process and associate tags if provided
    if (tags) {
      await processAndAssociateTags(mediaId, tags);
    }
    
    return mediaId;
  });
}

function incrementRandomCount(id) {
  return mediaQueue.add(async () => {
    return dbHandler.run(
      `UPDATE media SET count_random = count_random + 1 WHERE id = ?`,
      [id]
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

// Atualiza a função para retornar display_name via JOIN com contacts
// Inclui fallback para chat_id/group_id quando sender_id é nulo
// Exclui envios do bot (identificados por padrões específicos)
function getTop5UsersByStickerCount(groupId = null) {
  return new Promise((resolve, reject) => {
    let sql = `
      SELECT
        -- Prioriza sender_id, depois chat_id, depois group_id
        COALESCE(m.sender_id, m.chat_id, m.group_id) as effective_sender,
        m.sender_id,
        m.chat_id, 
        m.group_id,
        COUNT(*) AS sticker_count,
        COALESCE(c.display_name, '') AS display_name,
        -- Identifica se é grupo
        CASE WHEN m.group_id IS NOT NULL AND m.sender_id IS NULL THEN 1 ELSE 0 END as is_group
      FROM media m
      LEFT JOIN contacts c ON c.sender_id = COALESCE(m.sender_id, m.chat_id)
      WHERE COALESCE(m.sender_id, m.chat_id, m.group_id) IS NOT NULL
        -- Exclui envios do próprio bot (envios programados/automáticos)
        AND NOT (
          m.sender_id LIKE '%bot%' OR 
          m.chat_id LIKE '%bot%' OR
          m.sender_id = m.chat_id AND m.group_id IS NULL -- Possível padrão de bot
        )
    `;
    const params = [];
    if (groupId) {
      sql += ` AND m.group_id = ?`;
      params.push(groupId);
    }
    sql += `
      GROUP BY effective_sender
      ORDER BY sticker_count DESC
      LIMIT 5
    `;
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// Retorna estatísticas sobre contatos que precisam ser migrados
function getHistoricalContactsStats() {
  return new Promise((resolve, reject) => {
    const statsQueries = {
      totalMediaWithSender: `
        SELECT COUNT(*) as count 
        FROM media 
        WHERE sender_id IS NOT NULL AND sender_id != ''
      `,
      existingContacts: `
        SELECT COUNT(*) as count 
        FROM contacts
      `,
      uniqueSendersInMedia: `
        SELECT COUNT(DISTINCT sender_id) as count 
        FROM media 
        WHERE sender_id IS NOT NULL AND sender_id != ''
      `,
      sendersNeedingMigration: `
        SELECT COUNT(DISTINCT m.sender_id) as count
        FROM media m
        LEFT JOIN contacts c ON c.sender_id = m.sender_id
        WHERE m.sender_id IS NOT NULL 
          AND m.sender_id != '' 
          AND c.sender_id IS NULL
      `
    };
    
    const results = {};
    const queryKeys = Object.keys(statsQueries);
    let completed = 0;
    
    queryKeys.forEach(key => {
      db.get(statsQueries[key], [], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        results[key] = row.count;
        completed++;
        
        if (completed === queryKeys.length) {
          resolve(results);
        }
      });
    });
  });
}

// Migra entradas históricas da tabela media para a tabela contacts
// Para que os envios históricos sejam contabilizados no ranking de usuários
async function migrateHistoricalContacts(logger = console) {
  return new Promise((resolve, reject) => {
    logger.log('[migrate] Iniciando migração de contatos históricos...');
    
    // Busca todos os sender_ids únicos da tabela media que não existem na tabela contacts
    const sql = `
      SELECT DISTINCT m.sender_id 
      FROM media m
      LEFT JOIN contacts c ON c.sender_id = m.sender_id
      WHERE m.sender_id IS NOT NULL 
        AND m.sender_id != '' 
        AND c.sender_id IS NULL
    `;
    
    db.all(sql, [], (err, rows) => {
      if (err) {
        console.error('[migrate] Erro ao buscar sender_ids históricos:', err);
        reject(err);
        return;
      }
      
      if (!rows || rows.length === 0) {
        console.log('[migrate] Nenhum contato histórico para migrar.');
        resolve(0);
        return;
      }
      
      console.log(`[migrate] Encontrados ${rows.length} contatos históricos para migrar.`);
      
      let processedCount = 0;
      let errorCount = 0;
      
      // Processa cada sender_id único
      const processNext = () => {
        if (processedCount + errorCount >= rows.length) {
          const successCount = processedCount;
          console.log(`[migrate] Migração concluída. Sucessos: ${successCount}, Erros: ${errorCount}`);
          resolve(successCount);
          return;
        }
        
        const row = rows[processedCount + errorCount];
        const senderId = row.sender_id;
        
        // Insere contato com display_name vazio (será preenchido quando o usuário interagir novamente)
        db.run(`
          INSERT INTO contacts(sender_id, display_name, updated_at)
          VALUES (?, '', strftime('%s','now'))
        `, [senderId], (insertErr) => {
          if (insertErr) {
            console.error(`[migrate] Erro ao inserir contato para ${senderId}:`, insertErr);
            errorCount++;
          } else {
            processedCount++;
            if (processedCount % 50 === 0) {
              console.log(`[migrate] Processados ${processedCount} contatos...`);
            }
          }
          
          // Continua processamento
          setImmediate(processNext);
        });
      };
      
      // Inicia processamento
      processNext();
    });
  });
}

// Nova função para obter nome de grupo (placeholder - seria preenchido por integração com WhatsApp)
function getGroupName(groupId) {
  // Por enquanto, extrai um nome "amigável" do ID do grupo
  if (!groupId || !groupId.includes('@g.us')) {
    return null;
  }
  
  // Remove @g.us e pega primeiros caracteres como nome temporário
  const cleanId = groupId.replace('@g.us', '');
  return `Grupo ${cleanId.substring(0, 10)}...`;
}

// Função aprimorada de migração que inclui chat_id/group_id quando sender_id é nulo
async function migrateMediaWithMissingSenderId(logger = console) {
  return new Promise((resolve, reject) => {
    logger.log('[migrate] Iniciando migração de mídias com sender_id faltante...');
    
    // Busca mídias que não têm sender_id mas têm chat_id ou group_id
    const sql = `
      SELECT DISTINCT 
        COALESCE(m.chat_id, m.group_id) as effective_id,
        m.group_id,
        m.chat_id,
        COUNT(*) as media_count
      FROM media m
      LEFT JOIN contacts c ON c.sender_id = COALESCE(m.chat_id, m.group_id)
      WHERE (m.sender_id IS NULL OR m.sender_id = '') 
        AND COALESCE(m.chat_id, m.group_id) IS NOT NULL
        AND COALESCE(m.chat_id, m.group_id) != ''
        AND c.sender_id IS NULL  -- Ainda não existe na tabela contacts
      GROUP BY effective_id
    `;
    
    db.all(sql, [], (err, rows) => {
      if (err) {
        logger.error('[migrate] Erro ao buscar mídias com sender_id faltante:', err);
        reject(err);
        return;
      }
      
      if (!rows || rows.length === 0) {
        logger.log('[migrate] Nenhuma mídia com sender_id faltante para migrar.');
        resolve(0);
        return;
      }
      
      logger.log(`[migrate] Encontradas ${rows.length} IDs únicos para migrar (${rows.reduce((sum, r) => sum + r.media_count, 0)} mídias total).`);
      
      let processedCount = 0;
      let errorCount = 0;
      
      // Processa cada effective_id único
      const processNext = () => {
        if (processedCount + errorCount >= rows.length) {
          const successCount = processedCount;
          logger.log(`[migrate] Migração de IDs faltantes concluída. Sucessos: ${successCount}, Erros: ${errorCount}`);
          resolve(successCount);
          return;
        }
        
        const row = rows[processedCount + errorCount];
        const effectiveId = row.effective_id;
        const isGroup = row.group_id === effectiveId;
        
        // Para grupos, usar nome de grupo; para usuários, nome vazio será preenchido depois
        let displayName = '';
        if (isGroup) {
          displayName = getGroupName(effectiveId);
        }
        
        // Insere contato usando effective_id
        db.run(`
          INSERT INTO contacts(sender_id, display_name, updated_at)
          VALUES (?, ?, strftime('%s','now'))
        `, [effectiveId, displayName], (insertErr) => {
          if (insertErr) {
            logger.error(`[migrate] Erro ao inserir contato para ${effectiveId}:`, insertErr);
            errorCount++;
          } else {
            processedCount++;
            if (processedCount % 50 === 0) {
              logger.log(`[migrate] Processados ${processedCount} IDs faltantes...`);
            }
          }
          
          // Continua processamento
          setImmediate(processNext);
        });
      };
      
      // Inicia processamento
      processNext();
    });
  });
}

// ---- Duplicate Media Detection and Management Functions ----

/**
 * Find duplicate media based on visual hash
 * Returns groups of duplicated media
 */
async function findDuplicateMedia(limit = 50) {
  const sql = `
    SELECT 
      hash_visual,
      COUNT(*) as duplicate_count,
      GROUP_CONCAT(id) as media_ids,
      MIN(timestamp) as first_created,
      MAX(timestamp) as last_created
    FROM media 
    WHERE hash_visual IS NOT NULL 
    GROUP BY hash_visual 
    HAVING COUNT(*) > 1
    ORDER BY duplicate_count DESC, first_created DESC
    LIMIT ?
  `;
  
  const rows = await dbHandler.all(sql, [limit]);
  
  // Parse the grouped results
  return rows.map(row => ({
    hash_visual: row.hash_visual,
    duplicate_count: row.duplicate_count,
    media_ids: row.media_ids.split(',').map(id => parseInt(id)),
    first_created: row.first_created,
    last_created: row.last_created
  }));
}

/**
 * Get detailed information about duplicate media group
 */
async function getDuplicateMediaDetails(hashVisual) {
  const sql = `
    SELECT 
      m.id,
      m.chat_id,
      m.group_id,
      m.sender_id,
      m.file_path,
      m.mimetype,
      m.timestamp,
      m.description,
      m.nsfw,
      m.count_random,
      c.display_name
    FROM media m
    LEFT JOIN contacts c ON c.sender_id = m.sender_id
    WHERE m.hash_visual = ?
    ORDER BY m.timestamp ASC
  `;
  
  return dbHandler.all(sql, [hashVisual]);
}

/**
 * Delete duplicate media (keeps the oldest one)
 * Returns count of deleted records
 */
async function deleteDuplicateMedia(hashVisual, keepOldest = true) {
  return mediaQueue.add(async () => {
    // Get all media with this hash
    const duplicates = await getDuplicateMediaDetails(hashVisual);
    
    if (duplicates.length <= 1) {
      return 0; // No duplicates to delete
    }
    
    // Determine which ones to delete
    const sorted = duplicates.sort((a, b) => 
      keepOldest ? a.timestamp - b.timestamp : b.timestamp - a.timestamp
    );
    
    const toKeep = sorted[0];
    const toDelete = sorted.slice(1);
    
    let deletedCount = 0;
    
    // Use transaction for atomicity
    const operations = [];
    
    for (const media of toDelete) {
      // Delete media_tags associations
      operations.push({
        sql: `DELETE FROM media_tags WHERE media_id = ?`,
        params: [media.id]
      });
      
      // Delete media record
      operations.push({
        sql: `DELETE FROM media WHERE id = ?`,
        params: [media.id]
      });
      
      // Delete file from filesystem if it exists
      if (media.file_path && fs.existsSync(media.file_path)) {
        try {
          fs.unlinkSync(media.file_path);
        } catch (err) {
          console.warn(`Failed to delete file ${media.file_path}:`, err.message);
        }
      }
      
      deletedCount++;
    }
    
    if (operations.length > 0) {
      await dbHandler.transaction(operations);
    }
    
    console.log(`Deleted ${deletedCount} duplicate media files, kept media ID ${toKeep.id}`);
    return deletedCount;
  });
}

/**
 * Delete specific media by IDs (for manual selection)
 */
async function deleteMediaByIds(mediaIds) {
  if (!Array.isArray(mediaIds) || mediaIds.length === 0) {
    return 0;
  }
  
  return mediaQueue.add(async () => {
    let deletedCount = 0;
    const operations = [];
    
    for (const mediaId of mediaIds) {
      // Get file path before deletion
      const media = await dbHandler.get(`SELECT file_path FROM media WHERE id = ?`, [mediaId]);
      
      if (media) {
        // Delete media_tags associations
        operations.push({
          sql: `DELETE FROM media_tags WHERE media_id = ?`,
          params: [mediaId]
        });
        
        // Delete media record
        operations.push({
          sql: `DELETE FROM media WHERE id = ?`,
          params: [mediaId]
        });
        
        // Delete file from filesystem if it exists
        if (media.file_path && fs.existsSync(media.file_path)) {
          try {
            fs.unlinkSync(media.file_path);
          } catch (err) {
            console.warn(`Failed to delete file ${media.file_path}:`, err.message);
          }
        }
        
        deletedCount++;
      }
    }
    
    if (operations.length > 0) {
      await dbHandler.transaction(operations);
    }
    
    console.log(`Deleted ${deletedCount} media files by ID selection`);
    return deletedCount;
  });
}

/**
 * Get duplicate statistics
 */
async function getDuplicateStats() {
  const sql = `
    SELECT 
      COUNT(DISTINCT hash_visual) as duplicate_groups,
      COUNT(*) as total_duplicates,
      SUM(CASE WHEN duplicate_count > 2 THEN duplicate_count - 1 ELSE 1 END) as potential_savings
    FROM (
      SELECT hash_visual, COUNT(*) as duplicate_count
      FROM media 
      WHERE hash_visual IS NOT NULL 
      GROUP BY hash_visual 
      HAVING COUNT(*) > 1
    ) as duplicates
  `;
  
  const result = await dbHandler.get(sql);
  return result || { duplicate_groups: 0, total_duplicates: 0, potential_savings: 0 };
}

module.exports = {
  db,
  dbHandler,
  mediaQueue,
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
  processWebpWithRepair, // Export for testing
  getMediaWithLowestRandomCount,
  getTop10Media,
  getTop5UsersByStickerCount,
  countMedia,
  getHistoricalContactsStats,
  migrateHistoricalContacts,
  migrateMediaWithMissingSenderId,
  getGroupName,
  // New duplicate management functions
  findDuplicateMedia,
  getDuplicateMediaDetails,
  deleteDuplicateMedia,
  deleteMediaByIds,
  getDuplicateStats
};

// Admin bootstrap is handled by the web server's safer initialization path
// which generates a random password and sets must_change_password=1