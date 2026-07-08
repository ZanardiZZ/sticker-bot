/**
 * #falha command handler
 * Re-encoda mídia com problema e tenta reenviar imediatamente.
 */

const { findById } = require('../../database/index.js');
const { sendMediaAsOriginal } = require('../media');
const { safeReply } = require('../../utils/safeMessaging');
const { withTyping } = require('../../utils/typingIndicator');

async function handleFalhaCommand(client, message, chatId) {
  const parts = String(message.body || '').trim().split(/\s+/);

  if (parts.length !== 2) {
    await safeReply(client, chatId, 'Uso: #falha <ID>\nExemplo: #falha 15065', message.id);
    return;
  }

  const mediaId = parts[1];

  try {
    const media = await findById(mediaId);
    if (!media) {
      await safeReply(client, chatId, `Mídia não encontrada para o ID ${mediaId}.`, message.id);
      return;
    }

    const mime = String(media.mimetype || '').toLowerCase();
    const isWebp = mime === 'image/webp' || String(media.file_path || '').toLowerCase().endsWith('.webp');

    if (!isWebp) {
      await safeReply(
        client,
        chatId,
        `⚠️ O #falha foi pensado para stickers WebP.\nID ${mediaId} não é WebP (${media.mimetype || 'desconhecido'}).`,
        message.id
      );
      return;
    }

    await withTyping(client, chatId, async () => {
      await sendMediaAsOriginal(client, chatId, media, { forceAnimatedReencode: true });
    });

    await safeReply(client, chatId, `✅ Re-encode aplicado e mídia ${mediaId} reenviada.`, message.id);
    console.log(`[handleFalhaCommand] Mídia ${mediaId} re-encodada e reenviada com sucesso`);
  } catch (error) {
    console.error(`[handleFalhaCommand] Erro ao processar #falha ${mediaId}:`, error?.message || error);
    await safeReply(client, chatId, `❌ Falha ao re-encodar/reenviar ID ${mediaId}: ${error?.message || 'erro desconhecido'}`, message.id);
  }
}

module.exports = {
  handleFalhaCommand
};
