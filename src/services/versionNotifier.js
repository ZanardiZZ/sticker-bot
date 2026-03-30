/**
 * Version Notifier Service
 * Sends update notifications to a configured group when bot version changes
 */

const fs = require('fs').promises;
const path = require('path');
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
    // Try with updated_at first, fallback to without if column doesn't exist
    db.run(
      `INSERT OR REPLACE INTO bot_config (key, value) VALUES ('last_notified_version', ?)`,
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
 * Parses CHANGELOG.md and extracts user-friendly changes for a version
 * @param {string} version - Version to extract (e.g., "0.10.0")
 * @returns {Promise<Object>} - Object with novidades and correcoes arrays
 */
async function parseChangelogForVersion(version) {
  try {
    const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
    const content = await fs.readFile(changelogPath, 'utf-8');

    // Find the section for this version
    const versionHeader = `## [${version}]`;
    const versionIndex = content.indexOf(versionHeader);

    if (versionIndex === -1) {
      return { novidades: [], correcoes: [] };
    }

    // Extract content until next version header or end
    const nextVersionIndex = content.indexOf('\n## [', versionIndex + 1);
    const versionSection = nextVersionIndex !== -1
      ? content.substring(versionIndex, nextVersionIndex)
      : content.substring(versionIndex);

    // Extract "Novidades" section
    const novidades = [];
    const novidadesMatch = versionSection.match(/### Novidades\n([\s\S]*?)(?=\n###|$)/);
    if (novidadesMatch) {
      const lines = novidadesMatch[1].trim().split('\n');
      for (const line of lines) {
        // Parse: "- feat: Description (por author) ([link]...)"
        const match = line.match(/^-\s*(?:feat|feature):\s*([^(]+)/i);
        if (match) {
          novidades.push(match[1].trim());
        }
      }
    }

    // Extract "Correções" section
    const correcoes = [];
    const correcoesMatch = versionSection.match(/### Correções\n([\s\S]*?)(?=\n###|$)/);
    if (correcoesMatch) {
      const lines = correcoesMatch[1].trim().split('\n');
      for (const line of lines) {
        // Parse: "- fix: Description (por author) ([link]...)"
        const match = line.match(/^-\s*fix:\s*([^(]+)/i);
        if (match) {
          correcoes.push(match[1].trim());
        }
      }
    }

    return { novidades, correcoes };
  } catch (err) {
    console.error('[VersionNotifier] Erro ao ler CHANGELOG:', err.message);
    return { novidades: [], correcoes: [] };
  }
}

/**
 * Builds update notification message
 * @param {string} currentVersion
 * @param {string} previousVersion
 * @returns {Promise<string>}
 */
async function buildUpdateMessage(currentVersion, previousVersion) {
  let message = `🚀 *Bot Atualizado!*\n\n`;
  message += `📦 Versão: *${currentVersion}*\n`;

  if (previousVersion) {
    message += `📌 Anterior: ${previousVersion}\n`;
  }

  message += `\n`;

  // Parse changelog for user-friendly changes
  const changelog = await parseChangelogForVersion(currentVersion);

  // Add features (Novidades)
  if (changelog.novidades.length > 0) {
    message += `✨ *Novidades:*\n`;
    for (const item of changelog.novidades) {
      message += `  • ${item}\n`;
    }
    message += `\n`;
  }

  // Add fixes (Correções)
  if (changelog.correcoes.length > 0) {
    message += `🐛 *Correções:*\n`;
    for (const item of changelog.correcoes) {
      message += `  • ${item}\n`;
    }
    message += `\n`;
  }

  // Fallback to database version_info if no changelog
  if (changelog.novidades.length === 0 && changelog.correcoes.length === 0) {
    const versions = await getRecentVersions(3);
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
    // Simple table - just key/value, no extra columns
    db.run(`
      CREATE TABLE IF NOT EXISTS bot_config (
        key TEXT PRIMARY KEY,
        value TEXT
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
