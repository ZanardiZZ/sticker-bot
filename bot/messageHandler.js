/**
 * Message handling pipeline for the bot
 */

const { handleCommand, handleTaggingMode, taggingMap } = require('../commands');
const { normalizeText } = require('../utils/commandNormalizer');
const { logReceivedMessage } = require('./logging');
const { upsertContactFromMessage, upsertGroupFromMessage } = require('./contacts');
const { processIncomingMedia } = require('./mediaProcessor');
const { withTyping } = require('../utils/typingIndicator');
const { safeReply } = require('../utils/safeMessaging');
const { isJidGroup, normalizeJid } = require('../utils/jidUtils');
const { resolveSenderId } = require('../database');
const MediaQueue = require('../services/mediaQueue');
const { getDmUser, upsertDmUser } = require('../web/dataAccess');
// Rate-limited auto-reply tracker for DM request notifications
const dmAutoReplyMap = new Map();
const DM_AUTO_REPLY_TTL = Number(process.env.DM_AUTO_REPLY_TTL_SECONDS) || 60 * 60; // default 1 hour

// Create a shared media processing queue with higher retry attempts for media processing
const mediaProcessingQueue = new MediaQueue({ 
  concurrency: 2, // Lower concurrency to reduce resource contention
  retryAttempts: 4, // More retries for media processing failures
  retryDelay: 2000 // Longer delay between retries for resource-intensive operations
});

// Add queue monitoring
mediaProcessingQueue.on('jobAdded', (jobId) => {
  const stats = mediaProcessingQueue.getStats();
  console.log(`[MediaHandler] Media job ${jobId} queued (${stats.waiting} waiting, ${stats.processing} processing)`);
});

mediaProcessingQueue.on('jobRetry', (jobId, attempt, error) => {
  console.log(`[MediaHandler] Media job ${jobId} retry ${attempt}: ${error.message}`);
});

mediaProcessingQueue.on('jobCompleted', (jobId) => {
  const stats = mediaProcessingQueue.getStats();
  console.log(`[MediaHandler] Media job ${jobId} completed (${stats.waiting} waiting, ${stats.processing} processing)`);
});

/**
 * Main message handler that processes all incoming messages
 * @param {Object} client - WhatsApp client instance
 * @param {Object} message - Incoming message object
 */
async function handleMessage(client, message) {
  await logReceivedMessage(client, message);
  
  // Ignore messages sent by the bot itself to avoid re-processing forwarded media
  if (message.fromMe) return;

  // Update contact information
  try { 
    upsertContactFromMessage(message);
    upsertGroupFromMessage(message);
  } catch (e) {
    console.error('[bot] upsert contact/group error:', e);
  }
  
  try {
    const chatId = message.from;
    
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
    
    // Resolve the preferred sender ID (LID if available, PN otherwise)
    const resolvedSenderId = await resolveSenderId(client?.sock || client, senderId);
    
    // Enforce DM authorization: if message is not from a group, only respond if
    // the sender is allowed (or is admin number configured via ENV).
    const isGroup = !!message.isGroupMsg || !!message.isGroup || isJidGroup(remoteJid);
    const adminNumber = process.env.ADMIN_NUMBER;

    if (!isGroup) {
      try {
        // Allow admin number always
        if (adminNumber && (resolvedSenderId === adminNumber || senderId === adminNumber)) {
          // update last activity
          await upsertDmUser({ user_id: resolvedSenderId, allowed: 1, blocked: 0, last_activity: Math.floor(Date.now() / 1000) });
        } else {
          const dmUserRow = await getDmUser(resolvedSenderId);
          const allowed = dmUserRow && dmUserRow.allowed;
          const blocked = dmUserRow && dmUserRow.blocked;
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
        }
      } catch (err) {
        console.error('[DM AUTH] erro ao checar permissoes de DM:', err);
        // Fail safe: do not reply if permission check fails
        return;
      }
    }
    
    // 1) Try to handle command via commands module (includes validation)
    const commandHandled = await handleCommand(client, message, chatId, {
      resolvedSenderId,
      groupId: remoteJid,
      isGroup,
      rawSenderId: senderId
    });
    if (commandHandled) return;

    // 2) Modo edição de tags (if activated for this chat)
    if (message.type === 'chat' && message.body && taggingMap.has(chatId)) {
      const handled = await handleTaggingMode(client, message, chatId);
      if (handled) return;
    }

    // 3) Sem comando -> só processa se for mídia
    if (!message.isMedia) return;
    
    // Queue media processing to avoid resource contention
    await mediaProcessingQueue.add(async () => {
      return await processIncomingMedia(client, message);
    });
    
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
  setupMessageHandler
};
