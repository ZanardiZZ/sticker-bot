// stickerSource.cjs
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { getConfig } = require('./configRuntime.js');

const db = new Database('/opt/sticker-bot/stickers.db', { fileMustExist: true });

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

function getRandomStickerFromDB() {
  const { STICKERS_DIR, SKIP_NSFW } = getConfig();
  const query = `
    SELECT id, file, descricao, tag, nsfw
    FROM figurinhas
    ${SKIP_NSFW ? 'WHERE IFNULL(nsfw,0)=0' : ''}
    ORDER BY RANDOM()
    LIMIT 1
  `;
  const row = db.prepare(query).get();

  if (!row) return null;

  const filePath = resolveStickerPath(row.file, STICKERS_DIR);
  if (!filePath || !filePath.toLowerCase().endsWith('.webp')) {
    return null;
  }

  return {
    id: row.id,
    filePath,
    description: row.descricao || '(sem descrição)',
    tag: row.tag
      ? (row.tag.startsWith('#') ? row.tag : `#${row.tag}`)
      : '#gerado'
  };
}

function getRandomStickerFromFolder() {
  const { STICKERS_DIR } = getConfig();
  let files = [];
  try {
    files = fs.readdirSync(STICKERS_DIR).filter(f => f.toLowerCase().endsWith('.webp'));
  } catch (err) {
    return null;
  }
  if (!files.length) return null;
  const pick = files[Math.floor(Math.random() * files.length)];
  return {
    id: '—',
    filePath: path.join(STICKERS_DIR, pick),
    description: '(sem descrição no banco)',
    tag: '#gerado'
  };
}

module.exports = {
  getRandomStickerFromDB,
  getRandomStickerFromFolder
};
