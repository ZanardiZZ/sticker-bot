const { findById } = require('../../database');
const { enqueueReevaluation } = require('../../services/stickerReevaluation');
const { safeReply } = require('../../utils/safeMessaging');
async function handleReavaliarCommand(client, message, chatId, params = [], context = {}) {
  const parts = Array.isArray(params) ? params : String(params || '').trim().split(/\s+/).filter(Boolean);
  const mediaId = Number(parts[0]);
  if (!Number.isInteger(mediaId) || mediaId <= 0) {
    await safeReply(client, chatId, 'Uso: #reavaliar <id> [geral|personagem|texto|referencia]', message.id);
    return;
  }
  const requesterId = context.resolvedSenderId || message.sender?.id || message.author || message.from;
  const result = await enqueueReevaluation({ mediaId, mode: parts[1] || 'geral', requesterId, client, chatId, message });
  await safeReply(client, chatId, result.message, message.id);
}
module.exports = { handleReavaliarCommand };
