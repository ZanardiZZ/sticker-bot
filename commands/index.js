/**
 * Commands module index - exports all command functionality
 */

// Command handlers
const { handleRandomCommand } = require('./handlers/random');
const { handleCountCommand } = require('./handlers/count');
const { handleTop10Command } = require('./handlers/top10');
const { handleTop5UsersCommand } = require('./handlers/top5users');
const { handleTop5CommandsCommand } = require('./handlers/top5commands');
const { handleIdCommand } = require('./handlers/id');
const { handleForceCommand } = require('./handlers/force');
const { handleEditCommand } = require('./handlers/edit');
const { handleThemeCommand } = require('./handlers/theme');
const { handleVerifyCommand } = require('./handlers/verify');
const { handleCriarMemeCommand, handleExportarMemesCommand } = require('./handlers/meme');
const { handleDeleteCommand } = require('./handlers/delete');
const { handleIssueCommand } = require('./handlers/issue');
const { handleDownloadCommand } = require('./handlers/download');
const { handleDownloadMp3Command } = require('./handlers/downloadMp3');
const { handleBanCommand } = require('./handlers/ban');
const { handlePerfilCommand } = require('./handlers/perfil');
const { handleFotoHdCommand } = require('./handlers/fotohd');
const { handleAddPackCommand } = require('./handlers/addpack');
const { handlePackCommand } = require('./handlers/pack');
const { handlePingaCommand } = require('./handlers/pinga');
const { handleReactsCommand } = require('./handlers/reacts');

// Utilities
const validation = require('./validation');
const media = require('./media');

// Database functions
const { db, updateMediaDescription, updateMediaTags, incrementCommandUsage } = require('../database/index.js');
const { safeReply } = require('../utils/safeMessaging');
const { parseCommand } = require('../utils/commandNormalizer');
const { getAverageProcessingTime, getTotalMediaSize } = require('../database/models/mediaMetrics');
const packageJson = require('../package.json');
const os = require('os');

// Constants
const MAX_TAGS_LENGTH = 500;

// State maps
const taggingMap = new Map();
const forceMap = new Map();
const forceVideoToStickerMap = new Map();
const clearDescriptionCmds = [];

// Helpers
function querySingle(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

async function isGroupCommandAllowed(groupId, command, senderId) {
  if (!groupId || !groupId.endsWith('@g.us')) return true;

  // Admin bypass
  const adminNumber = process.env.ADMIN_NUMBER;
  if (adminNumber && senderId && senderId === adminNumber) {
    return true;
  }

  const key = String(command || '').trim().toLowerCase();
  if (!key) return true;

  try {
    const row = await querySingle(
      `SELECT allowed FROM group_command_permissions WHERE group_id = ? AND LOWER(command) = ? LIMIT 1`,
      [groupId, key]
    );
    if (!row) return true; // default allow if no rule
    return row.allowed !== 0;
  } catch (err) {
    console.warn('[GroupCommand] fallback allow on error:', err?.message || err);
    return true;
  }
}

/**
 * Main command handler that routes commands to appropriate handlers
 * @param {object} client - WhatsApp client
 * @param {object} message - Message object
 * @param {string} chatId - Chat ID
 * @returns {boolean} True if command was handled
 */
async function handleCommand(client, message, chatId, context = {}) {
  const rawCommand = message.body || message.caption || '';
  if (!rawCommand || !rawCommand.startsWith('#')) {
    return false;
  }

  const { command, params } = parseCommand(rawCommand);

  let handled = false;
  let shouldTrackUsage = false;

  // Enforce per-group command permissions
  const isGroup = context.isGroup || (chatId && chatId.endsWith('@g.us'));
  if (isGroup) {
    const senderId = context.resolvedSenderId || context.rawSenderId;
    const allowed = await isGroupCommandAllowed(chatId, command, senderId);
    if (!allowed) {
      await safeReply(client, chatId, '🚫 Este comando está bloqueado neste grupo.', message.id);
      return true; // command handled (blocked)
    }
  }

  try {
    switch (command) {
      case '#random':
        await handleRandomCommand(client, message, chatId);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#count':
        await handleCountCommand(client, message, chatId);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#top10':
        await handleTop10Command(client, message, chatId);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#top5users':
        await handleTop5UsersCommand(client, message, chatId);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#top5comandos':
        await handleTop5CommandsCommand(client, message, chatId);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#id':
        await handleIdCommand(client, message, chatId);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#forcar':
        await handleForceCommand(client, message, chatId, forceMap, forceVideoToStickerMap);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#editar':
        await handleEditCommand(client, message, chatId, taggingMap, MAX_TAGS_LENGTH);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#tema':
      case '#theme':
        await handleThemeCommand(client, message, chatId, params);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#verificar':
      case '#verify':
        await handleVerifyCommand(client, message, chatId);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#criar':
        await handleCriarMemeCommand(client, message, chatId, params, context);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#exportarmemes':
        await handleExportarMemesCommand(client, message, chatId);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#deletar':
        await handleDeleteCommand(client, message, chatId, params, context);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#issue':
        await handleIssueCommand(client, message, chatId, params, context);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#download':
      case '#baixar':
        await handleDownloadCommand(client, message, chatId, params, context);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#downloadmp3':
      case '#baixarmp3':
      case '#baixaraudio':
        await handleDownloadMp3Command(client, message, chatId, params, context);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#ban':
        await handleBanCommand(client, message, chatId, params, context);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#perfil':
        await handlePerfilCommand(client, message, chatId, context);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#fotohd':
        await handleFotoHdCommand(client, message, chatId, context);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#addpack':
        await handleAddPackCommand(client, message, chatId, params);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#pack':
        await handlePackCommand(client, message, chatId, params);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#pinga':
        await handlePingaCommand(client, message, chatId);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#reacts':
        await handleReactsCommand(client, message, params);
        handled = true;
        shouldTrackUsage = true;
        break;

      case '#ping': {
          // Build ping response
          const uptimeSeconds = Math.floor(process.uptime());
          function formatUptime(seconds) {
            const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
            const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
            const s = String(seconds % 60).padStart(2, '0');
            return `${h}:${m}:${s}`;
          }

          const uptime = formatUptime(uptimeSeconds);
          // Estima latência com base no timestamp da mensagem (fallback se indisponível)
          const nowMs = Date.now();
          const rawTs = Number(message.timestamp || message.messageTimestamp || message.messageTimestampLow || 0);
          const msgTsMs = rawTs > 0 ? (rawTs > 1e12 ? rawTs : rawTs * 1000) : null;
          const receiveLatency = msgTsMs ? Math.max(0, nowMs - msgTsMs) : null;

          // Mede latência de envio/ack com fallback para ambientes sem hrtime.bigint
          let sendLatency = null;
          try {
            const useHr = typeof process.hrtime === 'function' && typeof process.hrtime.bigint === 'function';
            const start = useHr ? process.hrtime.bigint() : Date.now();

            if (typeof client.sendText === 'function') {
              await client.sendText(chatId, '🏓 Medindo latência...');
            } else if (typeof client.sendMessage === 'function') {
              await client.sendMessage(chatId, { text: '🏓 Medindo latência...' });
            } else {
              await safeReply(client, chatId, '🏓 Medindo latência...', message);
            }

            const end = useHr ? process.hrtime.bigint() : Date.now();
            const elapsedMs = useHr ? Number(end - start) / 1e6 : end - start;
            sendLatency = Math.max(0, elapsedMs);
          } catch (sendErr) {
            console.warn('[Ping] Falha ao medir latência de envio:', sendErr?.message || sendErr);
          }

          // Roundtrip total = recebimento + envio/ack (quando ambos existem)
          const roundTrip = (receiveLatency !== null && sendLatency !== null)
            ? receiveLatency + sendLatency
            : (sendLatency !== null ? sendLatency : receiveLatency);

          const formatLatency = (value) => {
            if (value === null || value === undefined || Number.isNaN(value)) return 'indisponível';
            if (value < 1) return '<1 ms';
            return `${Math.round(value)} ms`;
          };

          const cronSchedule = process.env.BOT_CRON_SCHEDULE || '0 0-23 * * *';
          const botVersion = (packageJson && packageJson.version) ? packageJson.version : '1.0.0';

          // Fetch metrics
          let avgProcessing1h = null;
          let avgProcessing24h = null;
          let totalMediaSizeMB = null;

          try {
            avgProcessing1h = await getAverageProcessingTime(3600); // 1 hour
            avgProcessing24h = await getAverageProcessingTime(86400); // 24 hours
            const totalSizeBytes = await getTotalMediaSize();
            totalMediaSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);
          } catch (metricsErr) {
            console.warn('[Ping] Failed to fetch metrics:', metricsErr.message);
          }

          const formatProcessingTime = (ms) => {
            if (ms === null || ms === undefined) return 'sem dados';
            if (ms < 1000) return `${Math.round(ms)}ms`;
            return `${(ms / 1000).toFixed(2)}s`;
          };

          let response = `🤖 *Sticker Bot*\n` +
            `🟢 Uptime: ${uptime}\n` +
            `📡 Latência (recebimento): ${formatLatency(receiveLatency)}\n` +
            `📤 Envio→ack: ${formatLatency(sendLatency)}\n` +
            `🔁 Roundtrip: ${formatLatency(roundTrip)}\n` +
            `⏰ CRON: ${cronSchedule}\n` +
            `🛠️ Versão: ${botVersion}\n\n` +
            `📊 *Métricas de Performance*\n` +
            `⏱️ Proc. médio (1h): ${formatProcessingTime(avgProcessing1h)}\n` +
            `⏱️ Proc. médio (24h): ${formatProcessingTime(avgProcessing24h)}\n` +
            `💾 Tamanho total: ${totalMediaSizeMB !== null ? totalMediaSizeMB + ' MB' : 'calculando...'}`;

          await safeReply(client, chatId, response, message);
          handled = true;
          shouldTrackUsage = true;
          break;
        }

      default:
        // Check if it's an invalid command
        if (validation.isValidCommand(rawCommand) === false) {
          await validation.handleInvalidCommand(client, chatId);
          handled = true;
        }
        break;
    }
  } catch (error) {
    console.error('Error handling command:', error);
    await safeReply(client, chatId, 'Erro ao processar comando.', message.id);
    return true;
  }

  if (handled && shouldTrackUsage) {
    const usageUserId = context?.resolvedSenderId || message.from || null;

    if (usageUserId && typeof incrementCommandUsage === 'function') {
      try {
        await incrementCommandUsage(command, usageUserId);
      } catch (incrementError) {
        console.error('Error incrementing command usage:', incrementError);
      }
    }
  }

  return handled;
}

/**
 * Handles tagging mode input (editing media description and tags)
 * @param {object} client - WhatsApp client
 * @param {object} message - Message object
 * @param {string} chatId - Chat ID
 * @returns {boolean} True if tagging mode input was handled
 */
async function handleTaggingMode(client, message, chatId) {
  if (!message.body || !taggingMap.has(chatId)) {
    return false;
  }

  const mediaId = taggingMap.get(chatId);
  const input = message.body.trim();

  try {
    // Parse description and tags from input
    let description = '';
    let tags = '';

    if (input.includes(';')) {
      const parts = input.split(';').map(p => p.trim());
      for (const part of parts) {
        if (part.toLowerCase().startsWith('descricao:')) {
          description = part.substring('descricao:'.length).trim();
        } else if (part.toLowerCase().startsWith('tags:')) {
          tags = part.substring('tags:'.length).trim();
        }
      }
    } else if (input.toLowerCase().startsWith('descricao:')) {
      description = input.substring('descricao:'.length).trim();
    } else if (input.toLowerCase().startsWith('tags:')) {
      tags = input.substring('tags:'.length).trim();
    } else {
      // If no prefix, assume it's description
      description = input;
    }

    // Validate length
    const totalLength = description.length + tags.length;
    if (totalLength > MAX_TAGS_LENGTH) {
      await safeReply(client, chatId, `Conteúdo muito longo. Limite total: ${MAX_TAGS_LENGTH} caracteres.`, message.id);
      return true;
    }

    // Update media
    if (description) {
      await updateMediaDescription(mediaId, description);
    }
    
    if (tags) {
      const tagsArray = tags.split(',').map(t => t.trim()).filter(t => t);
      await updateMediaTags(mediaId, tagsArray);
    }

    taggingMap.delete(chatId);
    await safeReply(client, chatId, 'Mídia atualizada com sucesso!', message.id);
    return true;

  } catch (error) {
    console.error('Error in tagging mode:', error);
    await safeReply(client, chatId, 'Erro ao atualizar mídia.', message.id);
    taggingMap.delete(chatId);
    return true;
  }
}

module.exports = {
  // Main handlers
  handleCommand,
  handleTaggingMode,
  taggingMap,
  
  // Individual handlers
  handleRandomCommand,
  handleCountCommand,
  handleTop10Command,
  handleTop5UsersCommand,
  handleIdCommand,
  handleForceCommand,
  handleEditCommand,
  handleThemeCommand,
  handlePingaCommand,
  
  // Constants
  MAX_TAGS_LENGTH,
  forceMap,
  forceVideoToStickerMap,
  clearDescriptionCmds,
  
  // Utilities
  ...validation,
  ...media
};
