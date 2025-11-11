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
  // Check for mentionedJid array in message
  if (message.mentionedJid && Array.isArray(message.mentionedJid) && message.mentionedJid.length > 0) {
    return message.mentionedJid[0]; // Return first mentioned user
  }
  
  // Check in message.message for Baileys format
  if (message.message) {
    const msgContent = message.message.extendedTextMessage 
      || message.message.imageMessage 
      || message.message.videoMessage;
    
    if (msgContent?.contextInfo?.mentionedJid && msgContent.contextInfo.mentionedJid.length > 0) {
      return msgContent.contextInfo.mentionedJid[0];
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
