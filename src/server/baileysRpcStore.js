'use strict';

function jidOf(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value._serialized || value.id || '';
}

function timestampOf(message) {
  const value = Number(message?.messageTimestamp || message?.timestamp || 0);
  return Number.isFinite(value) ? value : 0;
}

function createBaileysRpcStore({ maxMessagesPerChat = 100, initialState = null } = {}) {
  const chats = new Map();
  const groups = new Map();
  const messagesByChat = new Map();
  const maxMessages = Math.max(1, Number(maxMessagesPerChat) || 100);

  function upsertChats(items = []) {
    for (const chat of Array.isArray(items) ? items : []) {
      const id = jidOf(chat?.id || chat?.jid);
      if (!id) continue;
      const previous = chats.get(id) || {};
      chats.set(id, {
        ...previous,
        ...chat,
        id,
        name: chat?.name || chat?.subject || previous.name || previous.subject || ''
      });
    }
  }

  function upsertGroups(input = {}) {
    const items = Array.isArray(input) ? input : Object.values(input || {});
    for (const group of items) {
      const id = jidOf(group?.id);
      if (!id || !id.endsWith('@g.us')) continue;
      const previous = groups.get(id) || {};
      const normalized = {
        ...previous,
        ...group,
        id,
        subject: group?.subject || group?.name || previous.subject || previous.name || '',
        participants: Array.isArray(group?.participants)
          ? group.participants.map((participant) => ({ ...participant, id: jidOf(participant?.id || participant) }))
          : (previous.participants || [])
      };
      groups.set(id, normalized);
      upsertChats([{ ...normalized, name: normalized.subject, isGroup: true }]);
    }
  }

  function addMessages(items = []) {
    for (const message of Array.isArray(items) ? items : []) {
      const chatId = jidOf(message?.key?.remoteJid || message?.chatId || message?.from);
      const messageId = jidOf(message?.key?.id || message?.id || message?.messageId);
      if (!chatId || !messageId) continue;
      const current = messagesByChat.get(chatId) || [];
      const byId = new Map(current.map((entry) => [jidOf(entry?.key?.id || entry?.id), entry]));
      byId.set(messageId, message);
      const ordered = [...byId.values()]
        .sort((a, b) => timestampOf(a) - timestampOf(b))
        .slice(-maxMessages);
      messagesByChat.set(chatId, ordered);
      const latest = ordered[ordered.length - 1];
      upsertChats([{ id: chatId, conversationTimestamp: timestampOf(latest) }]);
    }
  }

  function ingestHistory(payload = {}) {
    upsertChats(payload.chats);
    addMessages(payload.messages);
  }

  function listChats() {
    return [...chats.values()].sort((a, b) => Number(b.conversationTimestamp || 0) - Number(a.conversationTimestamp || 0));
  }

  function getAllGroupsMetadata() {
    return [...groups.values()];
  }

  function getMessages(chatId, limit = 50) {
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 50, maxMessages));
    return (messagesByChat.get(String(chatId)) || []).slice(-boundedLimit);
  }

  function exportState() {
    return {
      chats: listChats(),
      groups: getAllGroupsMetadata(),
      messagesByChat: Object.fromEntries([...messagesByChat.entries()])
    };
  }

  if (initialState && typeof initialState === 'object') {
    upsertChats(initialState.chats);
    upsertGroups(initialState.groups);
    for (const [chatId, entries] of Object.entries(initialState.messagesByChat || {})) {
      addMessages((Array.isArray(entries) ? entries : []).map((entry) => ({
        ...entry,
        key: { ...(entry.key || {}), remoteJid: entry?.key?.remoteJid || chatId }
      })));
    }
  }

  return { upsertChats, upsertGroups, addMessages, ingestHistory, listChats, getAllGroupsMetadata, getMessages, exportState };
}

module.exports = { createBaileysRpcStore };
