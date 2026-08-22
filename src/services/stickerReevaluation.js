const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { db } = require('../database/connection');
const { findById } = require('../database/models/media');
const { safeReply } = require('../utils/safeMessaging');
const { MEDIA_DIR } = require('../paths');

const queue = [];
let running = false;
const activeKeys = new Set();
const MODES = new Set(['geral', 'personagem', 'texto', 'referencia', 'referência']);

function dbRun(sql, params = []) { return new Promise((resolve, reject) => db.run(sql, params, function (err) { if (err) reject(err); else resolve(this); })); }
function dbGet(sql, params = []) { return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null))); }
function normalizeMode(value) { const mode = String(value || 'geral').trim().toLowerCase(); return mode === 'referência' ? 'referencia' : (MODES.has(mode) ? mode : null); }
function authorized(requesterId, media) {
  const admin = String(process.env.ADMIN_NUMBER || '').trim();
  const sender = String(requesterId || '').trim();
  const owner = String(media?.sender_id || '').trim();
  return Boolean(sender && ((admin && sender === admin) || (owner && sender === owner)));
}
function resolveMediaPath(filePath) {
  if (!filePath) return null;
  const candidates = [filePath, path.resolve(process.cwd(), filePath), path.join(MEDIA_DIR, path.basename(filePath))];
  return candidates.find(p => fs.existsSync(p)) || null;
}
function buildPrompt(mode) {
  const focus = { geral: 'Faça uma revisão completa.', personagem: 'Concentre-se em pessoa, personagem, celebridade, obra ou referência visual; deixe vazio se não houver evidência.', texto: 'Concentre-se em OCR. Transcreva somente texto realmente visível e marque baixa confiança quando estiver ilegível.', referencia: 'Concentre-se em referência cultural, personagem, meme, filme, série, anime ou jogo; não invente identificação.' }[mode];
  return `Você é o revisor multimodal avançado do StickerBot. ${focus}\nResponda SOMENTE JSON válido com estas chaves: description (string curta), text (string), tags (array de strings), confidence (number 0 a 1), needs_review (boolean), cultural_reference (string), visual_action (string), emotion (string), context_signals (string), notes (string). Não invente nomes, obras, OCR ou contexto. Use string vazia quando não houver evidência.`;
}
function extractJson(raw) { const text = String(raw || ''); const a = text.indexOf('{'); const b = text.lastIndexOf('}'); return JSON.parse(a >= 0 && b > a ? text.slice(a, b + 1) : text); }
function reviewClient() {
  const apiKey = process.env.STICKER_REVIEW_API_KEY || process.env.LEMONADE_UPSCALE_API_KEY || process.env.OPENAI_MULTIMODAL_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = process.env.STICKER_REVIEW_BASE_URL || process.env.OPENAI_MULTIMODAL_BASE_URL || 'http://192.168.20.24:13305/v1';
  return apiKey ? new OpenAI({ apiKey, baseURL, timeout: Number(process.env.STICKER_REVIEW_TIMEOUT_MS || 90000) }) : null;
}
async function processJob(job) {
  const media = await findById(job.mediaId);
  if (!media) throw new Error('sticker não encontrado');
  const filePath = resolveMediaPath(media.file_path);
  if (!filePath) throw new Error('arquivo original do sticker não encontrado');
  const client = reviewClient();
  if (!client) throw new Error('endpoint de reavaliação não configurado');
  const buffer = fs.readFileSync(filePath);
  const sharp = require('sharp');
  const png = await sharp(buffer).resize(768, 768, { fit: 'inside' }).png().toBuffer();
  const response = await client.chat.completions.create({
    model: process.env.STICKER_REVIEW_MODEL || 'gemma-4-12B-it-qat-GGUF-UD-Q4_K_XL',
    temperature: 0,
    max_tokens: Number(process.env.STICKER_REVIEW_MAX_TOKENS || 2048),
    chat_template_kwargs: { enable_thinking: false },
    messages: [{ role: 'system', content: buildPrompt(job.mode) }, { role: 'user', content: [{ type: 'text', text: 'Reavalie este sticker.' }, { type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } }] }]
  });
  const choice = response?.choices?.[0] || {};
  const raw = choice?.message?.content || choice?.message?.reasoning_content || '';
  const result = extractJson(raw);
  result.model = process.env.STICKER_REVIEW_MODEL || 'gemma-4-12B-it-qat-GGUF-UD-Q4_K_XL';
  result.finish_reason = choice.finish_reason || null;
  result.review_mode = job.mode;
  return result;
}
async function runQueue() {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift();
    try {
      await dbRun('UPDATE sticker_reviews SET status=? WHERE id=?', ['running', job.id]);
      const result = await processJob(job);
      await dbRun('UPDATE sticker_reviews SET status=?, review_json=?, completed_at=? WHERE id=?', ['completed', JSON.stringify(result), Date.now(), job.id]);
      await safeReply(job.client, job.chatId, `✅ Reavaliação do sticker ${job.mediaId} concluída com ${result.model}.\n📝 ${String(result.description || 'Sem descrição.').slice(0, 500)}\n🔎 Confiança: ${result.confidence ?? 'n/d'}\n${result.needs_review ? '⚠️ Ainda requer revisão.' : '🟢 Sem ambiguidade sinalizada.'}`, job.message);
    } catch (error) {
      const message = error?.message || String(error);
      await dbRun('UPDATE sticker_reviews SET status=?, error=?, completed_at=? WHERE id=?', ['failed', message.slice(0, 1000), Date.now(), job.id]).catch(() => {});
      await safeReply(job.client, job.chatId, `⚠️ Não foi possível reavaliar o sticker ${job.mediaId}: ${message}. O endpoint Gemma 12B pode estar offline.`, job.message);
    } finally { activeKeys.delete(job.key); }
  }
  running = false;
}
async function enqueueReevaluation({ mediaId, mode = 'geral', requesterId, client, chatId, message }) {
  const media = await findById(mediaId);
  if (!media) return { ok: false, message: 'Mídia não encontrada para esse ID.' };
  if (!authorized(requesterId, media)) return { ok: false, message: '🚫 Você não está autorizado a reavaliar este sticker.' };
  const normalized = normalizeMode(mode);
  if (!normalized) return { ok: false, message: 'Uso: #reavaliar <id> [geral|personagem|texto|referencia]' };
  const key = `${mediaId}:${normalized}`;
  if (activeKeys.has(key)) return { ok: true, queued: false, message: '⏳ Essa reavaliação já está na fila ou em execução.' };
  const existing = await dbGet('SELECT id,status FROM sticker_reviews WHERE media_id=? AND mode=? AND status IN (\'queued\',\'running\') ORDER BY id DESC LIMIT 1', [mediaId, normalized]);
  if (existing) return { ok: true, queued: false, message: '⏳ Essa reavaliação já está na fila ou em execução.' };
  const row = await dbRun('INSERT INTO sticker_reviews(media_id,requester_id,mode,status,requested_at) VALUES(?,?,?,?,?)', [mediaId, requesterId, normalized, 'queued', Date.now()]);
  activeKeys.add(key); queue.push({ id: row.lastID, mediaId: Number(mediaId), mode: normalized, requesterId, client, chatId, message, key });
  runQueue().catch(error => console.error('[StickerReview] queue failure:', error));
  return { ok: true, queued: true, message: `🧪 Reavaliação do sticker ${mediaId} enfileirada (${normalized}). Vou usar o Gemma 12B e aviso quando terminar.` };
}
module.exports = { enqueueReevaluation, normalizeMode };
