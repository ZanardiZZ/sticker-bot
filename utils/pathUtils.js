// utils/pathUtils.js
const fs = require('fs');
const path = require('path');

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

module.exports = { resolveStickerPath };
