/**
 * Top 5 users command handler
 */

const { getTop5UsersByStickerCount } = require('../../database/index.js');
const { safeReply } = require('../../utils/safeMessaging');

/**
 * Handles the #top5users command
 * @param {object} client - WhatsApp client
 * @param {object} message - Message object
 * @param {string} chatId - Chat ID
 */
async function handleTop5UsersCommand(client, message, chatId) {
  try {
    const topUsers = await getTop5UsersByStickerCount();
    if (!topUsers || topUsers.length === 0) {
      await safeReply(client, chatId, 'Nenhum usuário encontrado.', message.id);
      return;
    }

    let reply = 'Top 5 usuários que enviaram figurinhas:\n\n';

    for (let i = 0; i < topUsers.length; i++) {
      const user = topUsers[i];
      let userName = (user.display_name && user.display_name.trim()) || null;

      // Se é um grupo, usa o nome do grupo ou gera um nome baseado no ID
      if (user.is_group) {
        if (!userName && user.group_id) {
          userName = `Grupo ${user.group_id.replace('@g.us', '').substring(0, 10)}...`;
        }
        userName = userName || 'Grupo desconhecido';
      } else {
        // Para usuários individuais, tenta buscar informações do contato
        if (!userName && user.effective_sender) {
          try {
            const contact = await client.getContact(user.effective_sender);
            userName =
              contact?.pushname ||
              contact?.formattedName ||
              contact?.notifyName ||
              contact?.name ||
              null;
          } catch {
            // ignore
          }
        }

        if (!userName) {
          userName = user.effective_sender ? String(user.effective_sender).split('@')[0] : 'Desconhecido';
        }
      }

      reply += `${i + 1}. ${userName} - ${user.sticker_count} figurinhas\n`;
    }

    await safeReply(client, chatId, reply, message.id);
  } catch (err) {
    console.error('Erro ao buscar top 5 usuários:', err);
    await safeReply(client, chatId, 'Erro ao buscar top 5 usuários.', message.id);
  }
}

module.exports = { handleTop5UsersCommand };
