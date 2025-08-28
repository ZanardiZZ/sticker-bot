/**
 * Bot scheduler for automatic sticker sending
 */

const cron = require('node-cron');
const { 
  processOldStickers, 
  getMediaWithLowestRandomCount, 
  incrementRandomCount,
  findById,
  getTagsForMedia 
} = require('../database');
const { cleanDescriptionTags, renderInfoMessage } = require('../utils/messageUtils');

const AUTO_SEND_GROUP_ID = process.env.AUTO_SEND_GROUP_ID;

/**
 * Picks a random media for automatic sending, prioritizing newly processed media
 * @returns {Object|null} Media record or null if none available
 */
async function pickRandomMedia() {
  // Prioriza novidades processadas; senão menor count_random
  const novas = await processOldStickers();
  if (novas && novas.length) {
    const last = novas[novas.length - 1];
    return { id: last.id, file_path: last.filePath, mimetype: 'image/webp' };
  }
  return getMediaWithLowestRandomCount();
}

/**
 * Sends a random media to the configured auto-send group
 * @param {Object} client - WhatsApp client instance
 * @param {Function} sendStickerFunction - Function to send stickers
 */
async function sendRandomMediaToGroup(client, sendStickerFunction) {
  if (!AUTO_SEND_GROUP_ID) {
    console.warn('AUTO_SEND_GROUP_ID não configurado no .env');
    return;
  }

  try {
    const media = await pickRandomMedia();
    if (!media) {
      console.log('Nenhuma mídia disponível para envio automático.');
      return;
    }

    await incrementRandomCount(media.id);
    await sendStickerFunction(client, AUTO_SEND_GROUP_ID, media);

    const full = await findById(media.id);
    if (full) {
      const tags = await getTagsForMedia(full.id);
      const clean = cleanDescriptionTags(full.description, tags);
      await client.sendText(AUTO_SEND_GROUP_ID, renderInfoMessage({ ...clean, id: full.id }));
    }

    console.log('Mídia enviada automaticamente ao grupo.');
  } catch (err) {
    console.error('Erro no envio automático:', err);
  }
}

/**
 * Schedules automatic media sending to the configured group
 * @param {Object} client - WhatsApp client instance
 * @param {Function} sendStickerFunction - Function to send stickers
 */
function scheduleAutoSend(client, sendStickerFunction) {
  if (!AUTO_SEND_GROUP_ID) {
    console.warn('AUTO_SEND_GROUP_ID não configurado no .env');
    return;
  }

  const tz = process.env.TIMEZONE || process.env.TZ || 'America/Sao_Paulo';

  // A cada hora cheia das 08:00 às 21:00 no fuso configurado
  cron.schedule('0 8-21 * * *', () => sendRandomMediaToGroup(client, sendStickerFunction), {
    timezone: tz,
  });

  console.log(`Agendamento: envios automáticos de 08h às 21h no fuso ${tz}, toda hora cheia.`);
}

module.exports = {
  pickRandomMedia,
  sendRandomMediaToGroup,
  scheduleAutoSend
};