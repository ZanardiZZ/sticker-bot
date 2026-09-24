/**
 * Message handling pipeline for the bot
 */

const fs = require('fs');
const path = require('path');
const { handleCommand, handleTaggingMode, taggingMap } = require('../commands');
const { normalizeText } = require('../utils/commandNormalizer');
const { logReceivedMessage } = require('./logging');
const { upsertContactFromMessage, upsertGroupFromMessage, upsertGroupUser } = require('./contacts');
const { processIncomingMedia } = require('./mediaProcessor');
const { withTyping } = require('../utils/typingIndicator');
const { safeReply } = require('../utils/safeMessaging');
const { downloadMediaForMessage } = require('../utils/mediaDownload');
const { isJidGroup, normalizeJid } = require('../utils/jidUtils');
const {
  getAllowedGroupJids,
  getAllowedDmJids,
  isJidAllowed,
} = require('../utils/whatsappRouting');
const { resolveSenderId, markMessageAsProcessed, isMessageProcessed } = require('../database');
const PersistentMediaQueue = require('../services/persistentMediaQueue');
const { getDmUser, upsertDmUser } = require('../web/dataAccess');
const { handleGroupChatMessage } = require('../services/conversationAgent');
const publicDmAccess = require('../services/publicDmStickerAccess');
const paymentService = require('../services/mercadoPagoPayment');
const { findById } = require('../database');
const { handleIdCommand } = require('../commands/handlers/id');
const memory = require('../client/memory-client');
// Rate-limited auto-reply tracker for DM request notifications
const dmAutoReplyMap = new Map();
const DM_AUTO_REPLY_TTL = Number(process.env.DM_AUTO_REPLY_TTL_SECONDS) || 60 * 60; // default 1 hour

function resolveSenderIdSafe(client, senderId) {
  if (typeof resolveSenderId === 'function') {
    return resolveSenderId(client, senderId);
  }
  return senderId || null;
}

async function isMessageProcessedSafe(messageId) {
  if (typeof isMessageProcessed === 'function') {
    return isMessageProcessed(messageId);
  }
  return false;
}

async function markMessageAsProcessedSafe(messageId, chatId) {
  if (typeof markMessageAsProcessed === 'function') {
    return markMessageAsProcessed(messageId, chatId);
  }
}

function upsertGroupUserSafe(groupId, memberId, role, ts) {
  if (typeof upsertGroupUser === 'function') {
    return upsertGroupUser(groupId, memberId, role, ts);
  }
}

function publicDmNoticeKey(userId) {
  return `public:${userId}`;
}

async function handlePublicDmMessage(client, message, chatId, resolvedSenderId, rawBody, messageId) {
  const userId = publicDmAccess.normalizeIdentity(resolvedSenderId || chatId);
  const access = await publicDmAccess.evaluateAccess(userId);

  if (access.blocked) return true;

  if (!access.eligible) {
    const now = Math.floor(Date.now() / 1000);
    try {
      await upsertDmUser({
        user_id: userId,
        allowed: access.settings.enabled ? 0 : 0,
        blocked: 0,
        note: 'public-dm-request',
        last_activity: now
      });
    } catch (error) {
      console.warn('[PUBLIC_DM] falha ao registrar solicitante:', error?.message || error);
    }
    const key = publicDmNoticeKey(userId);
    if (message.type === 'chat' && /^#id\s+[1-9][0-9]*$/i.test(rawBody) && paymentService.isConfigured()) {
      try {
        const paymentLink = await paymentService.createAccessLink(userId);
        if (paymentLink) {
          await safeReply(client, chatId, `Este acesso requer uma contribuição. Abra o checkout seguro para liberar o uso por ${paymentService.getConfig().planDays} dias:\n${paymentLink}`, message.id);
          return true;
        }
      } catch (error) {
        console.warn('[PUBLIC_DM] falha ao criar link de pagamento:', error?.message || error);
      }
    }
    if (now - (dmAutoReplyMap.get(key) || 0) >= DM_AUTO_REPLY_TTL) {
      dmAutoReplyMap.set(key, now);
      await safeReply(
        client,
        chatId,
        'Este acesso ainda não está liberado para este número. Solicitações públicas aceitas: #ID número.',
        message.id
      );
    }
    return true;
  }

  // A DM pública nunca entra no roteador geral: somente #ID seguido de inteiro positivo.
  if (message.type !== 'chat' || !/^#id\s+[1-9][0-9]*$/i.test(rawBody)) {
    const key = publicDmNoticeKey(userId);
    const now = Math.floor(Date.now() / 1000);
    if (now - (dmAutoReplyMap.get(key) || 0) >= DM_AUTO_REPLY_TTL) {
      dmAutoReplyMap.set(key, now);
      await safeReply(client, chatId, 'Use somente #ID número para solicitar uma figurinha.', message.id);
    }
    return true;
  }

  const mediaId = Number(rawBody.match(/^#id\s+([1-9][0-9]*)$/i)[1]);
  const media = await findById(mediaId);
  if (!media) {
    await safeReply(client, chatId, 'Mídia não encontrada para o ID fornecido.', message.id);
    return true;
  }

  const reservation = await publicDmAccess.reserveDelivery({
    userId,
    mediaId,
    messageId,
    now: Math.floor(Date.now() / 1000)
  });
  if (!reservation.ok) {
    const messages = {
      cooldown: `Aguarde ${reservation.retryAfter}s antes de solicitar outra figurinha.`,
      daily_limit: `Limite diário atingido (${reservation.access.dailyLimit} figurinhas).`,
      duplicate: 'Esta solicitação já foi processada.',
      not_allowed: 'Este acesso ainda não está liberado para este número.',
      blocked: 'Este acesso está bloqueado.'
    };
    if (reservation.reason !== 'duplicate') {
      await safeReply(client, chatId, messages[reservation.reason] || 'Não foi possível processar a solicitação agora.', message.id);
    }
    return true;
  }

  try {
    const result = await handleIdCommand(client, message, chatId);
    const status = result?.status === 'sent' ? 'sent' : (result?.status === 'failed' ? 'failed' : 'uncertain');
    await publicDmAccess.finalizeDelivery({ reservationId: reservation.reservationId, status });
  } catch (error) {
    console.error('[PUBLIC_DM] falha na entrega:', error?.message || error);
    await publicDmAccess.finalizeDelivery({
      reservationId: reservation.reservationId,
      status: 'uncertain',
      errorCode: 'delivery_exception'
    });
  }
  return true;
}

async function syncMemoryForGroupMessage({ userId, groupId, senderName, groupName, text }) {
  if (!memory.isReady() || !groupId || !userId || !text) {
    return null;
  }
  // Do not create a memory event for punctuation/emoji-only noise.
  if (!/[A-Za-zÀ-ÿ0-9]/.test(String(text))) {
    return null;
  }

  try {
    await memory.ensureUser(userId, { name: senderName || 'Integrante' });
    await memory.ensureGroup(groupId, { name: groupName || 'Grupo WhatsApp' });
    const learnedFacts = await memory.learnFromMessage(userId, text, groupId);
    return {
      learnedFacts: Array.isArray(learnedFacts) ? learnedFacts : []
    };
  } catch (error) {
    console.warn('[MessageHandler] Falha ao sincronizar memória:', error?.message || error);
    return null;
  }
}

// Create a shared media processing queue with higher retry attempts for media processing
const mediaProcessingQueue = new PersistentMediaQueue({
  // A single worker is intentional: E4B/Gemma inference is not safely concurrent on the RTX 3070.
  concurrency: 1,
  // Do not create a retry storm while the AI endpoint is unavailable.
  retryAttempts: 2,
  retryDelay: 5000,
  maxWaiting: Number(process.env.STICKER_MEDIA_MAX_WAITING || 12),
  // Admission is bounded to avoid an unbounded backlog and OpenWebUI-like timeouts.
  dbPath: process.env.MEDIA_QUEUE_DB_PATH
});

async function spoolMediaForQueue(client, message) {
  const { buffer, mimetype } = await downloadMediaForMessage(client, message);
  if (!buffer || !Buffer.isBuffer(buffer)) throw new Error('media_download_empty');
  const spoolDir = path.join(process.cwd(), 'storage', 'temp', 'media-queue');
  await fs.promises.mkdir(spoolDir, { recursive: true });
  const safeId = String(message.id || message.messageId || message.key?.id || Date.now()).replace(/[^A-Za-z0-9_.-]/g, '_');
  const spoolPath = path.join(spoolDir, `${Date.now()}-${safeId}.bin`);
  await fs.promises.writeFile(spoolPath, buffer, { flag: 'wx' });
  return { spoolPath, mimetype: mimetype || message.mimetype || 'application/octet-stream' };
}

function startMediaQueue(client) {
  mediaProcessingQueue.setExecutor(async (payload) => {
    const queuedMessage = { ...payload.message, __mediaSpoolPath: payload.message.mediaSpoolPath };
    try {
      const processingResult = await processIncomingMedia(client, queuedMessage, payload.resolvedSenderId);
      if (processingResult?.success === false) return;
      if (payload.messageId && payload.chatId) await markMessageAsProcessedSafe(payload.messageId, payload.chatId);
    } finally {
      if (payload.message.mediaSpoolPath) {
        try { await fs.promises.unlink(payload.message.mediaSpoolPath); } catch (cleanupErr) {
          if (cleanupErr?.code !== 'ENOENT') console.warn('[MediaHandler] Falha ao remover spool:', cleanupErr.message);
        }
      }
    }
  });
}

// Add queue monitoring
mediaProcessingQueue.on('jobAdded', async (jobId) => {
  const stats = await mediaProcessingQueue.getStats();
  console.log(`[MediaHandler] Durable media job ${jobId} queued (${stats.waiting} waiting, ${stats.processing} processing)`);
});

mediaProcessingQueue.on('jobRetry', (jobId, attempt, error) => {
  console.log(`[MediaHandler] Media job ${jobId} retry ${attempt}: ${error.message}`);
});

mediaProcessingQueue.on('jobCompleted', async (jobId) => {
  const stats = await mediaProcessingQueue.getStats();
  console.log(`[MediaHandler] Durable media job ${jobId} completed (${stats.waiting} waiting, ${stats.processing} processing)`);
});

mediaProcessingQueue.on('queueFull', (maxSize, currentSize) => {
  console.warn(`[MediaHandler] ⚠️ Queue is FULL! Max: ${maxSize}, Current: ${currentSize}. Rejecting new media.`);
});

mediaProcessingQueue.on('queueWarning', (currentSize, maxSize, usage) => {
  console.warn(`[MediaHandler] ⚠️ Queue usage is high: ${currentSize}/${maxSize} (${(usage * 100).toFixed(1)}%)`);
});

/**
 * Main message handler that processes all incoming messages
 * @param {Object} client - WhatsApp client instance
 * @param {Object} message - Incoming message object
 */
async function handleMessage(client, message) {
  // Não bloquear o fluxo de resposta esperando log (evita latência se o cliente estiver lento)
  logReceivedMessage(client, message).catch(err => console.warn('[MessageHandler] Log failed:', err));

  const rawBody = ((message.type === 'chat' ? message.body : message.caption) || '').trim();
  // Hard safety: never process bot-authored messages as new inputs.
  // This prevents prompt-injection loops where the model emits command-like text
  // (e.g. starting with #criar) and the bot re-consumes its own output.
  if (message.fromMe) return;

  // Extract message ID for duplicate detection
  const messageId = message.id || message.key?.id;
  const chatId = message.from;

  const isPingCommand = typeof rawBody === 'string' && rawBody.toLowerCase().startsWith('#ping');
  const isVerifyCommand = typeof rawBody === 'string'
    && (rawBody.toLowerCase().startsWith('#verificar') || rawBody.toLowerCase().startsWith('#verify'));
  const shouldMarkProcessed = messageId && chatId && !isPingCommand;
  const allowedGroupJids = getAllowedGroupJids();
  const allowedDmJids = getAllowedDmJids();

  // Check if message was already processed (for history recovery)
  if (shouldMarkProcessed) {
    try {
      const alreadyProcessed = await isMessageProcessedSafe(messageId);
      if (alreadyProcessed) return;
    } catch (err) {
      console.error('[MessageHandler] Error checking if message was processed:', err);
      // Continue processing even if check fails
    }
  }

  // Update contact information
  try { 
    upsertContactFromMessage(message);
    upsertGroupFromMessage(message);
  } catch (e) {
    console.error('[bot] upsert contact/group error:', e);
  }
  
  try {
    
    // Determine sender ID using new LID system
    let senderId;
    const messageKey = message.key || {};
    const remoteJid = messageKey.remoteJid || message.from;
    
    if (isJidGroup(remoteJid)) {
      // In groups, use participant or participantAlt
      senderId = messageKey.participant || messageKey.participantAlt || message.sender?.id || message.author;
    } else {
      // In DMs, use remoteJid or remoteJidAlt
      senderId = messageKey.remoteJid || messageKey.remoteJidAlt || message.sender?.id || message.author || message.from;
    }
    
    // Resolve the preferred sender ID (LID if available, PN otherwise). Para ping, evita resolução remota para não adicionar latência.
    const resolvedSenderId = isPingCommand
      ? normalizeJid(senderId || remoteJid)
      : await resolveSenderIdSafe(client?.sock || client, senderId);
    
    // Routing policy:
    // - Only allowed groups may reach the group conversation handler.
    // - Direct messages are ignored unless explicitly allowlisted.
  const isGroup = !!message.isGroupMsg || !!message.isGroup || isJidGroup(remoteJid);

    if (isGroup) {
      if (!isJidAllowed(remoteJid, allowedGroupJids)) {
        console.log(`[MessageHandler] Grupo ignorado por allowlist: ${remoteJid}`);
        return false;
      }
    } else {
      const explicitlyAllowedDm = isJidAllowed(remoteJid, allowedDmJids) || isJidAllowed(resolvedSenderId, allowedDmJids);
      if (!explicitlyAllowedDm && publicDmAccess.getPublicDmSettings().enabled) {
        return handlePublicDmMessage(client, message, chatId, resolvedSenderId, rawBody, messageId);
      }
      if (!explicitlyAllowedDm) {
        console.log(`[MessageHandler] DM ignorada por allowlist: ${remoteJid}`);
        return false;
      }

      try {
        const dmUserRow = await getDmUser(resolvedSenderId);
        const allowed = dmUserRow && dmUserRow.allowed;
        const blocked = dmUserRow && dmUserRow.blocked;

        // Hard block for direct messages: never reply when blocked.
        if (blocked) {
          return;
        }

        // Permit #verificar / #verify even se não autorizado, desde que não esteja bloqueado
        if (isVerifyCommand && !blocked) {
          await upsertDmUser({ user_id: resolvedSenderId, allowed: 0, blocked: 0, note: 'verification-request', last_activity: Math.floor(Date.now() / 1000) });
        } else
        if (!allowed) {
          // Record the request (ensure admin sees the user in admin panel)
          const now = Math.floor(Date.now() / 1000);
          try {
            await upsertDmUser({ user_id: resolvedSenderId, allowed: 0, blocked: blocked ? 1 : 0, note: dmUserRow && dmUserRow.note ? dmUserRow.note : 'requested', last_activity: now });
          } catch (e) {
            console.error('[DM AUTH] falha ao registrar pedido DM:', e?.message || e);
          }

          // Rate-limit auto-reply so we don't spam the user
          const lastAuto = dmAutoReplyMap.get(resolvedSenderId) || 0;
          const nowTs = Math.floor(Date.now() / 1000);
          if (nowTs - lastAuto < DM_AUTO_REPLY_TTL) {
            return; // recently informed
          }

          dmAutoReplyMap.set(resolvedSenderId, nowTs);

          // Send a friendly, localized notice and return without further processing
          try {
            await withTyping(client, chatId, async () => {
              await safeReply(client, chatId,
                'Olá — este bot responde apenas mediante autorização. Seu pedido foi registrado; por favor, aguarde a aprovação de um administrador. Obrigado!',
                message.id
              );
            });
          } catch (err) {
            console.error('[DM AUTH] falha ao enviar mensagem de aguardando autorização:', err?.message || err);
          }

          console.log('[DM REQUEST] usuário solicitou acesso via DM:', resolvedSenderId);
          return;
        }
        // If allowed, update last activity stamp
        await upsertDmUser({ user_id: resolvedSenderId, allowed: 1, blocked: 0, last_activity: Math.floor(Date.now() / 1000) });
      } catch (err) {
        console.error('[DM AUTH] erro ao checar permissoes de DM:', err);
        // Fail safe: do not reply if permission check fails
        return;
      }
    }

    // Track group membership/activity
    if (isGroup && remoteJid) {
      try {
        const ts = Number.isFinite(message?.timestamp) ? Number(message.timestamp) : Math.floor(Date.now() / 1000);
        const memberId =
          resolvedSenderId
          || senderId
          || messageKey.participant
          || messageKey.participantAlt
          || message.sender?.id;
        upsertGroupUserSafe(remoteJid, memberId, 'user', ts);
      } catch (e) {
        console.warn('[group_users] failed to upsert member from message:', e?.message || e);
      }
    }
    
    // 1) Try to handle command via commands module (includes validation)
    const commandHandled = await handleCommand(client, message, chatId, {
      resolvedSenderId,
      groupId: remoteJid,
      isGroup,
      rawSenderId: senderId
    });

    if (commandHandled) {
      // Mark message as processed (fire-and-forget to avoid blocking)
      if (shouldMarkProcessed) {
        markMessageAsProcessedSafe(messageId, chatId).catch(err =>
          console.error('[MessageHandler] Error marking message as processed:', err));
      }
      return;
    }

    // 2) Modo edição de tags (if activated for this chat)
    if (message.type === 'chat' && message.body && taggingMap.has(chatId)) {
      const handled = await handleTaggingMode(client, message, chatId);
      if (handled) {
        if (shouldMarkProcessed) {
          markMessageAsProcessedSafe(messageId, chatId).catch(err =>
            console.error('[MessageHandler] Error marking message as processed:', err));
        }
        return;
      }
    }

    // 3) Conversas em grupo: tenta gerar resposta natural via IA
    if (isGroup && !message.isMedia && message.type === 'chat' && message.body) {
      const senderName = message.pushName || message.notifyName || message.sender?.name;
      const groupName = message.chat?.name || message.groupMetadata?.subject;
      // Memory enrichment is best-effort and must never hold the reply path hostage.
      syncMemoryForGroupMessage({
        userId: resolvedSenderId,
        groupId: remoteJid,
        senderName,
        groupName,
        text: message.body
      }).then((memorySync) => {
        if (memorySync?.learnedFacts?.length) {
          console.log(`[MessageHandler] Memory learned ${memorySync.learnedFacts.length} facts for ${resolvedSenderId}`);
        }
      }).catch((error) => {
        console.warn('[MessageHandler] Background memory sync failed:', error?.message || error);
      });

      const conversationHandled = await handleGroupChatMessage(client, message, {
        chatId,
        senderId: resolvedSenderId,
        senderName,
        groupName
      });
      if (conversationHandled) {
        if (shouldMarkProcessed) {
          markMessageAsProcessedSafe(messageId, chatId).catch(err =>
            console.error('[MessageHandler] Error marking message as processed:', err));
        }
        return;
      }
    }

    // 4) Sem comando -> só processa se for mídia
    if (!message.isMedia) return;

    // Rejeita documentos e qualquer formato não audiovisual antes de entrar na fila
    const msgType = message.type || '';
    const msgMime = (message.mimetype || '').toLowerCase();
    const isAudioVisual = msgType === 'image' || msgType === 'video' || msgType === 'audio'
      || msgType === 'ptt' || msgType === 'sticker'
      || msgMime.startsWith('image/') || msgMime.startsWith('video/') || msgMime.startsWith('audio/');

    if (!isAudioVisual) {
      await safeReply(
        client,
        chatId,
        '❌ Formato não suportado. Envie imagens, vídeos, GIFs ou áudios.',
        message.id
      );
      return;
    }

    // Queue media processing to avoid resource contention
    try {
      let spool;
      try {
        spool = await spoolMediaForQueue(client, message);
        message.mimetype = message.mimetype || spool.mimetype;
      } catch (spoolError) {
        console.error('[MediaHandler] Failed to spool media before queue:', spoolError?.message || spoolError);
        await safeReply(client, chatId, '⚠️ Não foi possível baixar esta mídia para a fila. Por favor, envie-a novamente.', message.id);
        return;
      }
      const isGifMedia = message.isWhatsAppGif === true
        || message.isGif === true
        || msgMime === 'image/gif';
      const queuePayload = {
        message: {
          id: message.id,
          messageId: message.messageId,
          key: message.key ? { id: message.key.id, remoteJid: message.key.remoteJid } : undefined,
          from: message.from,
          type: message.type,
          mimetype: message.mimetype,
          isMedia: message.isMedia,
          isSticker: message.isSticker,
          isWhatsAppGif: message.isWhatsAppGif === true,
          suppressGifNotice: isGifMedia,
          caption: message.caption,
          body: message.body,
          mediaKey: message.mediaKey,
          directPath: message.directPath,
          mediaSpoolPath: spool.spoolPath
        },
        resolvedSenderId,
        messageId,
        chatId
      };
      startMediaQueue(client);
      const processingPromise = mediaProcessingQueue.add(queuePayload);

      // Acknowledge admission immediately. The user must not interpret the AI
      // wait as a WhatsApp/download failure. With concurrency=1, this is the
      // approximate FIFO position (the current job counts as position 1).
      const queuedStats = await mediaProcessingQueue.getStats();
      const queuePosition = Math.max(1, queuedStats.waiting + queuedStats.processing);
      try {
        await safeReply(
          client,
          chatId,
          isGifMedia
            ? 'Recebi um GIF. Vou transformar em figurinha animada, aguarde só um instante...'
            : queuePosition === 1
              ? '✅ Mídia recebida. Iniciando processamento da IA.'
              : `✅ Mídia recebida. Aguarde: posição aproximada ${queuePosition} na fila da IA.`,
          message.id
        );
      } catch (ackError) {
        console.warn('[MediaHandler] Failed to send queue acknowledgement:', ackError?.message || ackError);
      }

      // Keep the handler promise tied to the job so existing processed-message
      // semantics remain unchanged, but do it only after the acknowledgement.
      await processingPromise;
    } catch (queueError) {
      // Handle queue overflow gracefully
      if (queueError.code === 'QUEUE_FULL') {
        console.warn(`[MediaHandler] Queue full, notifying user: ${message.from}`);
        try {
          await withTyping(client, message.from, async () => {
            await safeReply(
              client, 
              message.from, 
              '⚠️ O sistema está processando muitas figurinhas no momento. Por favor, aguarde alguns instantes e tente novamente.', 
              message.id
            );
          });
        } catch (notifyError) {
          console.error('[MediaHandler] Failed to notify user about queue overflow:', notifyError);
        }
      } else {
        // Re-throw other queue errors
        throw queueError;
      }
    }
    
  } catch (e) {
    console.error('Erro ao processar mensagem:', e);
    if (e?.response?.data) console.error('Detalhes resposta:', e.response.data);
    try { 
      await withTyping(client, message.from, async () => {
        await safeReply(client, message.from, 'Erro ao processar sua mensagem.', message.id);
      });
    } catch {}
  }
}

/**
 * Sets up message handling for the client
 * @param {Object} client - WhatsApp client instance
 */
function setupMessageHandler(client, handleMessage) {
  if (typeof client.onAnyMessage === "function") {
    client.onAnyMessage(message => handleMessage(client, message));
    console.log("✅ Registrado handler via onAnyMessage");
  } else if (typeof client.onMessage === "function") {
    client.onMessage(message => handleMessage(client, message));
    console.log("✅ Registrado handler via onMessage");
  } else {
    console.error('❌ Nenhum método de listener de mensagem encontrado no client!');
    throw new Error("Client does not support message listeners");
  }
}

module.exports = {
  handleMessage,
  setupMessageHandler,
  startMediaQueue
};
