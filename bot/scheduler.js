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
const { withTyping } = require('../utils/typingIndicator');
const { getBotConfig } = require('../web/dataAccess');

const AUTO_SEND_GROUP_ID = process.env.AUTO_SEND_GROUP_ID;
let autoSendTask = null;
let lastCronExpr = null;

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

  // Show typing while preparing and sending the random media
  await withTyping(client, AUTO_SEND_GROUP_ID, async () => {
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
  });
}

/**
 * Schedules automatic media sending to the configured group
 * @param {Object} client - WhatsApp client instance
 * @param {Function} sendStickerFunction - Function to send stickers
 */

/**
 * Schedules or updates automatic media sending to the configured group, reading frequency from bot_config
 * @param {Object} client - WhatsApp client instance
 * @param {Function} sendStickerFunction - Function to send stickers
 */
async function scheduleAutoSend(client, sendStickerFunction) {
  if (!AUTO_SEND_GROUP_ID) {
    console.warn('AUTO_SEND_GROUP_ID não configurado no .env');
    return;
  }

  const tz = process.env.TIMEZONE || process.env.TZ || 'America/Sao_Paulo';

  // Busca expressão cron do banco/config
  let cronExpr = await getBotConfig('auto_post_cron');
  if (!cronExpr) {
    // fallback padrão: de hora em hora das 08:00 às 21:00
    cronExpr = '0 8-21 * * *';
  }

  // Validação da expressão CRON
  if (!cron.validate(cronExpr)) {
    console.error(`[SCHEDULER] Expressão CRON inválida: '${cronExpr}'. Agendamento não será iniciado.`);
    return;
  }

  // Se já existe uma task e a expressão mudou, para a anterior
  if (autoSendTask && lastCronExpr !== cronExpr) {
    autoSendTask.stop();
    autoSendTask = null;
  }

  if (!autoSendTask) {
    try {
      autoSendTask = cron.schedule(cronExpr, () => sendRandomMediaToGroup(client, sendStickerFunction), {
        timezone: tz,
      });
      lastCronExpr = cronExpr;
      console.log(`[SCHEDULER] Agendamento: '${cronExpr}' no fuso ${tz}.`);
    } catch (err) {
      console.error(`[SCHEDULER] Erro ao agendar tarefa com expressão '${cronExpr}':`, err);
      return;
    }
  }

  // Checa a cada 2 minutos se houve alteração na config
  setInterval(async () => {
    const newExpr = await getBotConfig('auto_post_cron');
    if (newExpr && newExpr !== lastCronExpr) {
      if (!cron.validate(newExpr)) {
        console.error(`[SCHEDULER] Expressão CRON inválida detectada na atualização: '${newExpr}'. Agendamento não será alterado.`);
        return;
      }
      console.log(`[SCHEDULER] Atualizando agendamento para: '${newExpr}'`);
      if (autoSendTask) autoSendTask.stop();
      try {
        autoSendTask = cron.schedule(newExpr, () => sendRandomMediaToGroup(client, sendStickerFunction), {
          timezone: tz,
        });
        lastCronExpr = newExpr;
      } catch (err) {
        console.error(`[SCHEDULER] Erro ao atualizar agendamento com expressão '${newExpr}':`, err);
      }
    }
  }, 2 * 60 * 1000);
}

module.exports = {
  pickRandomMedia,
  sendRandomMediaToGroup,
  scheduleAutoSend
};