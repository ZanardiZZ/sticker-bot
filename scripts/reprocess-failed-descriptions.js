require('dotenv').config({ path: '/home/dev/work/sticker-bot2/.env' });
const fs = require('fs');
const path = require('path');
const { db, updateMediaDescription } = require('/home/dev/work/sticker-bot2/src/database');
const { getAiAnnotations, getAiAnnotationsForGif } = require('/home/dev/work/sticker-bot2/src/services/ai');

const WHERE = `lower(description) LIKE '%indispon%'`;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));

(async () => {
  const rows = await all(`SELECT id, file_path, mimetype FROM media WHERE ${WHERE} ORDER BY id ASC`);
  const stats = { target: rows.length, completed: 0, failed: 0, missing: 0, empty: 0 };
  console.log(JSON.stringify({ event: 'start', target: rows.length }));

  for (const row of rows) {
    try {
      if (!row.file_path || !fs.existsSync(row.file_path)) {
        stats.missing++;
        console.log(JSON.stringify({ id: row.id, status: 'missing_file', file_path: row.file_path }));
        continue;
      }
      const input = fs.readFileSync(row.file_path);
      const result = row.mimetype && row.mimetype.includes('gif')
        ? await getAiAnnotationsForGif(input)
        : await getAiAnnotations(input);
      const description = result && typeof result.description === 'string' ? result.description.trim() : '';
      if (!description || description.toLowerCase().includes('indispon')) {
        stats.empty++;
        console.log(JSON.stringify({ id: row.id, status: 'empty_result' }));
      } else {
        await updateMediaDescription(row.id, description);
        stats.completed++;
        console.log(JSON.stringify({ id: row.id, status: 'completed', chars: description.length }));
      }
    } catch (error) {
      stats.failed++;
      console.log(JSON.stringify({ id: row.id, status: 'failed', error: String(error && (error.message || error)) }));
    }
    await sleep(1000);
  }

  console.log(JSON.stringify({ event: 'complete', ...stats }));
  db.close(() => process.exit(stats.failed || stats.missing || stats.empty ? 2 : 0));
})().catch(error => {
  console.error(JSON.stringify({ event: 'fatal', error: String(error && (error.stack || error)) }));
  process.exit(1);
});
