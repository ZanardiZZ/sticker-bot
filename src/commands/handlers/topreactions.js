const { getReactionAnalytics } = require('../../database/models/reactions');
const { safeReply } = require('../../utils/safeMessaging');
function parseReactionWindow(args = []) {
  if (!Array.isArray(args) || args.length === 0) return { days: 7 };
  const input = args.join(' ').trim().toLowerCase();
  const match = input.match(/^(\d{1,3})(?:\s*(?:d|dia|dias|day|days))?$/);
  if (!match) return { error: 'Formato inválido' };
  const days = Number(match[1]);
  if (!Number.isInteger(days) || days < 1 || days > 30) return { error: 'A janela deve estar entre 1 e 30 dias' };
  return { days };
}

async function handleTopReactionsCommand(client, message, args = []) {
  const window = parseReactionWindow(args);
  if (window.error) {
    return safeReply(client, message.from, 'Uso: #topreactions [dias]\nExemplos: #topreactions 7 ou #topreactions 30 dias\nA janela aceita valores de 1 a 30 dias.', message);
  }
  const { days } = window;
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
module.exports={handleTopReactionsCommand, parseReactionWindow};
