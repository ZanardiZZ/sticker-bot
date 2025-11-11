/**
 * Ban command handler - kicks mentioned users from group
 * Requires bot to have admin permissions in the group
 */

const { safeReply } = require('../../utils/safeMessaging');
const { normalizeJid, isJidGroup } = require('../../utils/jidUtils');
const { resolveSenderId } = require('../../database');
const { getEnvAdminSet, senderIsAdminFromMessage } = require('../../utils/adminUtils');

/**
 * Extract mentioned JID from message
 * @param {object} message - Message object
 * @returns {string|null} - Mentioned user JID or null
 */
function extractMentionedJid(message) {
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
  if (messageNode) {
    const possibleContexts = [
      messageNode.extendedTextMessage?.contextInfo,
      messageNode.imageMessage?.contextInfo,
      messageNode.videoMessage?.contextInfo,
      messageNode.buttonsResponseMessage?.contextInfo,
      messageNode.listResponseMessage?.contextInfo,
      messageNode.interactiveResponseMessage?.contextInfo,
      messageNode.templateButtonReplyMessage?.contextInfo,
      messageNode.contextInfo
    ];

    possibleContexts.forEach(ctx => {
      if (!ctx) return;
      pushCandidate(ctx.mentionedJid);
      pushCandidate(ctx.participants);
      pushCandidate(ctx.participant);
    });
  }

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

  return normalizedCandidates[0] || null;
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
    const mentionedJid = extractMentionedJid(message);
    
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
    const groupMetadata = message?.groupMetadata;
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
