const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const OpenAI = require('openai');
const sharp = require('sharp');

const { downloadMediaForMessage } = require('../utils/mediaDownload');

require('dotenv').config();

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const IMAGE_DIR = path.join(DATA_DIR, 'memes');
const DB_PATH = path.join(DATA_DIR, 'memes.sqlite');
const DATASET_PATH = path.join(DATA_DIR, 'prompt_training_set.json');
const EXPORT_PATH = path.join(DATA_DIR, 'memes_best.json');
const IMAGE_MODEL = 'gpt-image-1';
const IMAGE_SIZE = process.env.MEME_IMAGE_SIZE || '1024x1024';
const DEFAULT_IMAGE_QUALITY = process.env.MEME_IMAGE_QUALITY || 'low';
const PROMPT_MODEL = process.env.MEME_PROMPT_MODEL || 'gpt-4o-mini';
const TRANSCRIPTION_LANGUAGE = process.env.MEME_TRANSCRIPTION_LANGUAGE || 'pt';
const PROMPT_CACHE_SIZE = 20;

let dbInstance = null;
let openaiClient = null;
let initialized = false;
let promptCache = [];

function ensureDataDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

function ensureOpenAiClient() {
  if (openaiClient) return openaiClient;
  const apiKey = process.env.OPENAI_API_KEY_MEMECREATOR;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY_MEMECREATOR ausente');
  }
  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

async function getDb() {
  if (dbInstance) return dbInstance;
  await initMemesDB();
  return dbInstance;
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function runCallback(err) {
      if (err) return reject(err);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function ensureMensagemIdColumn(db) {
  const info = await all(db, 'PRAGMA table_info(memes)');
  const hasColumn = info.some((col) => col.name === 'mensagem_id');
  if (!hasColumn) {
    await run(db, 'ALTER TABLE memes ADD COLUMN mensagem_id TEXT');
  }
}

async function ensureMessageMapTable(db) {
  await run(db, `CREATE TABLE IF NOT EXISTS meme_messages (
    mensagem_id TEXT PRIMARY KEY,
    meme_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function refreshPromptCache(db) {
  const rows = await all(
    db,
    'SELECT id, texto_original, prompt_final, reacoes_precisas, tipo FROM memes_top ORDER BY reacoes_precisas DESC, id DESC LIMIT ?',
    [PROMPT_CACHE_SIZE]
  );
  promptCache = rows.map((row) => ({
    ...row,
    keywords: extractKeywords(row.texto_original || '').concat(extractKeywords(row.prompt_final || ''))
  }));
}

async function initMemesDB() {
  if (initialized) return dbInstance;
  ensureDataDirs();
  dbInstance = new sqlite3.Database(DB_PATH);
  dbInstance.configure('busyTimeout', 30000);
  await run(dbInstance, 'PRAGMA journal_mode = WAL');
  await run(dbInstance, 'PRAGMA synchronous = NORMAL');

  await run(dbInstance, `CREATE TABLE IF NOT EXISTS memes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_jid TEXT,
    tipo TEXT,
    texto_original TEXT,
    prompt_final TEXT,
    caminho_imagem TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    sucesso INTEGER,
    reacoes_precisas INTEGER DEFAULT 0
  )`);

  await ensureMensagemIdColumn(dbInstance);
  await ensureMessageMapTable(dbInstance);

  await run(dbInstance, `CREATE VIEW IF NOT EXISTS memes_top AS
    SELECT * FROM memes WHERE reacoes_precisas >= 5`);

  await refreshPromptCache(dbInstance);
  initialized = true;
  console.log('[MemeGen] init - Banco de memes pronto');
  return dbInstance;
}

function extractKeywords(text = '') {
  return Array.from(new Set(
    text
      .toLowerCase()
      .replace(/[^a-zà-ú0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter((word) => word && word.length >= 4)
  ));
}

async function buscarMemesSimilares(tema) {
  const db = await getDb();
  const keywords = extractKeywords(tema);
  if (!keywords.length) return null;

  let bestMatch = null;
  let bestScore = 0;
  for (const cached of promptCache) {
    const overlap = cached.keywords.filter((kw) => keywords.includes(kw));
    if (overlap.length > bestScore) {
      bestScore = overlap.length;
      bestMatch = cached;
    }
  }
  if (bestMatch && bestScore >= 1) {
    console.log(`[MemeGen] cache-hit - prompt ${bestMatch.id} reutilizado (${bestScore} keywords)`);
    return { ...bestMatch, fonte: 'cache', score: bestScore };
  }

  const likeClauses = keywords.map(() => '(texto_original LIKE ? OR prompt_final LIKE ?)').join(' OR ');
  const likeParams = keywords.flatMap((kw) => {
    const pattern = `%${kw}%`;
    return [pattern, pattern];
  });
  const query = `SELECT id, texto_original, prompt_final, reacoes_precisas, tipo
    FROM memes_top
    WHERE ${likeClauses}
    ORDER BY reacoes_precisas DESC, id DESC
    LIMIT 5`;
  try {
    const rows = await all(db, query, likeParams);
    if (rows && rows.length) {
      const scored = rows.map((row) => {
        const words = extractKeywords(`${row.texto_original || ''} ${row.prompt_final || ''}`);
        const score = words.filter((kw) => keywords.includes(kw)).length;
        return { ...row, score, keywords: words };
      }).sort((a, b) => b.score - a.score || (b.reacoes_precisas || 0) - (a.reacoes_precisas || 0));
      const top = scored[0];
      if (top && top.score >= 1) {
        console.log(`[MemeGen] db-hit - prompt ${top.id} reutilizado (${top.score} keywords)`);
        return { ...top, fonte: 'db' };
      }
    }
  } catch (error) {
    console.warn('[MemeGen] buscarMemesSimilares - falha na consulta:', error.message);
  }
  return null;
}

async function gerarPromptMeme(textoOriginal) {
  if (!textoOriginal || !textoOriginal.trim()) {
    throw new Error('Descrição vazia para gerar meme');
  }
  await initMemesDB();
  const normalized = textoOriginal.trim();
  const reutilizado = await buscarMemesSimilares(normalized);
  if (reutilizado) {
    return {
      prompt: reutilizado.prompt_final,
      reutilizado: true,
      origemId: reutilizado.id
    };
  }

  const openai = ensureOpenAiClient();
  console.log('[MemeGen] prompt - solicitando ao modelo GPT');
  const response = await openai.chat.completions.create({
    model: PROMPT_MODEL,
    temperature: 0.7,
    max_tokens: 400,
    messages: [
      {
        role: 'system',
        content: 'Você cria descrições visuais engraçadas para geração de memes. Seja específico com cenário, estilo visual, personagens e elementos icônicos. Responda somente com o prompt visual final.'
      },
      {
        role: 'user',
        content: `Crie um prompt detalhado, em português, para gerar uma imagem de meme engraçada. Combine humor inteligente com referências visuais claras. Descrição do usuário: ${normalized}`
      }
    ]
  });
  const prompt = response.choices?.[0]?.message?.content?.trim();
  if (!prompt) {
    throw new Error('Falha ao gerar prompt de meme');
  }
  return {
    prompt,
    reutilizado: false
  };
}

async function gerarImagemMeme(prompt, tipo = 'texto') {
  if (!prompt || !prompt.trim()) {
    throw new Error('Prompt vazio para gerar imagem');
  }
  await initMemesDB();
  const openai = ensureOpenAiClient();
  const quality = tipo === 'audio' ? 'medium' : DEFAULT_IMAGE_QUALITY;

  console.log(`[MemeGen] imagem - gerando com qualidade ${quality}`);
  const imageResponse = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt,
    size: IMAGE_SIZE,
    quality
  });
  const imageData = imageResponse.data?.[0]?.b64_json;
  if (!imageData) {
    throw new Error('OpenAI não retornou imagem');
  }

  const rawBuffer = Buffer.from(imageData, 'base64');
  const tmpOriginalPath = path.join('/tmp', `meme-${Date.now()}-${Math.floor(Math.random() * 10_000)}.png`);
  await fsp.writeFile(tmpOriginalPath, rawBuffer);

  const filename = `meme-${Date.now()}-${Math.floor(Math.random() * 10_000)}.webp`;
  const finalPath = path.join(IMAGE_DIR, filename);
  await sharp(rawBuffer)
    .resize(512, 512, { fit: 'cover' })
    .webp({ quality: 88 })
    .toFile(finalPath);

  try {
    await fsp.unlink(tmpOriginalPath);
  } catch (_) {}

  return {
    originalPath: null,
    webpPath: finalPath,
    qualidade: quality
  };
}

async function processarAudioParaMeme(client, audioMessage) {
  if (!audioMessage) {
    throw new Error('Nenhuma mensagem de áudio fornecida');
  }
  await initMemesDB();
  const openai = ensureOpenAiClient();
  const { buffer, mimetype } = await downloadMediaForMessage(client, audioMessage);
  if (!buffer || !buffer.length) {
    throw new Error('Falha ao baixar áudio para meme');
  }

  const tmpAudioPath = path.join('/tmp', `meme-audio-${Date.now()}-${Math.floor(Math.random() * 10_000)}.ogg`);
  await fsp.writeFile(tmpAudioPath, buffer);

  try {
    console.log('[MemeGen] audio - transcrevendo com whisper-1');
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tmpAudioPath),
      model: 'whisper-1',
      language: TRANSCRIPTION_LANGUAGE,
      response_format: 'text'
    });
    const textoOriginal = (typeof transcription === 'string' ? transcription : transcription?.text || '').trim();
    if (!textoOriginal) {
      throw new Error('Transcrição vazia');
    }
    const promptInfo = await gerarPromptMeme(textoOriginal);
    const imagemInfo = await gerarImagemMeme(promptInfo.prompt, 'audio');
    return {
      textoOriginal,
      promptInfo,
      imagemInfo,
      mimetype
    };
  } finally {
    try { await fsp.unlink(tmpAudioPath); } catch (_) {}
  }
}

function normalizeMensagemId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (typeof value.messageId === 'string') return value.messageId;
    if (typeof value.id === 'string') return value.id;
    if (value.key && typeof value.key.id === 'string') return value.key.id;
  }
  return null;
}

async function registrarMeme({
  userJid,
  tipo = 'texto',
  textoOriginal,
  promptFinal,
  caminhoImagem,
  sucesso = 1,
  mensagemId = null
}) {
  const db = await getDb();
  const mensagemIdClean = normalizeMensagemId(mensagemId);
  const result = await run(db, `INSERT INTO memes (user_jid, tipo, texto_original, prompt_final, caminho_imagem, sucesso, mensagem_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [userJid || null, tipo, textoOriginal || null, promptFinal || null, caminhoImagem || null, sucesso ? 1 : 0, mensagemIdClean]);
  const memeId = result.lastID;
  if (mensagemIdClean) {
    try {
      await run(db, `INSERT OR REPLACE INTO meme_messages (mensagem_id, meme_id) VALUES (?, ?)`, [mensagemIdClean, memeId]);
    } catch (err) {
      console.warn('[MemeGen] registrarMeme - falha ao mapear mensagem:', err.message);
    }
  }
  if (sucesso) {
    await refreshPromptCache(db);
  }
  return memeId;
}

async function registrarReacao({ chatId, mensagemId, emoji, client }) {
  if (!mensagemId || emoji !== '🎯') return null;
  const db = await getDb();
  const relation = await get(db, 'SELECT meme_id FROM meme_messages WHERE mensagem_id = ?', [mensagemId]);
  if (!relation) return null;
  await run(db, 'UPDATE memes SET reacoes_precisas = COALESCE(reacoes_precisas,0) + 1 WHERE id = ?', [relation.meme_id]);
  const meme = await get(db, 'SELECT reacoes_precisas FROM memes WHERE id = ?', [relation.meme_id]);
  if (meme?.reacoes_precisas >= 5) {
    console.log('[MemeGen] destaque - meme atingiu 5 🎯');
    if (client && chatId) {
      try {
        await client.sendText(chatId, '💾 Meme com mais de 5 🎯 movido para coleção de destaque.');
      } catch (err) {
        console.warn('[MemeGen] destaque - falha ao avisar chat:', err.message);
      }
    }
    await refreshPromptCache(db);
  }
  return relation.meme_id;
}

async function exportarMemesTop() {
  const db = await getDb();
  const rows = await all(db, 'SELECT * FROM memes_top ORDER BY reacoes_precisas DESC, timestamp DESC');
  ensureDataDirs();
  await fsp.writeFile(EXPORT_PATH, JSON.stringify(rows, null, 2), 'utf8');
  console.log(`[MemeGen] export - ${rows.length} memes exportados para ${EXPORT_PATH}`);
  return { quantidade: rows.length, caminho: EXPORT_PATH };
}

async function gerarPromptTreinavel() {
  const db = await getDb();
  const rows = await all(db, 'SELECT texto_original, prompt_final, reacoes_precisas, tipo FROM memes_top ORDER BY reacoes_precisas DESC, id DESC');
  ensureDataDirs();
  await fsp.writeFile(DATASET_PATH, JSON.stringify(rows, null, 2), 'utf8');
  console.log(`[MemeGen] dataset - ${rows.length} prompts salvos em ${DATASET_PATH}`);
  return { quantidade: rows.length, caminho: DATASET_PATH };
}

module.exports = {
  initMemesDB,
  gerarPromptMeme,
  gerarImagemMeme,
  processarAudioParaMeme,
  registrarMeme,
  registrarReacao,
  exportarMemesTop,
  buscarMemesSimilares,
  gerarPromptTreinavel
};
