const { db } = require('../connection');
function n(v) { return v == null ? '' : String(v).trim().slice(0, 500); }
function normalizeSearch(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
const SYNONYMS = { surpresa: ['surpresa','espanto','choque','assustado'], emocao: ['emocao','alegria','entusiasmo'], triste: ['triste','tristeza','frustracao'], raiva: ['raiva','furia','irritacao'], rir: ['rir','risada','humor','engracado'] };
function expandSearchTerms(raw) { const out = []; for (const term of raw) { const key = normalizeSearch(term); for (const item of (SYNONYMS[key] || [key])) if (!out.includes(item)) out.push(item); } return out.slice(0, 16); }
function upsertMediaMetadata(mediaId, m = {}) { return new Promise((resolve, reject) => db.run(`INSERT INTO media_metadata (media_id,visual_action,emotion,ocr_text,cultural_reference,usage_intent,context_signals,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(media_id) DO UPDATE SET visual_action=excluded.visual_action,emotion=excluded.emotion,ocr_text=excluded.ocr_text,cultural_reference=excluded.cultural_reference,usage_intent=excluded.usage_intent,context_signals=excluded.context_signals,updated_at=excluded.updated_at`, [mediaId,n(m.visual_action),n(m.emotion),n(m.ocr_text),n(m.cultural_reference),n(m.usage_intent),n(m.context_signals),Date.now()], e => e ? reject(e) : resolve({ok:true}))); }
function findMediaByMetadata(query, limit = 10) {
  return new Promise(resolve => {
    const terms = expandSearchTerms(String(query || '').split(/\s+/).map(x => x.trim()).filter(x => x.length >= 2)).filter(x => x.length >= 2);
    if (!terms.length) return resolve([]);
    const sql = `SELECT DISTINCT m.*, mm.visual_action, mm.emotion, mm.ocr_text, mm.cultural_reference, mm.usage_intent
      FROM media m LEFT JOIN media_tags mt ON mt.media_id=m.id LEFT JOIN tags t ON t.id=mt.tag_id
      LEFT JOIN media_metadata mm ON mm.media_id=m.id WHERE m.nsfw=0`;
    db.all(sql, [], (error, rows) => {
      if (error) return resolve([]);
      const scored = (rows || []).map(row => {
        const haystack = normalizeSearch([row.description,row.name,row.visual_action,row.emotion,row.ocr_text,row.cultural_reference,row.usage_intent].join(' '));
        const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
        return {...row, metadata_score: score};
      }).filter(row => row.metadata_score > 0).sort((a,b) => b.metadata_score-a.metadata_score || (a.count_random||0)-(b.count_random||0) || (b.timestamp||0)-(a.timestamp||0));
      resolve(scored.slice(0, Math.min(Math.max(Number(limit)||10,1),20)));
    });
  });
}
module.exports={upsertMediaMetadata,findMediaByMetadata};
