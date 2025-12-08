require('dotenv').config();

// Initialize log collector to capture bot logs
const { getLogCollector } = require('./utils/logCollector');
const logCollector = getLogCollector(2000);

// ---- Modular bot components
const { initializeBot } = require('./bot/client');
const { scheduleAutoSend } = require('./bot/scheduler');
const { setupMessageHandler, handleMessage } = require('./bot/messageHandler');
const { sendStickerForMediaRecord } = require('./bot/stickers');
const { initContactsTable, upsertGroup, upsertGroupMembers } = require('./bot/contacts');
const { initializeHistoryRecovery, setupPeriodicHistorySync } = require('./bot/historyRecovery');

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
        const id = meta?.id;
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
      const id = chat?.id;
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

  // Torna o client acessível globalmente para o painel admin
  global.getCurrentWhatsAppClient = () => client;

  // Certifica que a tabela contacts existe
  initContactsTable();

  // Setup message handling
  setupMessageHandler(client, handleMessage);

  // Schedule automatic sending
  scheduleAutoSend(client, sendStickerForMediaRecord);

  // Sync all group names from WhatsApp client into the DB
  syncAllGroupNames(client).catch(() => {});

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
