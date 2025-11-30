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
} = require('../database/index.js');
const { cleanDescriptionTags, renderInfoMessage } = require('../utils/messageUtils');
const { withTyping } = require('../utils/typingIndicator');
const { getBotConfig } = require('../web/dataAccess');
const { bus } = require('../web/eventBus.js');

const AUTO_SEND_GROUP_ID = process.env.AUTO_SEND_GROUP_ID;
let autoSendTasks = [];
let lastCronExpr = null;

const MATCHING_HOUR_EXPRESSIONS = (() => {
  const exprs = [];
  for (let hour = 0; hour < 24; hour++) {
    const minute = (hour % 10) * 11;
    if (minute > 59) continue;
    exprs.push(`${minute} ${hour} * * *`);
  }
  return exprs;
})();

function stopScheduledTasks() {
  autoSendTasks.forEach(task => task.stop());
  autoSendTasks = [];
}

function scheduleCronExpressions(exprs, client, sendStickerFunction, tz) {
  const uniqueExprs = [...new Set(exprs)];
  uniqueExprs.forEach((expr) => {
    if (!cron.validate(expr)) {
      console.error(`[SCHEDULER] Expressão CRON inválida: '${expr}'.`);
      return;
    }
    try {
      const task = cron.schedule(expr, () => sendRandomMediaToGroup(client, sendStickerFunction), { timezone: tz });
      autoSendTasks.push(task);
    } catch (err) {
      console.error(`[SCHEDULER] Erro ao agendar tarefa com expressão '${expr}':`, err);
    }
  });
}

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
  let cronExpr = await getBotConfig('auto_send_cron');
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
  if (autoSendTasks.length && lastCronExpr !== cronExpr) {
    stopScheduledTasks();
  }

  if (!autoSendTasks.length) {
    scheduleCronExpressions([cronExpr, ...MATCHING_HOUR_EXPRESSIONS], client, sendStickerFunction, tz);
    lastCronExpr = cronExpr;
    console.log(`[SCHEDULER] Agendamento: '${cronExpr}' com horários casados adicionais no fuso ${tz}.`);
  }

    // Checa periodicamente se houve alteração na config (shorter interval to pick up cross-process updates)
    setInterval(async () => {
      const newExpr = await getBotConfig('auto_send_cron');
      if (newExpr && newExpr !== lastCronExpr) {
        if (!cron.validate(newExpr)) {
          console.error(`[SCHEDULER] Expressão CRON inválida detectada na atualização: '${newExpr}'. Agendamento não será alterado.`);
          return;
        }
        console.log(`[SCHEDULER] Detected cron change in DB. Atualizando agendamento para: '${newExpr}'`);
        stopScheduledTasks();
        scheduleCronExpressions([newExpr, ...MATCHING_HOUR_EXPRESSIONS], client, sendStickerFunction, tz);
        lastCronExpr = newExpr;
      }
    }, 10 * 1000); // poll every 10s

  // Also listen for immediate updates from the webserver
  try {
    bus.on('bot:scheduleUpdated', (expr) => {
      if (!expr) return;
      if (expr === lastCronExpr) return;
      if (!cron.validate(expr)) {
        console.error(`[SCHEDULER] Expressão CRON inválida recebida por evento: '${expr}'`);
        return;
      }
      console.log(`[SCHEDULER] Atualizando agendamento via evento para: '${expr}'`);
      stopScheduledTasks();
      scheduleCronExpressions([expr, ...MATCHING_HOUR_EXPRESSIONS], client, sendStickerFunction, tz);
      lastCronExpr = expr;
    });
  } catch (e) {
    console.warn('[SCHEDULER] eventBus not available:', e.message);
  }
}

module.exports = {
  pickRandomMedia,
  sendRandomMediaToGroup,
  scheduleAutoSend
};
