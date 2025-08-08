// configRuntime.js
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ENV_PATH = path.resolve(process.cwd(), '.env');

let cache = null;
let lastMtime = 0;

function parseBool(v, def = false) {
  if (v == null) return def;
  return /^true|1|yes$/i.test(String(v).trim());
}

function parseIntSafe(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

function loadEnvFileIfChanged() {
  try {
    const stat = fs.statSync(ENV_PATH);
    const mtime = stat.mtimeMs || stat.mtime.getTime();
    if (mtime !== lastMtime) {
      const parsed = dotenv.parse(fs.readFileSync(ENV_PATH));
      cache = { file: parsed, merged: null };
      lastMtime = mtime;
    }
  } catch {
    cache = { file: {}, merged: null };
    lastMtime = Date.now();
  }
}

function getConfig() {
  loadEnvFileIfChanged();

  const file = cache?.file || {};
  const env = process.env;

  const STICKERS_DIR = env.STICKERS_DIR ?? file.STICKERS_DIR ?? '/mnt/nas/Media/Figurinhas';

  const RANDOM_SEND_ENABLED = parseBool(env.RANDOM_SEND_ENABLED ?? file.RANDOM_SEND_ENABLED, true);
  const MIN_INTERVAL_MIN    = parseIntSafe(env.MIN_INTERVAL_MIN ?? file.MIN_INTERVAL_MIN, 90);
  const MAX_INTERVAL_MIN    = parseIntSafe(env.MAX_INTERVAL_MIN ?? file.MAX_INTERVAL_MIN, 240);

  const ACTIVE_HOURS_START  = parseIntSafe(env.ACTIVE_HOURS_START ?? file.ACTIVE_HOURS_START, 9);
  const ACTIVE_HOURS_END    = parseIntSafe(env.ACTIVE_HOURS_END ?? file.ACTIVE_HOURS_END, 22);

  const SCHEDULED_GROUPS = String(env.SCHEDULED_GROUPS ?? file.SCHEDULED_GROUPS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const SKIP_NSFW = parseBool(env.SKIP_NSFW ?? file.SKIP_NSFW, true);

  return {
    STICKERS_DIR,
    RANDOM_SEND_ENABLED,
    MIN_INTERVAL_MIN,
    MAX_INTERVAL_MIN,
    ACTIVE_HOURS: { start: ACTIVE_HOURS_START, end: ACTIVE_HOURS_END },
    SCHEDULED_GROUPS,
    SKIP_NSFW
  };
}

module.exports = { getConfig };
