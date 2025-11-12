/**
 * Ban command handler - kicks mentioned users from group
 * Requires bot to have admin permissions in the group
 */

const { safeReply } = require('../../utils/safeMessaging');
const { normalizeJid, isJidGroup } = require('../../utils/jidUtils');
const { resolveSenderId } = require('../../database');
const { getEnvAdminSet, senderIsAdminFromMessage } = require('../../utils/adminUtils');

/**
 * Collect candidate text fragments from a message that may contain mentions
 * @param {object} message - Message object
 * @returns {string[]} Array of text fragments
 */
function collectMessageTextFragments(message) {
  const fragments = new Set();

  const add = (value) => {
    if (!value) return;
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (trimmed) {
      fragments.add(trimmed);
    }
  };

  add(message?.body);
  add(message?.text);
  add(message?.caption);

  const messageNode = message?.message || message?.msg;
  const nodesToInspect = [];
  if (messageNode && typeof messageNode === 'object') {
    nodesToInspect.push(messageNode);
    if (messageNode.ephemeralMessage?.message) {
      nodesToInspect.push(messageNode.ephemeralMessage.message);
    }
    if (messageNode.ephemeralMessageV2?.message) {
      nodesToInspect.push(messageNode.ephemeralMessageV2.message);
    }
    if (messageNode.viewOnceMessage?.message) {
      nodesToInspect.push(messageNode.viewOnceMessage.message);
    }
    if (messageNode.viewOnceMessageV2?.message) {
      nodesToInspect.push(messageNode.viewOnceMessageV2.message);
    }
  }

  nodesToInspect.forEach(node => {
    if (!node || typeof node !== 'object') return;
    add(node.conversation);
    add(node.text);
    add(node.caption);
    add(node.selectedDisplayText);
    add(node?.extendedTextMessage?.text);
    add(node?.imageMessage?.caption);
    add(node?.videoMessage?.caption);
    add(node?.documentMessage?.caption);
    add(node?.buttonsResponseMessage?.selectedDisplayText);
    add(node?.buttonsResponseMessage?.selectedButtonId);
    add(node?.listResponseMessage?.title);
    add(node?.listResponseMessage?.description);
    add(node?.listResponseMessage?.singleSelectReply?.selectedDisplayText);
    add(node?.interactiveResponseMessage?.body?.text);
  });

  return Array.from(fragments);
}

/**
 * Try to find a participant JID in the provided metadata that matches the token
 * @param {string} token - Candidate token extracted from text
 * @param {object} groupMetadata - Group metadata containing participants
 * @returns {string|null} Matching participant JID or null
 */
function findParticipantJidFromToken(token, groupMetadata) {
  if (!token) return null;
  const participants = Array.isArray(groupMetadata?.participants)
    ? groupMetadata.participants
    : [];

  if (participants.length === 0) {
    return null;
  }

  const normalizedToken = normalizeJid(token);
  const tokenDigits = token.replace(/\D+/g, '');

  for (const participant of participants) {
    const participantJid = normalizeJid(participant?.id);
    if (!participantJid) continue;

    if (normalizedToken && participantJid === normalizedToken) {
      return participantJid;
    }

    if (normalizedToken && !normalizedToken.includes('@')) {
      const participantLocalPart = participantJid.split('@')[0];
      if (participantLocalPart === normalizedToken) {
        return participantJid;
      }
    }

    if (tokenDigits) {
      const participantDigits = participantJid.replace(/\D+/g, '');
      if (participantDigits === tokenDigits) {
        return participantJid;
      }
    }
  }

  return null;
}

/**
 * Extract mentioned JID from message
 * @param {object} message - Message object
 * @param {object} [groupMetadata] - Optional group metadata
 * @returns {string|null} - Mentioned user JID or null
 */
function extractMentionedJid(message, groupMetadata = null) {
  if (!message) return null;

  const candidates = [];
  const pushCandidate = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(pushCandidate);
      return;
    }
    if (typeof value === 'object') {
      if (typeof value.jid === 'string') {
        pushCandidate(value.jid);
        return;
      }
      if (typeof value.id === 'string') {
        pushCandidate(value.id);
        return;
      }
      if (typeof value.user === 'string') {
        const server = typeof value.server === 'string'
          ? value.server
          : (typeof value.domain === 'string' ? value.domain : '');
        const jid = server ? `${value.user}@${server}` : value.user;
        pushCandidate(jid);
        return;
      }
    }

    if (typeof value === 'string' || typeof value === 'number') {
      candidates.push(String(value));
    }
  };

  pushCandidate(message.mentionedJid);
  pushCandidate(message.mentions);
  pushCandidate(message.mentionedIds);

  const contextInfo = message.contextInfo;
  if (contextInfo) {
    pushCandidate(contextInfo.mentionedJid);
    pushCandidate(contextInfo.participants);
    pushCandidate(contextInfo.participant);
  }

  const messageNode = message.message || message.msg;
  const addContextCandidates = (node) => {
    if (!node) return;
    const possibleContexts = [
      node.extendedTextMessage?.contextInfo,
      node.imageMessage?.contextInfo,
      node.videoMessage?.contextInfo,
      node.buttonsResponseMessage?.contextInfo,
      node.listResponseMessage?.contextInfo,
      node.interactiveResponseMessage?.contextInfo,
      node.templateButtonReplyMessage?.contextInfo,
      node.contextInfo,
      node.conversationContextInfo
    ];

    possibleContexts.forEach(ctx => {
      if (!ctx) return;
      pushCandidate(ctx.mentionedJid);
      pushCandidate(ctx.participants);
      pushCandidate(ctx.participant);
    });
  };

  addContextCandidates(messageNode);
  addContextCandidates(messageNode?.ephemeralMessage?.message);
  addContextCandidates(messageNode?.ephemeralMessageV2?.message);
  addContextCandidates(messageNode?.viewOnceMessage?.message);
  addContextCandidates(messageNode?.viewOnceMessageV2?.message);

  const normalizedCandidates = [];
  for (const value of candidates) {
    const normalized = normalizeJid(value);
    if (!normalized) continue;
    if (!normalizedCandidates.includes(normalized)) {
      normalizedCandidates.push(normalized);
    }
    if (normalized.includes(':')) {
      return normalized;
    }
  }

  if (normalizedCandidates.length > 0) {
    return normalizedCandidates[0];
  }

  const metadata = groupMetadata || message?.groupMetadata;
  const textFragments = collectMessageTextFragments(message);

  for (const fragment of textFragments) {
    const matches = fragment.match(/@[^\s@]+/g);
    if (!matches) continue;

    for (const rawMatch of matches) {
      const sanitized = rawMatch
        .replace(/^@+/, '')
        .replace(/[\]\[(){}<>,;!?]+$/g, '')
        .trim();
      if (!sanitized) continue;

      const directCandidate = normalizeJid(sanitized);
      if (directCandidate && directCandidate.includes('@')) {
        return directCandidate;
      }

      const participantJid = findParticipantJidFromToken(sanitized, metadata);
      if (participantJid) {
        return participantJid;
      }
    }
  }

  return null;
}

/**
 * Check if sender is an admin
 * @param {string} resolvedSenderId - Sender JID
 * @param {object} message - Message object
 * @returns {boolean} - True if sender is admin
 */
function isAdmin(resolvedSenderId, message) {
  const normalizedSender = normalizeJid(resolvedSenderId);
  if (!normalizedSender) return false;

  // Check environment admins
  const envAdmins = getEnvAdminSet();
  if (envAdmins.has(normalizedSender)) {
    return true;
  }

  return senderIsAdminFromMessage(message);
}

/**
 * Handles the #ban command (kicks user from group)
 * @param {object} client - WhatsApp client
 * @param {object} message - Message object
 * @param {string} chatId - Chat ID
 * @param {array} params - Command parameters (unused)
 * @param {object} context - Additional context
 */
async function handleBanCommand(client, message, chatId, params = [], context = {}) {
  try {
    // Check if this is a group chat
    const groupId = context?.groupId || message?.from || chatId;
    const isGroup = context?.isGroup ?? isJidGroup(groupId || '');
    
    if (!isGroup) {
      await safeReply(client, chatId, '⚠️ Este comando só funciona em grupos.', message);
      return true;
    }

    // Check if sender is admin
    const messageKey = message?.key || {};
    const rawSender = messageKey.participant || messageKey.participantAlt || message?.sender?.id || message?.author || message?.from;
    const resolvedSenderId = await resolveSenderId(client?.sock || client, rawSender);
    
    if (!isAdmin(resolvedSenderId, message)) {
      await safeReply(client, chatId, '⚠️ Apenas administradores podem usar este comando.', message);
      return true;
    }

    // Extract mentioned user
    const groupMetadata = context?.groupMetadata || message?.groupMetadata;
    const mentionedJid = extractMentionedJid(message, groupMetadata);
    
    if (!mentionedJid) {
      await safeReply(client, chatId, '⚠️ Você precisa mencionar um usuário para banir.\nUso: #ban @usuario', message);
      return true;
    }

    // Prevent banning the bot itself
    const botJid = normalizeJid(
      (client.user && client.user.id) ||
      process.env.BOT_WHATSAPP_NUMBER ||
      ''
    );
    if (mentionedJid === botJid) {
      await safeReply(client, chatId, '⚠️ Você não pode banir o próprio bot.', message);
      return true;
    }

    // Prevent banning other admins (including super admins)
    // Get group participants and admin list
    let adminJids = [];
    if (groupMetadata && Array.isArray(groupMetadata.participants)) {
      adminJids = groupMetadata.participants
        .filter(p => p.isAdmin || p.isSuperAdmin)
        .map(p => normalizeJid(p.id));
    }
    // Also check env super admins
    const envAdmins = getEnvAdminSet();
    if (adminJids.includes(mentionedJid) || envAdmins.has(mentionedJid)) {
      await safeReply(client, chatId, '⚠️ Você não pode banir outro administrador ou super admin.', message);
      return true;
    }
    // Try to kick the user
    try {
      // Use the groupParticipantsUpdate function via the client
      if (typeof client.groupParticipantsUpdate === 'function') {
        await client.groupParticipantsUpdate(groupId, [mentionedJid], 'remove');
        await safeReply(client, chatId, '✅ Usuário removido do grupo.', message);
      } else {
        // Fallback for adapter that doesn't support this yet
        await safeReply(client, chatId, '⚠️ Esta funcionalidade ainda não está disponível. O bot precisa ter poderes de administrador e o suporte para remoção de participantes precisa ser implementado.', message);
      }
    } catch (error) {
      console.error('[BAN] Error removing participant:', error);
      
      // Prefer error codes if available, fallback to message substrings.
      // Baileys groupParticipantsUpdate may return errors like:
      //   { code: '401', message: 'not authorized' } (bot not admin)
      //   { code: '404', message: 'not found' } (user not in group)
      // See: https://github.com/adiwajshing/Baileys/issues/ (for error format)
      if (error.code === '401' || (error.message && error.message.includes('not authorized'))) {
        await safeReply(client, chatId, '⚠️ O bot não tem permissão de administrador neste grupo.', message);
      } else if (error.code === '404' || (error.message && error.message.includes('not found'))) {
        await safeReply(client, chatId, '⚠️ Usuário não encontrado no grupo.', message);
      } else {
        await safeReply(client, chatId, `⚠️ Erro ao remover usuário: ${error.message}`, message);
      }
    }

    return true;
  } catch (error) {
    console.error('[BAN] Error handling ban command:', error);
    await safeReply(client, chatId, 'Erro ao processar comando #ban.', message);
    return true;
  }
}

module.exports = {
  handleBanCommand,
  extractMentionedJid,
  isAdmin
};
