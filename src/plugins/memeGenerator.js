const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const OpenAI = require('openai');
const sharp = require('sharp');

const { downloadMediaForMessage } = require('../utils/mediaDownload');
const { transcribeAudioBuffer } = require('../services/ai');
const crypto = require('crypto');
require('dotenv').config();
require('dotenv').config({ path: '/etc/stickerbot/lemonade-image.env' });
const { DATA_DIR, BOT_MEDIA_DIR } = require('../paths');

const STICKER_DIR = BOT_MEDIA_DIR;
const DB_PATH = path.join(DATA_DIR, 'memes.sqlite');
const DATASET_PATH = path.join(DATA_DIR, 'prompt_training_set.json');
const EXPORT_PATH = path.join(DATA_DIR, 'memes_best.json');
const GEMMA_PROMPT_BASE_URL = String(process.env.GEMMA_PROMPT_BASE_URL || process.env.OPENAI_MULTIMODAL_BASE_URL || 'http://127.0.0.1:8080/v1').replace(/\/$/, '');
const GEMMA_PROMPT_MODEL = process.env.GEMMA_PROMPT_MODEL || process.env.OPENAI_MULTIMODAL_MODEL || 'gpt-4o-mini';
const GEMMA_PROMPT_TIMEOUT_MS = Number(process.env.GEMMA_PROMPT_TIMEOUT_MS || 30000);
const { generateImage } = require('../services/lemonadeImageGeneration');
const TRANSCRIPTION_LANGUAGE = process.env.MEME_TRANSCRIPTION_LANGUAGE || 'pt';
const PROMPT_CACHE_SIZE = 20;

let dbInstance = null;
let gemmaPromptClient = null;
let initialized = false;
let promptCache = [];

function ensureDataDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STICKER_DIR)) fs.mkdirSync(STICKER_DIR, { recursive: true });
}

function ensureGemmaPromptClient() {
  if (gemmaPromptClient) return gemmaPromptClient;
  gemmaPromptClient = new OpenAI({
    apiKey: process.env.GEMMA_PROMPT_API_KEY || 'not-required',
    baseURL: GEMMA_PROMPT_BASE_URL,
    timeout: GEMMA_PROMPT_TIMEOUT_MS,
    maxRetries: 0
  });
  return gemmaPromptClient;
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
      topText: '',
      bottomText: '',
      reutilizado: true,
      origemId: reutilizado.id
    };
  }

  const fallback = {
    prompt: [
      normalized,
      'Create one coherent square image for a WhatsApp sticker.',
      'Use a clear subject, readable silhouette, intentional composition, expressive action, coherent lighting and a polished illustrative or photographic finish.',
      'Render any text explicitly requested by the user inside the image, preserving the wording and language; otherwise do not add text.'
    ].join('\n'),
    topText: '',
    bottomText: '',
    reutilizado: false,
    promptProvider: 'fallback'
  };

  try {
    const gemma = ensureGemmaPromptClient();
    console.log('[MemeGen] prompt - enriquecendo com Gemma4 para Z-Image-Turbo (' + GEMMA_PROMPT_MODEL + ')');
    const response = await gemma.chat.completions.create({
      model: GEMMA_PROMPT_MODEL,
      temperature: 0.2,
      max_tokens: 500,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        {
          role: 'system',
          content: [
            'You are a prompt planner for Z-Image-Turbo, not an image generator.',
            'Transform the user idea into a single, vivid, production-ready image prompt.',
            'Preserve the subject, action, joke, mood and requested style from the user; do not invent unrelated content.',
            'Use clear natural language, preferably English for the diffusion model.',
            'Specify the main subject, action, environment, composition, camera/viewpoint, lighting, materials, color palette and visual style when useful.',
            'Prefer one coherent scene with a strong focal point and readable silhouette.',
            'Do not use prompt weights, LoRA syntax, negative-prompt sections or technical diffusion parameters.',
            'Text is allowed inside the generated image. When the user requests text, render it inside the scene, preserving the exact wording, spelling, language and requested placement; do not duplicate it as an external caption.',
            'Return only valid JSON: {"image_prompt":"...","caption_top":"...","caption_bottom":"..."}.',
            'Keep caption fields in the language used by the user and empty when captions were not requested.'
          ].join(' ')
        },
        { role: 'user', content: normalized }
      ]
    });

    const rawContent = String(response.choices?.[0]?.message?.content || '').trim();
    const jsonStart = rawContent.indexOf('{');
    const jsonEnd = rawContent.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd <= jsonStart) throw new Error('Gemma4 não retornou JSON');
    const parsed = JSON.parse(rawContent.slice(jsonStart, jsonEnd + 1));
    const prompt = String(parsed.image_prompt || '').trim();
    if (!prompt) throw new Error('Gemma4 retornou image_prompt vazio');

    return {
      prompt,
      topText: String(parsed.caption_top || '').trim(),
      bottomText: String(parsed.caption_bottom || '').trim(),
      reutilizado: false,
      promptProvider: 'gemma4-zimage'
    };
  } catch (error) {
    console.warn('[MemeGen] prompt - Gemma4 indisponível; usando fallback local (' + (error?.status || error?.code || error?.message || 'erro') + ')');
    return fallback;
  }
}
async function gerarImagemMeme(prompt, tipo = 'texto', options = {}) {
  if (!prompt || !prompt.trim()) {
    throw new Error('Prompt vazio para gerar imagem');
  }
  await initMemesDB();
  const safePrompt = prompt.trim();

  console.log('[MemeGen] imagem - solicitando ao Lemonade (fila Z-Image, 8 steps, cfg 1)');
  const queuedImage = generateImage(safePrompt, {
    requesterId: options.requesterId,
    onQueued: options.onQueued
  });
  if (typeof options.onQueued === 'function') {
    options.onQueued({ jobId: queuedImage.jobId, position: queuedImage.position });
  }
  const imageResponse = await queuedImage;
  const imageData = imageResponse.imageData;
  if (!imageData) {
    throw new Error('Lemonade não retornou imagem');
  }

  const rawBuffer = Buffer.from(imageData, 'base64');
  const randomSuffix = crypto.randomBytes(16).toString('hex');
  const tmpOriginalPath = path.join('/tmp', `meme-${Date.now()}-${randomSuffix}.png`);
  await fsp.writeFile(tmpOriginalPath, rawBuffer);

  const filename = `media-${Date.now()}-${randomSuffix}.webp`;
  const finalPath = path.join(STICKER_DIR, filename);
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
    qualidade: 'lemonade-z-image',
    steps: imageResponse.steps,
    cfgScale: imageResponse.cfgScale
  };
}

async function processarAudioParaMeme(client, audioMessage, options = {}) {
  if (!audioMessage) {
    throw new Error('Nenhuma mensagem de áudio fornecida');
  }
  await initMemesDB();
  const { buffer, mimetype } = await downloadMediaForMessage(client, audioMessage);
  if (!buffer || !buffer.length) {
    throw new Error('Falha ao baixar áudio para meme');
  }

  console.log('[MemeGen] audio - transcrevendo com Gemma 4');
  const transcription = await transcribeAudioBuffer(buffer, { language: TRANSCRIPTION_LANGUAGE });
  const textoOriginal = String(transcription || '').trim();
  if (!textoOriginal || textoOriginal.startsWith('Áudio não transcrito')) {
    throw new Error(textoOriginal || 'Transcrição vazia');
  }
  const promptInfo = await gerarPromptMeme(textoOriginal);
  const imagemInfo = await gerarImagemMeme(promptInfo.prompt, 'audio', options);
  return {
    textoOriginal,
    promptInfo,
    imagemInfo,
    mimetype
  };
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
