// Helpers para armazenar nomes de usuários a partir de mensagens do WhatsApp
const { db } = require('../database/index.js');

/**
 * Cria a tabela contacts caso não exista.
 */
function initContactsTable() {
  db.run(`
    CREATE TABLE IF NOT EXISTS contacts (
      sender_id TEXT PRIMARY KEY,
      display_name TEXT,
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_contacts_display_name ON contacts(display_name)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS groups (
      group_id TEXT PRIMARY KEY,
      display_name TEXT,
      last_interaction_ts INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_groups_display_name ON groups(display_name)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_groups_last_interaction ON groups(last_interaction_ts DESC)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS group_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      blocked INTEGER NOT NULL DEFAULT 0,
      last_activity DATETIME,
      interaction_count INTEGER NOT NULL DEFAULT 0,
      allowed_commands TEXT,
      restricted_commands TEXT,
      UNIQUE(group_id, user_id)
    )
  `);
}

function looksLikePersonName(raw) {
  if (!raw) return false;
  const clean = raw.trim();
  // Reject if it contains common group-ish words
  if (/grupo|figurinhas|stickers|turma|clube/i.test(clean)) return false;
  const words = clean.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  // Consider it a person name if 2–4 capitalized words and no hashtags/prefixes
  const capitalizedWords = words.filter((w) => /^[A-ZÀ-Ý][a-zà-ÿ.'-]{1,}$/.test(w));
  return capitalizedWords.length === words.length;
}

function sanitizeGroupName(name, groupId) {
  const raw = typeof name === 'string' ? name.trim() : '';
  if (!raw) return null;

  const normalized = raw.toLowerCase();
  const normalizedGroup = String(groupId || '').trim().toLowerCase();
  const normalizedGroupBase = normalizedGroup.replace('@g.us', '');
  const normalizedNameBase = normalized.replace('@g.us', '');

  // Avoid persisting the JID or its numeric portion as the display name
  if (normalized === normalizedGroup || normalizedNameBase === normalizedGroupBase) {
    return null;
  }

  // Drop anything that still looks like a group JID
  if (normalized.endsWith('@g.us')) {
    return null;
  }

  // Avoid persisting contact/person names as group names
  if (looksLikePersonName(raw)) {
    return null;
  }

  return raw;
}

function upsertGroupUser(groupId, userId, role = 'user', lastActivitySec = null) {
  if (!groupId || !userId) return;
  const lastActivity = Number.isFinite(lastActivitySec) ? Number(lastActivitySec) : null;
  db.run(
    `
    INSERT INTO group_users (group_id, user_id, role, blocked, last_activity, interaction_count)
    VALUES (?, ?, ?, 0, ?, 0)
    ON CONFLICT(group_id, user_id) DO UPDATE SET
      role = excluded.role,
      blocked = COALESCE(group_users.blocked, 0),
      last_activity = COALESCE(excluded.last_activity, group_users.last_activity)
    `,
    [groupId, userId, role, lastActivity],
    (err) => {
      if (err) console.error('[group_users] upsert error:', err);
    }
  );
}

function upsertGroupMembers(groupId, participants = []) {
  if (!groupId || !groupId.endsWith('@g.us')) return;
  for (const p of Array.isArray(participants) ? participants : []) {
    const userId = p?.id || p?.jid || p?.user || p;
    if (!userId || typeof userId !== 'string') continue;
    const adminFlag = String(p?.admin || '').toLowerCase();
    const role = adminFlag === 'admin' || adminFlag === 'superadmin' ? 'admin' : 'user';
    upsertGroupUser(groupId, userId, role);
  }
}

/**
 * Extrai o melhor nome exibível do objeto de mensagem do WhatsApp.
 * Prioridade: formattedName > pushname > name > shortName > notifyName > null
 */
function extractDisplayNameFromMessage(message) {
  const s = message?.sender || {};
  const candidates = [
    s.formattedName,
    s.pushname,
    s.name,
    s.shortName,
    message?.notifyName
  ];
  const picked = candidates.find(v => typeof v === 'string' && v.trim() !== '');
  return picked ? picked.trim() : null;
}

/**
 * Faz UPSERT do contato usando sender_id + display_name.
 * Só atualiza se o nome mudou, evitando escrita desnecessária.
 */
function upsertContact(senderId, displayName) {
  if (!senderId) return;
  const name = String(displayName || '').trim();

  // Se não houver nome, ainda cria o registro sem display_name para futura atualização
  db.run(`
    INSERT INTO contacts(sender_id, display_name, updated_at)
    VALUES (?, ?, strftime('%s','now'))
    ON CONFLICT(sender_id) DO UPDATE SET
      display_name = excluded.display_name,
      updated_at   = excluded.updated_at
    WHERE COALESCE(contacts.display_name,'') <> COALESCE(excluded.display_name,'')
  `, [senderId, name], (err) => {
    if (err) console.error('[contacts] upsert error:', err);
  });
}

/**
 * Chame isso em todo onMessage do handler de mensagens.
 * Evita gravar o ID do grupo (@g.us) como contato.
 */
function upsertContactFromMessage(message) {
  // Preferir id do remetente real. Em grupo: author; em DM: from (não é @g.us)
  let senderId =
    message?.sender?.id ||
    message?.author ||
    (message?.from && !String(message.from).endsWith('@g.us') ? message.from : null);

  if (!senderId) return;

  const display = extractDisplayNameFromMessage(message);
  upsertContact(senderId, display || '');
}

function upsertGroup(groupId, displayName, timestampSec) {
  if (!groupId || !groupId.endsWith('@g.us')) return;

  const name = sanitizeGroupName(displayName, groupId);
  const interactionTs = Number.isFinite(timestampSec) ? Number(timestampSec) : Math.floor(Date.now() / 1000);
  const now = Math.floor(Date.now() / 1000);

  db.run(
    `
      INSERT INTO groups (group_id, display_name, last_interaction_ts, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(group_id) DO UPDATE SET
        display_name = CASE
          WHEN COALESCE(excluded.display_name, '') = '' THEN groups.display_name
          WHEN COALESCE(groups.display_name, '') = '' THEN excluded.display_name
          WHEN excluded.display_name <> groups.display_name THEN excluded.display_name
          ELSE groups.display_name
        END,
        last_interaction_ts = CASE
          WHEN groups.last_interaction_ts IS NULL THEN excluded.last_interaction_ts
          WHEN excluded.last_interaction_ts IS NULL THEN groups.last_interaction_ts
          ELSE MAX(groups.last_interaction_ts, excluded.last_interaction_ts)
        END,
        updated_at = excluded.updated_at
    `,
    [groupId, name, interactionTs || null, now, now],
    (err) => {
      if (err) {
        console.error('[groups] upsert error:', err);
      }
    }
  );
}

function extractGroupNameFromMessage(message) {
  const chat = message?.chat || {};
  const candidates = [
    chat.name,
    chat.formattedTitle,
    chat.formattedName,
    chat.subject,
    chat.title,
    message?.groupName,
    message?.chatName
  ];
  const picked = candidates.find((v) => typeof v === 'string' && v.trim() !== '');
  const sanitized = sanitizeGroupName(picked, chat.id || message?.chatId || message?.from);
  return sanitized || null;
}

function upsertGroupFromMessage(message) {
  if (!message) return;
  const possibleIds = [message.chatId, message.from, message.to, message.chat?.id];
  const groupId = possibleIds.find((id) => typeof id === 'string' && id.endsWith('@g.us'));
  if (!groupId) return;

  const name = extractGroupNameFromMessage(message);
  const timestampSec = Number.isFinite(message?.timestamp)
    ? Number(message.timestamp)
    : Math.floor(Date.now() / 1000);

  upsertGroup(groupId, name, timestampSec);
}

module.exports = {
  initContactsTable,
  upsertContactFromMessage,
  upsertContact,
  upsertGroupFromMessage,
  upsertGroup,
  upsertGroupMembers,
  upsertGroupUser,
  extractDisplayNameFromMessage,
};
