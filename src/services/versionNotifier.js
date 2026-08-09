/**
 * Version Notifier Service
 * Sends update notifications to a configured group when bot version changes
 */

const fs = require('fs').promises;
const path = require('path');
const { db } = require('../database/connection');
const packageJson = require('../../package.json');

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
    const changelogPath = path.join(__dirname, '..', '..', 'CHANGELOG.md');
    const content = await fs.readFile(changelogPath, 'utf-8');
    const versionHeader = `## [${version}]`;
    const versionIndex = content.indexOf(versionHeader);
    if (versionIndex === -1) return { novidades: [], correcoes: [], sections: [] };

    const rest = content.slice(versionIndex + versionHeader.length);
    const nextVersionMatch = rest.match(/^## \[/m);
    const versionSection = nextVersionMatch ? rest.slice(0, nextVersionMatch.index) : rest;
    const sectionMatches = [...versionSection.matchAll(/^### (.+?)\s*$/gm)];
    const sections = [];

    for (let i = 0; i < sectionMatches.length; i += 1) {
      const title = sectionMatches[i][1].trim();
      const bodyStart = sectionMatches[i].index + sectionMatches[i][0].length;
      const bodyEnd = i + 1 < sectionMatches.length ? sectionMatches[i + 1].index : versionSection.length;
      const translations = {
        'docs: refresh bot specialist profiles': 'Atualiza os perfis especializados do bot',
        'docs: remove obsolete and duplicate documentation': 'Remove documentação obsoleta e duplicada',
        'docs: make env example placeholders explicit': 'Torna explícitos os placeholders dos exemplos de ambiente',
        'docs: establish canonical agent contract and scoped profiles': 'Estabelece o contrato canônico do agente e perfis especializados',
        'ci: modernize workflows and restore clean validation': 'Moderniza os workflows e restaura a validação limpa',
        'test: make clean CI schema and fixtures portable': 'Torna o schema e os fixtures de CI limpos e portáveis',
        'chore: remove empty legacy scheduler path': 'Remove o caminho legado vazio do agendador',
        'chore: remove unused local whisper runtime': 'Remove o runtime local do Whisper não utilizado',
        'chore: prepare sanitized 0.2.0 candidate': 'Prepara a candidata sanitizada 0.2.0',
      };
      const items = versionSection.slice(bodyStart, bodyEnd)
        .split('\n')
        .map(line => line.match(/^[-*]\s+(.+?)\s*$/)?.[1]?.trim())
        .filter(Boolean)
        .map(item => item.replace(/\s+\(por [^)]+\)\s+\(\[link\]\([^)]*\)\)\s*$/i, '').trim())
        .map(item => translations[item.toLowerCase().replace(/\s+/g, ' ')] || (/^test:/i.test(item) ? 'Melhora a portabilidade do schema e dos fixtures de CI' : item))
        .filter(Boolean);
      if (items.length) sections.push({ title, items });
    }

    return {
      novidades: sections.filter(s => /^(novidades|features?)$/i.test(s.title)).flatMap(s => s.items),
      correcoes: sections.filter(s => /^(correções|correcoes|fixes?)$/i.test(s.title)).flatMap(s => s.items),
      sections,
    };
  } catch (err) {
    console.error('[VersionNotifier] Erro ao ler CHANGELOG:', err.message);
    return { novidades: [], correcoes: [], sections: [] };
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

  // Include every section emitted by the GitHub changelog workflow.
  const sections = changelog.sections || [];
  if (sections.length > 0) {
    for (const section of sections) {
      const icon = /^(correções|correcoes|fixes?)$/i.test(section.title) ? '🐛'
        : /^(novidades|features?)$/i.test(section.title) ? '✨' : '📌';
      message += `${icon} *${section.title}:*\n`;
      for (const item of section.items) message += `  • ${item}\n`;
      message += `\n`;
    }
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
