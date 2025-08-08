// services/randomScheduler.js
const { getConfig } = require('../configRuntime.js');
const { getShuffledSticker } = require('../database.js');

let running = false;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const minutes = (n) => n * 60 * 1000;

function randomDelayMs(min, max) {
  const rand = Math.floor(Math.random() * (max - min + 1)) + min;
  return minutes(rand);
}

function withinActiveHours(hour, start, end) {
  return start <= end
    ? hour >= start && hour < end
    : hour >= start || hour < end;
}

async function trySendRandomToGroups(client) {
  if (running) return;
  running = true;

  try {
    const cfg = getConfig();
    const now = new Date();
    if (!withinActiveHours(now.getHours(), cfg.ACTIVE_HOURS.start, cfg.ACTIVE_HOURS.end)) {
      return;
    }

    for (const groupId of cfg.SCHEDULED_GROUPS) {
      const sticker = getShuffledSticker();
      if (!sticker) {
        console.warn('⚠️ Nenhuma figurinha disponível.');
        continue;
      }

      await client.sendImageAsSticker(groupId, sticker.filePath);
      await client.sendText(
        groupId,
        `🆔 *ID:* ${sticker.id}\n📝 *Descrição:* ${sticker.description}\n🏷️ *Tag:* ${sticker.tag}`
      );
      await sleep(3000);
    }
  } catch (e) {
    console.error('❌ Erro no envio automático:', e);
  } finally {
    running = false;
  }
}

function startRandomScheduler(client) {
  (async function loop() {
    while (true) {
      const cfg = getConfig();
      if (!cfg.RANDOM_SEND_ENABLED) {
        await sleep(minutes(5));
        continue;
      }
      const delay = randomDelayMs(cfg.MIN_INTERVAL_MIN, cfg.MAX_INTERVAL_MIN);
      await sleep(delay);
      await trySendRandomToGroups(client);
    }
  })();
}

module.exports = { startRandomScheduler };
