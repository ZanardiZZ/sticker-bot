const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const STORAGE_DIR = path.join(ROOT_DIR, 'storage');

function resolveRepoPath(input, fallbackAbsolute, legacyRelative) {
  if (!input) return fallbackAbsolute;
  if (legacyRelative && input === legacyRelative) return fallbackAbsolute;
  return path.isAbsolute(input) ? input : path.resolve(ROOT_DIR, input);
}

const DATABASE_DIR = path.join(STORAGE_DIR, 'database');
const MEDIA_DIR = path.join(STORAGE_DIR, 'media');
const TEMP_DIR = path.join(STORAGE_DIR, 'temp');
const LOGS_DIR = path.join(STORAGE_DIR, 'logs');
const DATA_DIR = path.join(STORAGE_DIR, 'data');
const WASTICKERS_DIR = path.join(STORAGE_DIR, 'wastickers');

const BOT_MEDIA_DIR = path.join(MEDIA_DIR, 'bot');
const BOT_TEMP_DIR = path.join(TEMP_DIR, 'bot');
const OLD_STICKERS_DIR = resolveRepoPath(
  process.env.OLD_STICKERS_DIR || process.env.OLD_STICKERS_PATH,
  path.join(MEDIA_DIR, 'old-stickers')
);
const CONVERSATIONS_DIR = path.join(DATA_DIR, 'conversations');
const DB_PATH = path.join(DATABASE_DIR, 'media.db');
const DB_WAL_PATH = path.join(DATABASE_DIR, 'media.db-wal');
const YTDLP_BINARY_PATH = path.join(TEMP_DIR, 'yt-dlp');
const BAILEYS_AUTH_DIR = resolveRepoPath(
  process.env.BAILEYS_AUTH_DIR,
  path.join(STORAGE_DIR, 'auth_info_baileys'),
  'auth_info_baileys'
);

module.exports = {
  ROOT_DIR,
  STORAGE_DIR,
  DATABASE_DIR,
  MEDIA_DIR,
  TEMP_DIR,
  LOGS_DIR,
  DATA_DIR,
  WASTICKERS_DIR,
  BOT_MEDIA_DIR,
  BOT_TEMP_DIR,
  OLD_STICKERS_DIR,
  CONVERSATIONS_DIR,
  DB_PATH,
  DB_WAL_PATH,
  YTDLP_BINARY_PATH,
  BAILEYS_AUTH_DIR
};
