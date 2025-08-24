// Helpers para armazenar nomes de usuários a partir do open-wa message.sender
const { db } = require('../database.js');

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
}

/**
 * Extrai o melhor nome exibível do objeto de mensagem do open-wa.
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
 * Chame isso em todo onMessage do open-wa.
 */
function upsertContactFromMessage(message) {
  const senderId = message?.sender?.id || message?.from; // fallback
  const display = extractDisplayNameFromMessage(message);
  // Mesmo sem display, inserimos o sender_id para futura atualização.
  upsertContact(senderId, display || '');
}

module.exports = {
  initContactsTable,
  upsertContactFromMessage,
  upsertContact,
  extractDisplayNameFromMessage,
};