const { getReactionAnalytics } = require('../../database/models/reactions');
const { safeReply } = require('../../utils/safeMessaging');
async function handleTopReactionsCommand(client, message, args = []) {
  const days = Math.min(Math.max(Number.parseInt(args[0], 10) || 7, 1), 30);
  try {
    const data = await getReactionAnalytics({ from: Date.now() - days * 86400000, to: Date.now(), chatId: message.from, limit: 10 });
    if (!data.totalReactions) return safeReply(client, message.from, '📊 Nenhuma reação encontrada nesta janela.', message);
    let out = '📊 *Top reações dos últimos ' + days + ' dias*\n\n';
    out += 'Total: ' + data.totalReactions + '\n';
    out += data.topMedia.map((m, i) => (i + 1) + '. ID #' + m.media_id + ' — ' + m.reaction_count + ' reações').join('\n');
    out += '\n\n' + data.emojiCounts.map(e => e.emoji + ' × ' + e.count).join('  ');
    return safeReply(client, message.from, out, message);
  } catch (error) {
    console.error('[TopReactionsCommand] Error:', error.message);
    return safeReply(client, message.from, '❌ Não consegui calcular o ranking de reações.', message);
  }
}
module.exports={handleTopReactionsCommand};
