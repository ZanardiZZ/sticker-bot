const { dbHandler } = require('../connection');

async function getBotConfigValue(key, defaultValue = null) {
  if (!key) return defaultValue;
  const row = await dbHandler.get(
    'SELECT value FROM bot_config WHERE key = ? LIMIT 1',
    [key]
  );
  if (row && Object.prototype.hasOwnProperty.call(row, 'value')) {
    return row.value;
  }
  return defaultValue;
}

async function setBotConfigValue(key, value) {
  if (!key) return { changes: 0 };
  return dbHandler.run(
    `INSERT INTO bot_config (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

async function deleteBotConfigValue(key) {
  if (!key) return { changes: 0 };
  return dbHandler.run('DELETE FROM bot_config WHERE key = ?', [key]);
}

module.exports = {
  getBotConfigValue,
  setBotConfigValue,
  deleteBotConfigValue
};
