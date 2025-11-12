/**
 * Top 5 commands handler
 */

const database = require('../../database/index.js');
const { safeReply } = require('../../utils/safeMessaging');

function createTop5CommandsHandler({ getTopCommands = database.getTopCommands, safeReplyFn = safeReply } = {}) {
  return async function handleTop5CommandsCommand(client, message, chatId, limit = 5) {
    try {
      const topCommands = await getTopCommands(limit);

      if (!topCommands || topCommands.length === 0) {
        await safeReplyFn(client, chatId, 'Nenhum comando foi usado ainda.', message);
        return;
      }

      const maxResults = Math.min(topCommands.length, limit || topCommands.length);
      let response = `🏆 *Top ${maxResults} comandos mais usados:*\\n\\n`;

      topCommands.slice(0, maxResults).forEach((entry, index) => {
        const position = index + 1;
        const emoji = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}.`;
        response += `${emoji} ${entry.command} — ${entry.total_usage} usos\\n`;
      });

      await safeReplyFn(client, chatId, response.trim(), message);
    } catch (error) {
      console.error('Erro no comando #top5comandos:', error);
      await safeReplyFn(client, chatId, 'Erro ao buscar ranking de comandos.', message);
    }
  };
}

module.exports = {
  handleTop5CommandsCommand: createTop5CommandsHandler(),
  createTop5CommandsHandler
};
