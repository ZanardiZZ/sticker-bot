const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

// Initialize log collector to capture bot logs
const { getLogCollector } = require('../utils/logCollector');
const logCollector = getLogCollector(2000);

// ---- Modular bot components
const { initializeBot } = require('./client');
const { scheduleAutoSend } = require('./scheduler');
const { setupMessageHandler, handleMessage } = require('./messageHandler');
const { sendStickerForMediaRecord } = require('./stickers');
const { initContactsTable, upsertGroup, upsertGroupMembers } = require('./contacts');
const { initializeHistoryRecovery, setupPeriodicHistorySync } = require('./historyRecovery');
const { getMediaIdFromMessage, upsertReaction } = require('../database');
const { checkAndNotifyVersionUpdate, initialize: initVersionNotifier } = require('../services/versionNotifier');
const { AdminWatcher } = require('../services/adminWatcher');
const memory = require('../client/memory-client');

/**
 * Handles incoming reaction events
 * @param {Object} reaction - Reaction data from server
 */
async function handleReaction(reaction) {
  const { messageId, chatId, reactorJid, emoji } = reaction;

  if (!messageId || !reactorJid) {
    console.warn('[Reaction] Missing required fields:', { messageId, reactorJid });
    return;
  }

  try {
    // Find the media associated with this message
    const mediaId = await getMediaIdFromMessage(messageId);

    if (!mediaId) {
      // Message is not linked to any media, ignore reaction
      return;
    }

    // Store or remove the reaction
    const result = await upsertReaction(mediaId, messageId, reactorJid, emoji);

    if (result.action === 'added') {
      console.log(`[Reaction] Added ${emoji} from ${reactorJid} to media ${mediaId}`);
    } else if (result.action === 'removed') {
      console.log(`[Reaction] Removed reaction from ${reactorJid} on media ${mediaId}`);
    } else if (result.action === 'updated') {
      console.log(`[Reaction] Updated to ${emoji} from ${reactorJid} on media ${mediaId}`);
    }
  } catch (err) {
    console.error('[Reaction] Error handling reaction:', err.message);
  }
}

async function syncAllGroupNames(client) {
  if (!client) {
    console.log('[GroupSync] Cliente indisponível, pulando sincronização de nomes de grupos');
    return;
  }

  // Aguarda o WS estar pronto para evitar ws_not_ready
  if (typeof client.waitUntilReady === 'function') {
    try {
      await client.waitUntilReady(8000);
    } catch (e) {
      console.warn('[GroupSync] Cliente não ficou pronto a tempo, pulando sincronização inicial:', e?.message || e);
      return;
    }
  }

  // Primeiro tenta via metadata completa (traz participantes)
  if (typeof client.getAllGroupsMetadata === 'function') {
    try {
      const metas = await client.getAllGroupsMetadata();
      let synced = 0;
      for (const meta of Array.isArray(metas) ? metas : []) {
        const rawId = meta?.id;
        const id = typeof rawId === 'string' ? rawId : (rawId?._serialized || rawId?.id || '');
        if (!id || !id.endsWith('@g.us')) continue;
        const name = meta?.subject || meta?.name || '';
        upsertGroup(id, name, meta?.conversationTimestamp || meta?.lastInteraction);
        if (Array.isArray(meta?.participants) && meta.participants.length) {
          upsertGroupMembers(id, meta.participants);
        }
        synced += 1;
      }
      console.log(`[GroupSync] Grupos sincronizados via metadata: ${synced}`);
      return;
    } catch (err) {
      console.warn('[GroupSync] Falha ao sincronizar via metadata; tentando fallback getAllChats:', err?.message || err);
    }
  }

  // Fallback para getAllChats se metadata não estiver disponível
  if (typeof client.getAllChats !== 'function') {
    console.log('[GroupSync] getAllChats indisponível, pulando sincronização de nomes de grupos');
    return;
  }

  try {
    const chats = await client.getAllChats();
    let synced = 0;

    for (const chat of Array.isArray(chats) ? chats : []) {
      const rawId = chat?.id;
      const id = typeof rawId === 'string' ? rawId : (rawId?._serialized || rawId?.id || '');
      if (!id || !id.endsWith('@g.us')) continue;

      const name = chat.subject || chat.name || chat.formattedTitle || '';
      const tsCandidate = Number(chat.conversationTimestamp || chat.t || chat.timestamp || 0);
      const lastInteractionTs = Number.isFinite(tsCandidate) ? tsCandidate : undefined;

      upsertGroup(id, name, lastInteractionTs);
      synced += 1;
    }

    console.log(`[GroupSync] Nomes de grupos sincronizados: ${synced}`);
  } catch (err) {
    console.warn('[GroupSync] Falha ao sincronizar nomes de grupos:', err?.message || err);
  }
}

/**
 * Main bot start function
 * @param {Object} client - WhatsApp client instance
 */
async function start(client) {
  console.log('🤖 Bot iniciado e aguardando mensagens...');
  memory.init();
  const memoryHealth = await memory.healthcheck();
  if (memoryHealth?.disabled) {
    console.log('[Bot] Memory client desabilitado');
  } else if (memoryHealth?.ok) {
    console.log(`[Bot] Memory client OK em ${memory.baseUrl}`);
  } else {
    console.warn(`[Bot] Memory client indisponível em ${memory.baseUrl}`);
  }

  // Torna o client acessível globalmente para o painel admin
  global.getCurrentWhatsAppClient = () => client;

  // Certifica que a tabela contacts existe
  initContactsTable();

  // Setup message handling
  setupMessageHandler(client, handleMessage);

  // Initialize Admin Watcher (self-healing system)
  console.log('[Bot] Checking AdminWatcher...', {
    enabled: process.env.ADMIN_WATCHER_ENABLED,
    hasOpenAI: !!process.env.OPENAI_API_KEY
  });

  if (process.env.ADMIN_WATCHER_ENABLED === 'true') {
    try {
      console.log('[Bot] Creating AdminWatcher instance...');
      const adminWatcher = new AdminWatcher(client);
      console.log('[Bot] Starting AdminWatcher...');
      await adminWatcher.start();
      console.log('✅ Admin Watcher iniciado (self-healing habilitado)');
    } catch (watcherErr) {
      console.error('[Bot] Erro ao inicializar Admin Watcher:', watcherErr);
      console.error('[Bot] Stack:', watcherErr.stack);
    }
  } else {
    console.log('[Bot] AdminWatcher disabled');
  }

  // Setup reaction handling for tracking reactions to stickers
  if (typeof client.onReaction === 'function') {
    client.onReaction(handleReaction);
    console.log('✅ Registrado handler de reações');
  } else {
    console.log('⚠️ Cliente não suporta eventos de reação');
  }

  // Schedule automatic sending
  scheduleAutoSend(client, sendStickerForMediaRecord);

  // Sync all group names from WhatsApp client into the DB
  syncAllGroupNames(client).catch(() => {});

  // Initialize version notifier and check for updates
  try {
    await initVersionNotifier();
    // Wait a bit for connection to stabilize before sending notification
    setTimeout(async () => {
      try {
        await checkAndNotifyVersionUpdate(client);
      } catch (notifyErr) {
        console.warn('[Bot] Falha ao enviar notificação de versão:', notifyErr.message);
      }
    }, 5000);
  } catch (versionErr) {
    console.warn('[Bot] Erro ao inicializar notificador de versão:', versionErr.message);
  }

  // Initialize message history recovery (runs in background)
  try {
    console.log('[Bot] Initializing message history recovery...');
    await initializeHistoryRecovery(client, handleMessage);
    
    // Setup periodic sync if enabled (default: disabled, can be enabled via HISTORY_PERIODIC_SYNC=true)
    if (process.env.HISTORY_PERIODIC_SYNC === 'true') {
      const syncIntervalHours = parseInt(process.env.HISTORY_SYNC_INTERVAL_HOURS) || 24;
      setupPeriodicHistorySync(client, handleMessage, syncIntervalHours);
    }
  } catch (error) {
    console.error('[Bot] Error initializing history recovery:', error.message);
    console.error('[Bot] Bot will continue without history recovery');
  }
}

// ---- Inicialização
initializeBot(start);
