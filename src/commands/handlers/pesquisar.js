const { findMediaByMetadata, getTagsForMedia, incrementRandomCount } = require('../../database');
const { sendMediaByType } = require('../media');
const { renderInfoMessage } = require('../../utils/messageUtils');
const { safeReply } = require('../../utils/safeMessaging');
const { withTyping } = require('../../utils/typingIndicator');
async function handlePesquisarCommand(client, message, chatId, params = []) {
  const query = params.join(' ').trim();
  if (!query)
    return safeReply(
      client,
      chatId,
      'Uso: #pesquisar <situação, emoção ou referência>\nExemplo: #pesquisar reação de surpresa',
      message.id
    );
  try {
    const rows = await findMediaByMetadata(query, 5);
    if (!rows.length)
      return safeReply(
        client,
        chatId,
        'Nenhuma figurinha encontrada para essa pesquisa.',
        message.id
      );
    let sent = 0;
    for (const media of rows) {
      try {
        await withTyping(client, chatId, () => sendMediaByType(client, chatId, media));
        // Count only after the sticker was actually sent. This keeps #pesquisar
        // on a least-used rotation instead of returning the same first results.
        await incrementRandomCount(media.id);
        const tags = await getTagsForMedia(media.id);
        const info = renderInfoMessage(media, tags);
        if (info) await safeReply(client, chatId, info, message.id);
        sent++;
      } catch (e) {
        console.warn('[Pesquisar] mídia ignorada:', e.message);
      }
    }
    if (!sent)
      await safeReply(
        client,
        chatId,
        'Encontrei registros, mas as mídias não estão disponíveis.',
        message.id
      );
  } catch (e) {
    console.error('[Pesquisar]', e.message);
    await safeReply(client, chatId, 'Não consegui pesquisar as figurinhas agora.', message.id);
  }
}
module.exports = { handlePesquisarCommand };
