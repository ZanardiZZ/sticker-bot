/**
 * Perfil command handler
 */

const database = require('../../database/index.js');
const { safeReply } = require('../../utils/safeMessaging');

function resolveDisplayName(contact, senderId) {
  const candidate = contact?.display_name;
  if (candidate && typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim();
  }

  if (typeof senderId === 'string' && senderId.includes('@')) {
    return senderId.split('@')[0];
  }

  return senderId || 'Usuário';
}

function createPerfilHandler({
  getContact = database.getContact,
  countMediaBySender = database.countMediaBySender,
  getUserCommandUsage = database.getUserCommandUsage,
  getTotalCommands = database.getTotalCommands,
  safeReplyFn = safeReply
} = {}) {
  return async function handlePerfilCommand(client, message, chatId, context = {}) {
    const senderId = context?.resolvedSenderId || message?.sender?.id || message?.author || message?.from || null;

    if (!senderId) {
      await safeReplyFn(client, chatId, 'Não foi possível identificar o usuário.', message);
      return;
    }

    try {
      const [contact, stickerCount, commandUsage, totalCommands] = await Promise.all([
        getContact(senderId),
        countMediaBySender(senderId),
        getUserCommandUsage(senderId),
        getTotalCommands(senderId)
      ]);

      const displayName = resolveDisplayName(contact, senderId);
      const totalStickers = Number.isFinite(stickerCount) ? stickerCount : 0;
      const totalCommandsUsed = Number.isFinite(totalCommands) ? totalCommands : 0;

      let response = '👤 *Perfil do usuário*\n';
      response += `• Nome: ${displayName}\n`;
      response += `• Figurinhas enviadas: ${totalStickers}\n`;
      response += `• Comandos utilizados: ${totalCommandsUsed}`;

      response += '\n\n📊 *Histórico de comandos*\n';

      if (commandUsage && commandUsage.length > 0) {
        commandUsage.forEach((entry, index) => {
          const position = index + 1;
          const commandName = entry.command || '-';
          const commandCount = Number(entry.usage_count) || 0;
          response += `${position}. ${commandName} — ${commandCount} usos\n`;
        });
        response = response.trimEnd();
      } else {
        response += 'Nenhum comando usado ainda.';
      }

      await safeReplyFn(client, chatId, response.trim(), message);
    } catch (error) {
      console.error('Erro ao gerar perfil do usuário:', error);
      await safeReplyFn(client, chatId, 'Erro ao montar o perfil do usuário.', message);
    }
  };
}

module.exports = {
  handlePerfilCommand: createPerfilHandler(),
  createPerfilHandler
};
