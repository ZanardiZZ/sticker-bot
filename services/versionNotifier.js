/**
 * Version Notifier Service
 * Sends update notifications to a configured group when bot version changes
 */

const { db } = require('../database/connection');
const packageJson = require('../package.json');

const NOTIFICATION_GROUP_ID = process.env.AUTO_SEND_GROUP_ID || process.env.VERSION_NOTIFICATION_GROUP;

/**
 * Gets the last notified version from database
 * @returns {Promise<string|null>}
 */
function getLastNotifiedVersion() {
  return new Promise((resolve) => {
    db.get(
      `SELECT value FROM bot_config WHERE key = 'last_notified_version'`,
      (err, row) => {
        if (err || !row) resolve(null);
        else resolve(row.value);
      }
    );
  });
}

/**
 * Sets the last notified version in database
 * @param {string} version
 * @returns {Promise<void>}
 */
function setLastNotifiedVersion(version) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO bot_config (key, value, updated_at)
       VALUES ('last_notified_version', ?, strftime('%s','now'))`,
      [version],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

/**
 * Gets recent version history for changelog
 * @param {number} limit
 * @returns {Promise<Array>}
 */
function getRecentVersions(limit = 5) {
  return new Promise((resolve) => {
    db.all(
      `SELECT major, minor, patch, description, created_at
       FROM version_info
       ORDER BY id DESC
       LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) resolve([]);
        else resolve(rows || []);
      }
    );
  });
}

/**
 * Builds update notification message
 * @param {string} currentVersion
 * @param {string} previousVersion
 * @returns {Promise<string>}
 */
async function buildUpdateMessage(currentVersion, previousVersion) {
  const versions = await getRecentVersions(3);

  let message = `🚀 *Bot Atualizado!*\n\n`;
  message += `📦 Versão: *${currentVersion}*\n`;

  if (previousVersion) {
    message += `📌 Anterior: ${previousVersion}\n`;
  }

  message += `\n`;

  // Add recent changes if available
  if (versions.length > 0) {
    const currentVersionInfo = versions.find(v =>
      `${v.major}.${v.minor}.${v.patch}` === currentVersion
    );

    if (currentVersionInfo && currentVersionInfo.description) {
      message += `📝 *Mudanças:*\n${currentVersionInfo.description}\n\n`;
    }
  }

  message += `Use *#ping* para verificar o status do bot.`;

  return message;
}

/**
 * Checks if version changed and sends notification
 * @param {Object} client - WhatsApp client instance
 * @returns {Promise<boolean>} - True if notification was sent
 */
async function checkAndNotifyVersionUpdate(client) {
  if (!NOTIFICATION_GROUP_ID) {
    console.log('[VersionNotifier] Nenhum grupo de notificação configurado (AUTO_SEND_GROUP_ID)');
    return false;
  }

  const currentVersion = packageJson.version;
  const lastNotifiedVersion = await getLastNotifiedVersion();

  console.log(`[VersionNotifier] Versão atual: ${currentVersion}, última notificada: ${lastNotifiedVersion || 'nenhuma'}`);

  if (lastNotifiedVersion === currentVersion) {
    console.log('[VersionNotifier] Versão não mudou, pulando notificação');
    return false;
  }

  try {
    // Build and send update message
    const message = await buildUpdateMessage(currentVersion, lastNotifiedVersion);

    if (typeof client.sendText === 'function') {
      await client.sendText(NOTIFICATION_GROUP_ID, message);
    } else if (typeof client.sendMessage === 'function') {
      await client.sendMessage(NOTIFICATION_GROUP_ID, { text: message });
    } else {
      console.warn('[VersionNotifier] Cliente não suporta envio de mensagem');
      return false;
    }

    // Update last notified version
    await setLastNotifiedVersion(currentVersion);

    console.log(`[VersionNotifier] ✅ Notificação de atualização enviada para ${NOTIFICATION_GROUP_ID}`);
    return true;
  } catch (err) {
    console.error('[VersionNotifier] Erro ao enviar notificação:', err.message);
    return false;
  }
}

/**
 * Initializes the bot_config table if it doesn't exist
 * @returns {Promise<void>}
 */
function initConfigTable() {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS bot_config (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER DEFAULT (strftime('%s','now'))
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Initialize version notifier
 */
async function initialize() {
  try {
    await initConfigTable();
    console.log('[VersionNotifier] Inicializado');
  } catch (err) {
    console.error('[VersionNotifier] Erro ao inicializar:', err.message);
  }
}

module.exports = {
  checkAndNotifyVersionUpdate,
  getLastNotifiedVersion,
  setLastNotifiedVersion,
  buildUpdateMessage,
  initialize
};
