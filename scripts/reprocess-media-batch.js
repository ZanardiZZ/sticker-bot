#!/usr/bin/env node
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || '/home/dev/work/sticker-bot2/.env' });
const fs = require('fs');
const path = require('path');
const { db, updateMediaDescription, updateMediaTags } = require('../src/database');
const { getAiAnnotations, getAiAnnotationsForGif } = require('../src/services/ai');
const { normalizeAiTags, isInvalidAiDescription } = require('../src/services/ai');
const sharp = require('sharp');

function isDescriptionMissing(value) {
  const text = String(value || '').trim().toLowerCase();
  return !text || text.includes('indisponível') || text.includes('indisponivel') || text === 'sem descrição.' || text === 'sem descricao.' || isInvalidAiDescription(text);
}

function hasBadTags(value) {
  const tags = Array.isArray(value) ? value : String(value || '').split(',');
  const clean = tags.map(tag => String(tag).trim().replace(/^#+/, '').toLowerCase()).filter(Boolean);
  if (!clean.length || clean.length < 3) return true;
  if (clean.some(tag => tag.length < 3 || ['json', 'description', 'text', 'tags', 'metadata', 'undefined', 'null'].includes(tag))) return true;
  return new Set(clean).size !== clean.length;
}

function selectProcessor(mimetype) {
  return /gif|video/i.test(String(mimetype || '')) ? 'gif' : 'image';
}

async function selectProcessorForBuffer(mimetype, buffer) {
  if (selectProcessor(mimetype) === 'gif') return 'gif';
  if (/webp/i.test(String(mimetype || ''))) {
    const metadata = await sharp(buffer).metadata();
    if (Number(metadata.pages || 1) > 1) return 'gif';
  }
  return 'image';
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));

function parseArgs(argv) {
  const args = { apply: false, limit: 0, id: null, delay: 1200 };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--apply') args.apply = true;
    else if (argv[i] === '--limit') args.limit = Number(argv[++i] || 0);
    else if (argv[i] === '--id') args.id = Number(argv[++i]);
    else if (argv[i] === '--delay-ms') args.delay = Number(argv[++i] || 0);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const rows = await all(`SELECT m.id, m.file_path, m.mimetype, m.description, (SELECT group_concat(t.name, ',') FROM media_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.media_id = m.id) AS tags FROM media m ORDER BY m.id ASC`);
  const candidates = rows.filter(row => {
    if (args.id && row.id !== args.id) return false;
    if (isDescriptionMissing(row.description)) return true;
    return hasBadTags(row.tags);
  }).slice(0, args.limit > 0 ? args.limit : undefined);
  const stats = { scanned: rows.length, candidates: candidates.length, processed: 0, updated: 0, missing: 0, failed: 0, dryRun: !args.apply };
  console.log(JSON.stringify({ event: 'start', ...stats }));

  for (const row of candidates) {
    const result = { id: row.id, status: 'pending', reason: isDescriptionMissing(row.description) ? 'description' : 'tags' };
    try {
      if (!row.file_path || !fs.existsSync(row.file_path)) {
        result.status = 'missing_file'; stats.missing += 1; console.log(JSON.stringify(result)); continue;
      }
      const buffer = fs.readFileSync(row.file_path);
      const processor = await selectProcessorForBuffer(row.mimetype, buffer);
      const ai = processor === 'gif' ? await getAiAnnotationsForGif(buffer) : await getAiAnnotations(buffer);
      const description = String(ai?.description || '').trim();
      const tags = normalizeAiTags(ai?.tags, description);
      if (isDescriptionMissing(description) || tags.length < 3) {
        result.status = 'invalid_ai_result'; stats.failed += 1; console.log(JSON.stringify(result)); continue;
      }
      result.description = description.slice(0, 200); result.tags = tags;
      if (args.apply) {
        await updateMediaDescription(row.id, result.description);
        await updateMediaTags(row.id, tags.join(','));
        stats.updated += 1; result.status = 'updated';
      } else result.status = 'would_update';
      stats.processed += 1; console.log(JSON.stringify(result));
    } catch (error) {
      stats.failed += 1; result.status = 'failed'; result.error = error.message; console.log(JSON.stringify(result));
    }
    if (args.delay > 0) await sleep(args.delay);
  }
  console.log(JSON.stringify({ event: 'complete', ...stats }));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { isDescriptionMissing, hasBadTags, selectProcessor, selectProcessorForBuffer };
