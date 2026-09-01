const fs = require('fs');
const path = require('path');

const TEST_STORAGE_DIR = path.resolve(__dirname, `../temp/runtime-${process.pid}`);
const TEST_ENV_PATH = path.resolve(__dirname, '.env.test');

process.env.NODE_ENV = 'test';
process.env.STICKERBOT_TEST_MODE = '1';
process.env.STICKERBOT_DB_PATH = path.join(TEST_STORAGE_DIR, 'database', 'media.db');
process.env.STICKERBOT_DISABLE_PERIODIC_CHECKPOINT = '1';
process.env.DOTENV_CONFIG_PATH = TEST_ENV_PATH;
process.env.DOTENV_CONFIG_QUIET = 'true';
fs.mkdirSync(TEST_STORAGE_DIR, { recursive: true });

let cleaned = false;
async function cleanupTestEnvironment() {
  if (cleaned) return;
  cleaned = true;
  const connectionModuleId = require.resolve('../../src/database/connection');
  if (require.cache[connectionModuleId]) {
    const { dbHandler } = require(connectionModuleId);
    if (dbHandler && !dbHandler.isClosed) await dbHandler.close();
  }
  await new Promise(resolve => setImmediate(resolve));
  fs.rmSync(TEST_STORAGE_DIR, { recursive: true, force: true });
}

module.exports = { TEST_STORAGE_DIR, cleanupTestEnvironment };
