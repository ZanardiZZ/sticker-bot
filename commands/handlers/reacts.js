/**
 * #reacts command - Shows most reacted stickers
 */

const { getMostReactedMedia, getReactionCountsForMedia } = require('../../database/models/reactions');
const { safeReply } = require('../../utils/safeMessaging');
const { incrementCommandUsage } = require('../../database/models/commandUsage');

/**
 * Handles #reacts command - displays ranking of most reacted stickers
 * @param {Object} client - WhatsApp client
 * @param {Object} message - Message object
 * @param {Array<string>} args - Command arguments
 */
async function handleReactsCommand(client, message, args) {
  const chatId = message.from;
  const senderId = message.sender?.id || message.from;

  try {
    // Track command usage
    await incrementCommandUsage('reacts', senderId, chatId);

    // Parse limit from args (default 10, max 20)
    let limit = 10;
    if (args.length > 0) {
      const parsedLimit = parseInt(args[0]);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        limit = Math.min(parsedLimit, 20); // Max 20
      }
    }

    // Get most reacted media
    const mostReacted = await getMostReactedMedia(limit);

    if (!mostReacted || mostReacted.length === 0) {
      await safeReply(
        client,
        chatId,
        '🤷 Nenhuma sticker recebeu reações ainda.\n\n💡 Reaja às stickers enviadas pelo bot para aparecerem aqui!',
        message
      );
      return;
    }

    // Build response message
    let response = `🏆 *Top ${mostReacted.length} Stickers Mais Reagidas*\n\n`;

    for (let i = 0; i < mostReacted.length; i++) {
      const item = mostReacted[i];
      const rank = i + 1;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;

      // Get detailed emoji breakdown for this media
      const emojiBreakdown = await getReactionCountsForMedia(item.media_id);
      const emojiStr = emojiBreakdown
        .map(e => `${e.emoji}×${e.count}`)
        .join(' ');

      response += `${medal} *ID #${item.media_id}*\n`;
      response += `   💬 ${item.reaction_count} reações\n`;
      response += `   ${emojiStr}\n\n`;
    }

    response += '💡 _Use #ID para ver a sticker_';

    await safeReply(client, chatId, response, message);

  } catch (error) {
    console.error('[ReactsCommand] Error:', error);
    await safeReply(
      client,
      chatId,
      '❌ Erro ao buscar stickers mais reagidas. Tente novamente.',
      message
    );
  }
}

module.exports = {
  handleReactsCommand,
  shouldTrackUsage: true,
  description: 'Mostra ranking de stickers mais reagidas'
};
