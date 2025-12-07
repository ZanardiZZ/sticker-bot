// Baileys centralized WebSocket server
// - Maintains a single WhatsApp session (persisted under auth_info_baileys)
// - Accepts multiple WS clients that register with a token and allowed chats
// - Forwards only authorized messages to each client
// - Accepts send commands from clients and enforces chat authorization

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const mime = require('mime-types');
const qrcode = require('qrcode-terminal')
const pino = require('pino');
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadContentFromMessage
} = require('@whiskeysockets/baileys');
const { normalizeJid } = require('./utils/jidUtils');

// agora importa o store do caminho certo
//const { makeInMemoryStore } = require('@whiskeysockets/baileys/lib/store');

// FFmpeg setup for conversions
let ffmpeg = null;
let ffmpegPath = null;
try {
  ffmpeg = require('fluent-ffmpeg');
  ffmpegPath = require('ffmpeg-static');
  if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
} catch (e) {
  console.warn('[WS] FFmpeg not available for animated conversions:', e.message);
}

// Basic config
const PORT = Number(process.env.BAILEYS_WS_PORT || 8765);
const AUTH_DIR = path.resolve(process.env.BAILEYS_AUTH_DIR || 'auth_info_baileys');

// Allowed tokens (optional). If provided, registration must use one of these tokens.
// Example: BAILEYS_ALLOWED_TOKENS="tokenA,tokenB"
const ALLOWED_TOKENS = (process.env.BAILEYS_ALLOWED_TOKENS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// In-memory registry of connected clients
// token -> Set<{ ws, allowedChats: Set<string> }>
const clientsByToken = new Map();

function isAnimatedWebpBuffer(buf) {
  try {
    if (!buf || buf.length < 21) return false;
    const riff = buf.slice(0, 4).toString('ascii') === 'RIFF';
    const webp = buf.slice(8, 12).toString('ascii') === 'WEBP';
    const vp8x = buf.slice(12, 16).toString('ascii') === 'VP8X';
    const animBit = (buf[20] & 0x10) === 0x10;
    return riff && webp && vp8x && animBit;
  } catch {
    return false;
  }
}

function createSimpleStore() {
  return {
    contacts: new Map(),
    chats: new Map(),
    groupMetadata: new Map()
  };
}

function upsertStoreEntry(collection, id, data) {
  if (!collection || !id || !data) return;
  if (typeof collection.set === 'function' && typeof collection.get === 'function') {
    const prev = collection.get(id) || {};
    collection.set(id, { ...prev, ...data });
    return;
  }
  const prev = Object.prototype.hasOwnProperty.call(collection, id) ? collection[id] : {};
  collection[id] = { ...prev, ...data };
}

function rememberStoreContact(store, contact) {
  if (!store) return;
  const { id } = contact || {};
  if (!id) return;
  upsertStoreEntry(store.contacts, id, contact);
}

function rememberStoreChat(store, chat) {
  if (!store) return;
  const { id } = chat || {};
  if (!id) return;
  upsertStoreEntry(store.chats, id, chat);
}

function rememberStoreGroup(store, metadata) {
  if (!store) return;
  const { id } = metadata || {};
  if (!id) return;
  upsertStoreEntry(store.groupMetadata, id, metadata);
}

function isTokenAllowed(token) {
  if (!token) return false;
  if (ALLOWED_TOKENS.length === 0) return true; // open policy if none configured
  return ALLOWED_TOKENS.includes(token);
}

function getFromStore(collection, key) {
  if (!collection || !key) return null;
  const altKey = typeof key === 'string' && key.endsWith('@s.whatsapp.net')
    ? key.replace('@s.whatsapp.net', '@c.us')
    : null;
  if (typeof collection.get === 'function') {
    return collection.get(key) || (altKey ? collection.get(altKey) : null) || null;
  }
  if (Object.prototype.hasOwnProperty.call(collection, key)) return collection[key];
  if (altKey && Object.prototype.hasOwnProperty.call(collection, altKey)) return collection[altKey];
  return null;
}

function getContactFromStore(store, jid) {
  if (!jid) return null;
  return getFromStore(store?.contacts, jid);
}

function buildContactPayloadFromStore(store, jid, opts = {}) {
  const { pushNameFallback } = opts;
  if (!jid) {
    return {
      id: '',
      pushname: '',
      formattedName: '',
      notifyName: '',
      name: '',
      shortName: '',
      verifiedName: '',
      isBusiness: false,
      isEnterprise: false,
      profilePicUrl: '',
      number: ''
    };
  }

  const contact = getContactFromStore(store, jid) || null;
  const pushname = (
    contact?.pushName
    || contact?.name
    || contact?.verifiedName
    || contact?.notify
    || pushNameFallback
    || ''
  );

  return {
    id: jid,
    pushname,
    formattedName: contact?.name || contact?.verifiedName || pushname || '',
    notifyName: contact?.notify || '',
    name: contact?.name || pushname || '',
    shortName: contact?.shortName || '',
    verifiedName: contact?.verifiedName || '',
    isBusiness: !!contact?.isBusiness,
    isEnterprise: !!contact?.isEnterprise,
    profilePicUrl: contact?.profilePictureUrl || contact?.profilePicUrl || '',
    number: jid.split('@')[0] || ''
  };
}

function getChatFromStore(store, jid) {
  if (!jid) return null;
  return getFromStore(store?.chats, jid) || getFromStore(store?.groupMetadata, jid);
}

const MEDIA_MESSAGE_TYPES = new Set([
  'imageMessage',
  'videoMessage',
  'stickerMessage',
  'audioMessage',
  'documentMessage'
]);

const TEXTUAL_MESSAGE_TYPES = new Set([
  'conversation',
  'extendedTextMessage',
  'buttonsMessage',
  'buttonsResponseMessage',
  'listMessage',
  'listResponseMessage',
  'interactiveMessage',
  'interactiveResponseMessage',
  'templateButtonReplyMessage',
  'templateMessage',
  'contactMessage'
]);

const IGNORED_MESSAGE_TYPES = new Set([
  'senderKeyDistributionMessage',
  'messageContextInfo',
  'protocolMessage',
  'historySyncNotification',
  'deviceSentMessage'
]);

const DEFAULT_MIMETYPES = {
  imageMessage: 'image/jpeg',
  videoMessage: 'video/mp4',
  stickerMessage: 'image/webp',
  audioMessage: 'audio/ogg',
  documentMessage: 'application/octet-stream'
};

function unwrapBaileysMessageContent(message) {
  if (!message) return { type: null, content: null };
  if (message.ephemeralMessage?.message) return unwrapBaileysMessageContent(message.ephemeralMessage.message);
  if (message.deviceSentMessage?.message) return unwrapBaileysMessageContent(message.deviceSentMessage.message);
  if (message.documentWithCaptionMessage?.message) return unwrapBaileysMessageContent(message.documentWithCaptionMessage.message);
  if (message.viewOnceMessage?.message) return unwrapBaileysMessageContent(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2?.message) return unwrapBaileysMessageContent(message.viewOnceMessageV2.message);
  if (message.viewOnceMessageV2Extension?.message) return unwrapBaileysMessageContent(message.viewOnceMessageV2Extension.message);

  const entries = Object.entries(message).filter(([, value]) => value);
  if (!entries.length) return { type: null, content: null };

  // Prefer textual message types first (preserves conversation/extended text semantics)
  for (const [key, value] of entries) {
    if (!value) continue;
    if (TEXTUAL_MESSAGE_TYPES.has(key) || key === 'conversation') {
      return { type: key, content: value };
    }
  }

  // Then look for known media payloads
  for (const [key, value] of entries) {
    if (!value) continue;
    if (MEDIA_MESSAGE_TYPES.has(key)) {
      return { type: key, content: value };
    }
  }

  // Skip known non-content wrappers like senderKeyDistribution
  for (const [key, value] of entries) {
    if (!value) continue;
    if (IGNORED_MESSAGE_TYPES.has(key)) {
      continue;
    }
    if (key.endsWith('Message')) {
      return { type: key, content: value };
    }
  }

  const [fallbackType, fallbackContent] = entries.find(([key]) => !IGNORED_MESSAGE_TYPES.has(key)) || entries[0];
  return { type: fallbackType || null, content: fallbackContent || null };
}

function extractMediaFromWebMessageInfo(webMessageInfo) {
  if (!webMessageInfo?.message) return { type: null, content: null };
  const { type, content } = unwrapBaileysMessageContent(webMessageInfo.message);
  if (MEDIA_MESSAGE_TYPES.has(type)) {
    return { type, content };
  }

  // Fallback: scan top-level for media keys (covers senderKeyDistribution + media payload)
  for (const mediaType of MEDIA_MESSAGE_TYPES) {
    const direct = webMessageInfo.message[mediaType];
    if (direct) {
      return { type: mediaType, content: direct };
    }
  }

  return { type: null, content: null };
}

function normalizeOpenWAMessage(msg, opts = {}) {
  const { store, userId, rememberMessage, rememberQuoted } = opts;

  // Convert Baileys message to an OpenWA-like shape used by current code
  const m = msg?.messages?.[0];
  if (!m) return null;

  const remoteJid = m.key?.remoteJid || '';
  const chatId = remoteJid;
  const id = m.key?.id;
  const fromMe = !!m.key?.fromMe;

  const isGroupMsg = String(remoteJid).endsWith('@g.us');

  const unwrap = unwrapBaileysMessageContent(m.message || {});
  const content = unwrap.content || {};
  const messageType = unwrap.type || '';
  const contextInfo = content.contextInfo
    || m.message?.extendedTextMessage?.contextInfo
    || m.message?.imageMessage?.contextInfo
    || m.message?.videoMessage?.contextInfo
    || m.message?.documentMessage?.contextInfo
    || m.message?.audioMessage?.contextInfo
    || null;

  const extractBody = () => {
    const directText = typeof content === 'string' ? content : null;
    return (
      directText
      || content?.text
      || content?.caption
      || m.message?.conversation
      || m.message?.extendedTextMessage?.text
      || m.message?.imageMessage?.caption
      || m.message?.videoMessage?.caption
      || ''
    );
  };

  const body = extractBody();

  let isMedia = false;
  let mimetype = '';
  let type = 'chat';
  if (MEDIA_MESSAGE_TYPES.has(messageType)) {
    isMedia = true;
    mimetype = content?.mimetype || DEFAULT_MIMETYPES[messageType] || 'application/octet-stream';
    if (messageType === 'imageMessage') type = 'image';
    else if (messageType === 'videoMessage') type = 'video';
    else if (messageType === 'stickerMessage') type = 'sticker';
    else if (messageType === 'audioMessage') type = 'audio';
    else if (messageType === 'documentMessage') type = 'document';
  }

  const senderId = fromMe
    ? (userId || remoteJid)
    : (m.key?.participant || m.participant || remoteJid);
  const sender = buildContactPayloadFromStore(store, senderId, { pushNameFallback: m.pushName });

  if (senderId) {
    rememberStoreContact(store, {
      id: senderId,
      pushName: sender.pushname || m.pushName || '',
      name: sender.name || sender.pushname || '',
      verifiedName: sender.verifiedName || '',
      notify: sender.notifyName || '',
      profilePictureUrl: sender.profilePicUrl || ''
    });
  }

  const chatMeta = getChatFromStore(store, chatId);
  const chat = {
    id: chatId,
    name: chatMeta?.name || chatMeta?.subject || chatMeta?.formattedTitle || '',
    formattedTitle: chatMeta?.formattedTitle || chatMeta?.subject || chatMeta?.name || ''
  };

  if (chatId) {
    rememberStoreChat(store, {
      id: chatId,
      name: chat.name,
      subject: chat.formattedTitle || chat.name || '',
      formattedTitle: chat.formattedTitle,
      conversationTimestamp: Number(m.messageTimestamp) || Date.now() / 1000
    });
    if (isGroupMsg) {
      rememberStoreGroup(store, {
        id: chatId,
        subject: chat.formattedTitle || chat.name || '',
        name: chat.name || ''
      });
    }
  }

  let quotedMsg = null;
  let quotedMsgId = null;
  if (contextInfo?.quotedMessage) {
    const qUnwrap = unwrapBaileysMessageContent(contextInfo.quotedMessage);
    const qContent = qUnwrap.content || {};
    const qTypeRaw = qUnwrap.type || '';

    let qType = 'chat';
    let qBody = (
      qContent?.text
      || qContent?.caption
      || contextInfo.quotedMessage?.conversation
      || ''
    );
    let qIsMedia = false;
    let qMimetype = '';

    if (qTypeRaw === 'imageMessage') {
      qType = 'image'; qIsMedia = true; qMimetype = qContent?.mimetype || DEFAULT_MIMETYPES.imageMessage;
      if (!qBody) qBody = qContent?.caption || '';
    } else if (qTypeRaw === 'videoMessage') {
      qType = 'video'; qIsMedia = true; qMimetype = qContent?.mimetype || DEFAULT_MIMETYPES.videoMessage;
      if (!qBody) qBody = qContent?.caption || '';
    } else if (qTypeRaw === 'stickerMessage') {
      qType = 'sticker'; qIsMedia = true; qMimetype = qContent?.mimetype || DEFAULT_MIMETYPES.stickerMessage;
    } else if (qTypeRaw === 'audioMessage') {
      qType = 'audio'; qIsMedia = true; qMimetype = qContent?.mimetype || DEFAULT_MIMETYPES.audioMessage;
    } else if (qTypeRaw === 'documentMessage') {
      qType = 'document'; qIsMedia = true; qMimetype = qContent?.mimetype || DEFAULT_MIMETYPES.documentMessage;
    }

    const qId = contextInfo.stanzaId || contextInfo.stanzaID || contextInfo.messageId || null;
    const qParticipant = contextInfo.participant || contextInfo.remoteJid || contextInfo.quotedParticipant || null;
    const qSenderId = qParticipant || chatId;
    quotedMsgId = qId;
    const qSender = buildContactPayloadFromStore(store, qSenderId);
    if (qSenderId) {
      rememberStoreContact(store, {
        id: qSenderId,
        pushName: qSender.pushname || '',
        name: qSender.name || qSender.pushname || '',
        notify: qSender.notifyName || ''
      });
    }
    quotedMsg = {
      id: qId || '',
      chatId,
      from: qSenderId,
      messageId: qId || '',
      body: qBody || '',
      type: qType,
      isMedia: qIsMedia,
      mimetype: qMimetype,
      sender: qSender,
      author: qSenderId || '',
      isGroupMsg: isGroupMsg,
      _fromQuote: true
    };

    if (quotedMsg && typeof rememberQuoted === 'function') {
      const rawMessage = {
        key: {
          id: qId,
          remoteJid: chatId,
          fromMe: qSenderId ? qSenderId === userId : false,
          participant: qSenderId || undefined
        },
        message: contextInfo.quotedMessage
      };
      rememberQuoted(quotedMsg, rawMessage);
    }
  }

  const mentionedSet = new Set();
  const addMentionCandidate = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(addMentionCandidate);
      return;
    }
    if (typeof value === 'object' && value !== null) {
      if (typeof value.jid === 'string') {
        addMentionCandidate(value.jid);
        return;
      }
      if (typeof value.id === 'string') {
        addMentionCandidate(value.id);
        return;
      }
    }
    const normalized = normalizeJid(value);
    if (normalized) {
      mentionedSet.add(normalized);
    }
  };

  addMentionCandidate(content?.mentions);
  addMentionCandidate(content?.contextInfo?.mentionedJid);
  addMentionCandidate(contextInfo?.mentionedJid);
  addMentionCandidate(contextInfo?.participants);
  addMentionCandidate(contextInfo?.participant);
  addMentionCandidate(m.message?.extendedTextMessage?.contextInfo?.mentionedJid);
  addMentionCandidate(m.message?.imageMessage?.contextInfo?.mentionedJid);
  addMentionCandidate(m.message?.videoMessage?.contextInfo?.mentionedJid);
  addMentionCandidate(m.message?.documentMessage?.contextInfo?.mentionedJid);

  const mentionedJids = Array.from(mentionedSet);

  const normalized = {
    from: remoteJid,
    chatId,
    id,
    messageId: id,
    body: body || '',
    type,
    isMedia,
    mimetype,
    isGroupMsg,
    sender,
    chat,
    author: m.key?.participant || sender.id || '',
    hasQuotedMsg: !!quotedMsg,
    quotedMsgId: quotedMsgId || null,
    quotedMsg: quotedMsg || null,
    timestamp: Number(m.messageTimestamp) || Date.now() / 1000,
    fromMe,
    contextInfo: contextInfo || null,
    mentionedJid: mentionedJids,
    mentions: mentionedJids,
    mentionedIds: mentionedJids,
    // raw for advanced usage
    _raw: m
  };

  if (typeof rememberMessage === 'function') {
    rememberMessage(normalized, m);
  }

  return normalized;
}

async function start() {
  // Ensure auth dir exists
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  // HTTP server + WS for clients
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Baileys WebSocket Server running\n');
  });

  const wss = new WebSocketServer({ server });

  const closeWss = () => new Promise((resolve) => {
    try {
      for (const ws of wss.clients) {
        try { ws.close(1012, 'server_restart'); } catch {}
      }
      wss.close(() => resolve());
    } catch {
      resolve();
    }
  });

  const closeServer = () => new Promise((resolve) => {
    try {
      if (!server.listening) return resolve();
      server.close(() => resolve());
    } catch {
      resolve();
    }
  });

  // cache limited number of recent media messages for download on demand
  const MAX_CACHE = 500;
  const MEDIA_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
  const mediaCache = new Map(); // messageId -> { m, chatId, timestamp }
  const MAX_MESSAGE_CACHE = 1000;
  const MESSAGE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
  const messageCache = new Map(); // messageId -> { normalized, raw, timestamp }
  const msgRetryCounterCache = new Map();
  msgRetryCounterCache.del = (key) => msgRetryCounterCache.delete(key);
  const IDENTICAL_MESSAGE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  const IDENTICAL_MESSAGE_THRESHOLD = 3;
  const identicalMessageTracker = new Map(); // key -> [timestamps]

  function pruneCache(map, ttl) {
    const now = Date.now();
    for (const [key, value] of map) {
      const ts = value?.timestamp;
      if (typeof ts === 'number' && now - ts > ttl) {
        map.delete(key);
      }
    }
  }

  function rememberMedia(m) {
    try {
      const id = m?.key?.id;
      const chatId = m?.key?.remoteJid;
      if (!id || !chatId) return;
      pruneCache(mediaCache, MEDIA_CACHE_TTL_MS);
      if (mediaCache.size >= MAX_CACHE) {
        const firstKey = mediaCache.keys().next().value;
        if (firstKey) mediaCache.delete(firstKey);
      }
      mediaCache.set(id, { m, chatId, timestamp: Date.now() });
    } catch {}
  }

  function rememberMessage(normalized, raw) {
    try {
      const messageId = normalized?.id || normalized?.messageId || raw?.key?.id;
      if (!messageId) return;
      pruneCache(messageCache, MESSAGE_CACHE_TTL_MS);
      if (messageCache.size >= MAX_MESSAGE_CACHE) {
        const firstKey = messageCache.keys().next().value;
        if (firstKey) messageCache.delete(firstKey);
      }
      messageCache.set(messageId, {
        normalized: normalized ? { ...normalized } : null,
        raw,
        timestamp: Date.now()
      });
    } catch {}
  }

  function shouldRateLimitIdenticalMessage(payload) {
    try {
      if (!payload?.chatId) return false;
      const normalizedBody = String(payload.body || '').trim().toLowerCase();
      if (!normalizedBody) return false;

      const key = `${payload.chatId}::${normalizedBody}`;
      const now = Date.now();
      const existing = identicalMessageTracker.get(key) || [];
      const recent = existing.filter((ts) => now - ts < IDENTICAL_MESSAGE_WINDOW_MS);

      if (recent.length >= IDENTICAL_MESSAGE_THRESHOLD) {
        identicalMessageTracker.set(key, recent); // prune old timestamps
        return true;
      }

      recent.push(now);
      identicalMessageTracker.set(key, recent);
      return false;
    } catch {
      return false;
    }
  }

  function rememberQuoted(normalized, raw) {
    rememberMessage(normalized, raw);
    try {
      const mediaInfo = extractMediaFromWebMessageInfo(raw);
      if (mediaInfo.type) {
        rememberMedia(raw);
      }
    } catch {}
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  const store = createSimpleStore();

  const RETRY_SUPPRESSION_MSG = 'will not send message again, as sent too many times';
  const TIMEOUT_MSG = 'timed out waiting for message';

  const retryInspectorLogger = pino({
    level: process.env.BAILEYS_RETRY_LOG_LEVEL || process.env.BAILEYS_LOG_LEVEL || 'info',
    base: { class: 'baileys-retry' }
  });

  const queryInspectorLogger = pino({
    level: process.env.BAILEYS_QUERY_LOG_LEVEL || process.env.BAILEYS_LOG_LEVEL || 'info',
    base: { class: 'baileys-query' }
  });

  const pendingQueries = new Map(); // msgId -> { timestamp, summary }

  const extractTextPreviewFromContent = (type, content) => {
    if (!type || !content) return '';
    if (typeof content === 'string') return content;
    return (
      content.text
      || content.caption
      || content.conversation
      || content.body
      || content.contentText
      || ''
    );
  };

  const buildRetryPreview = (rawMessageContent) => {
    try {
      const { type, content } = unwrapBaileysMessageContent(rawMessageContent);
      const preview = extractTextPreviewFromContent(type, content);
      return {
        messageType: type || null,
        bodyPreview: preview ? String(preview).slice(0, 160) : ''
      };
    } catch {
      return { messageType: null, bodyPreview: '' };
    }
  };

  const describeJid = (jid) => {
    if (!jid) return null;
    const chat = getChatFromStore(store, jid);
    if (chat?.subject || chat?.name || chat?.formattedTitle) {
      return chat.subject || chat.name || chat.formattedTitle;
    }
    const contact = buildContactPayloadFromStore(store, jid);
    return contact?.pushname || contact?.name || contact?.number || null;
  };

  const buildRetryContext = (logPayload = {}) => {
    if (!logPayload || typeof logPayload !== 'object') return null;
    const attrs = logPayload.attrs || {};
    const key = logPayload.key || {};
    const messageId = attrs.id || key.id || '';
    const participant = key.participant || attrs.participant || '';
    const chatId = key.remoteJid || attrs.from || '';
    const cacheEntry = messageId ? messageCache.get(messageId) : null;
    const rawMessageContent = cacheEntry?.raw?.message || cacheEntry?.raw?.msg || cacheEntry?.raw || null;
    const { messageType, bodyPreview } = rawMessageContent
      ? buildRetryPreview(rawMessageContent)
      : { messageType: null, bodyPreview: '' };
    const normalizedBody = typeof cacheEntry?.normalized?.body === 'string'
      ? cacheEntry.normalized.body
      : '';
    const retryKey = messageId && participant ? `${messageId}:${participant}` : messageId;
    const retryCount = typeof msgRetryCounterCache.get === 'function'
      ? (msgRetryCounterCache.get(retryKey) || msgRetryCounterCache.get(messageId) || 0)
      : 0;

    return {
      chatId: chatId || undefined,
      chatName: describeJid(chatId) || undefined,
      participant: participant || undefined,
      participantName: describeJid(participant) || undefined,
      messageId: messageId || undefined,
      messageType: messageType || cacheEntry?.normalized?.messageType || undefined,
      bodyPreview: (normalizedBody || bodyPreview || '').slice(0, 160) || undefined,
      retryCount,
      hasCachedMessage: !!cacheEntry
    };
  };

  const summarizeNodeForLog = (node) => {
    if (!node) return null;
    const childTags = Array.isArray(node.content)
      ? node.content.map((c) => c?.tag).filter(Boolean)
      : undefined;
    const attrs = node.attrs || {};
    const safeAttrs = {};
    for (const key of Object.keys(attrs)) {
      if (['id', 'to', 'from', 'jid', 'participant', 'type', 'count', 'code', 'xmlns', 'device'].includes(key)) {
        safeAttrs[key] = attrs[key];
      }
    }
    return {
      tag: node.tag || undefined,
      attrs: Object.keys(safeAttrs).length ? safeAttrs : undefined,
      childTags: childTags && childTags.length ? childTags : undefined
    };
  };

  const baileysLogger = pino({
    level: process.env.BAILEYS_LOG_LEVEL || 'info',
    hooks: {
      logMethod(args, method) {
        try {
          const logMessage = args?.[args.length - 1];
          if (typeof logMessage === 'string' && logMessage.includes(RETRY_SUPPRESSION_MSG)) {
            const context = buildRetryContext(args[0]);
            if (context) {
              retryInspectorLogger.warn(context, 'baileys retry suppressed');
            }
          }
          if (typeof logMessage === 'string' && logMessage.includes(TIMEOUT_MSG)) {
            const msgId = args?.[0]?.msgId;
            const pending = msgId ? pendingQueries.get(msgId) : null;
            const elapsedMs = pending?.timestamp ? Date.now() - pending.timestamp : undefined;
            queryInspectorLogger.warn({
              msgId,
              elapsedMs,
              query: pending?.summary,
              pendingCount: pendingQueries.size
            }, 'baileys query timed out');
          }
        } catch (err) {
          console.error('[Baileys] Failed to enrich retry log:', err);
        }
        method.apply(this, args);
      }
    }
  }).child({ class: 'baileys' });

  const sock = makeWASocket({
    version,
    auth: state,
    syncFullHistory: false,
    browser: ['StickerBot', 'Chrome', '1.0'],
    logger: baileysLogger,
    msgRetryCounterCache,
    getMessage: async (key) => {
      if (!key?.id) return null;
      const cached = messageCache.get(key.id);
      return cached?.raw || null;
    }
  });

  // Wrap query to track pending requests and aid timeout diagnostics
  const originalQuery = sock.query;
  if (typeof originalQuery === 'function') {
    sock.query = async (node, timeoutMs) => {
      let trackedId = node?.attrs?.id;
      const summary = summarizeNodeForLog(node);
      let result;
      try {
        result = originalQuery(node, timeoutMs);
        // node.attrs.id is set synchronously inside originalQuery if missing
        trackedId = trackedId || node?.attrs?.id;
        if (trackedId) {
          pendingQueries.set(trackedId, { timestamp: Date.now(), summary });
        }
        return await result;
      } finally {
        if (trackedId) {
          pendingQueries.delete(trackedId);
        }
      }
    };
  }

  const toArray = (value) => (Array.isArray(value) ? value : []);

  const mergeContacts = (contacts) => {
    try {
      for (const contact of toArray(contacts)) {
        const id = contact?.id || contact?.jid;
        if (!id) continue;
        rememberStoreContact(store, { ...contact, id });
      }
    } catch (err) {
      console.warn('[Baileys] Failed to merge contacts into cache:', err);
    }
  };

  const mergeChats = (chats) => {
    try {
      for (const chat of toArray(chats)) {
        const id = chat?.id || chat?.jid || chat?.remoteJid;
        if (!id) continue;
        rememberStoreChat(store, { ...chat, id });
        if (chat?.subject || chat?.name || chat?.formattedTitle) {
          rememberStoreGroup(store, {
            id,
            subject: chat.subject || chat.formattedTitle || chat.name || '',
            name: chat.name || '',
            formattedTitle: chat.formattedTitle || ''
          });
        }
      }
    } catch (err) {
      console.warn('[Baileys] Failed to merge chats into cache:', err);
    }
  };

  const mergeGroups = (groups) => {
    try {
      for (const group of toArray(groups)) {
        const id = group?.id || group?.jid;
        if (!id) continue;
        rememberStoreGroup(store, { ...group, id });
      }
    } catch (err) {
      console.warn('[Baileys] Failed to merge groups into cache:', err);
    }
  };

  sock.ev.on('contacts.upsert', mergeContacts);
  sock.ev.on('contacts.update', mergeContacts);
  sock.ev.on('chats.upsert', mergeChats);
  sock.ev.on('chats.update', mergeChats);
  sock.ev.on('groups.upsert', mergeGroups);
  sock.ev.on('groups.update', mergeGroups);

  // LID mapping event listener
  sock.ev.on('lid-mapping.update', (mapping) => {
    console.log('[LID] Novo mapeamento LID ↔ PN recebido:', Object.keys(mapping).length, 'mapeamentos');
    // Store mappings in database if needed
    // The actual storage will be handled by the client applications
  });

  sock.ev.on('creds.update', saveCreds);

  let restartScheduled = false;
  const scheduleRestart = ({ clearAuth = false, delayMs = 3000 } = {}) => {
    if (restartScheduled) return;
    restartScheduled = true;

    const performRestart = async () => {
      try { sock.ev.removeAllListeners('connection.update'); } catch {}
      try { sock.ws?.close(1001, 'server_restart'); } catch {}
      try { await sock.logout?.(); } catch {}
      try { await sock.end?.(); } catch {}

      try {
        for (const [, entrySet] of clientsByToken) {
          for (const entry of entrySet || []) {
            try { entry.ws?.close(1012, 'server_restart'); } catch {}
          }
        }
      } catch {}
      clientsByToken.clear();

      await Promise.all([
        closeWss(),
        closeServer()
      ]);

      if (clearAuth) {
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); }
        catch (err) {
          console.error('[Baileys] Failed to clear auth directory:', err);
        }
      }

      setTimeout(() => {
        restartScheduled = false;
        start().catch(console.error);
      }, delayMs);
    };

    performRestart().catch((err) => {
      console.error('[Baileys] Failed during restart:', err);
      restartScheduled = false;
      setTimeout(() => start().catch(console.error), delayMs);
    });
  };

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('[Baileys] QR updated. Scan to authenticate.');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      console.log('[Baileys] Connection opened');
    } else if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
        ?? lastDisconnect?.error?.statusCode
        ?? lastDisconnect?.error?.payload?.statusCode;
      const reason = statusCode ?? lastDisconnect?.error?.message;
      console.warn('[Baileys] Connection closed. Reason:', reason);

      const numericReason = typeof reason === 'number' ? reason : Number(reason);
      const isLoggedOut = numericReason === DisconnectReason.loggedOut
        || statusCode === DisconnectReason.loggedOut;

      if (isLoggedOut) {
        console.warn('[Baileys] Session logged out. Clearing auth state and restarting for a new QR.');
        scheduleRestart({ clearAuth: true, delayMs: 1000 });
      } else {
        scheduleRestart({ clearAuth: false, delayMs: 3000 });
      }
    }
  });

  function send(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch {}
  }

  const rememberOutgoing = (rawMessage) => {
    try {
      if (!rawMessage) return;
      rememberMessage(null, rawMessage);
      const mediaInfo = extractMediaFromWebMessageInfo(rawMessage);
      if (mediaInfo.type) rememberMedia(rawMessage);
    } catch {}
  };

  function buildContactPayload(jid) {
    return buildContactPayloadFromStore(store, jid);
  }

  function broadcastAuthorized(messagePayload) {
    if (!messagePayload) return;
    const chatId = messagePayload.chatId;

    if (shouldRateLimitIdenticalMessage(messagePayload)) {
      console.warn(`[WS Server] Dropping repeated message in chat ${chatId}`);
      return;
    }

    for (const [, entrySet] of clientsByToken) {
      if (!entrySet || entrySet.size === 0) continue;
      for (const entry of entrySet) {
        if (!entry?.ws) continue;
        if (entry.allowedChats.has('*') || entry.allowedChats.has(chatId)) {
          send(entry.ws, { type: 'message', data: messagePayload });
        }
      }
    }
  }

  async function buildMediaBuffer(m) {
    const { type: mediaType, content } = extractMediaFromWebMessageInfo(m);
    if (!mediaType || !content) throw new Error('no_media');
    let kind = 'image';
    if (mediaType === 'videoMessage') kind = 'video';
    else if (mediaType === 'stickerMessage') kind = 'sticker';
    else if (mediaType === 'audioMessage') kind = 'audio';
    else if (mediaType === 'documentMessage') kind = 'document';
    
    // Retry logic with exponential backoff for transient failures
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const stream = await downloadContentFromMessage(content, kind);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        
        if (attempt > 0) {
          console.log(`[buildMediaBuffer] Successfully downloaded media after ${attempt} retries`);
        }
        
        return buffer;
      } catch (err) {
        lastError = err;
        
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          console.warn(`[buildMediaBuffer] Download attempt ${attempt + 1} failed: ${err.message}. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`[buildMediaBuffer] All ${maxRetries + 1} download attempts failed for ${kind} media: ${err.message}`);
        }
      }
    }
    
    // All retries exhausted, throw the last error
    throw lastError;
  }

  async function convertToAnimatedWebp(inputPath) {
    if (!ffmpeg || !ffmpegPath) throw new Error('ffmpeg_unavailable');
    if (!fs.existsSync(inputPath)) throw new Error('input_not_found');
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
    const outPath = path.resolve(path.dirname(inputPath), `tmp_${unique}.webp`);
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-vcodec', 'libwebp',
          '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15',
          '-loop', '0',
          '-preset', 'default',
          '-an',
          '-vsync', '0',
          '-lossless', '1',
          '-qscale', '80',
          '-compression_level', '6',
          '-pix_fmt', 'yuva420p'
        ])
        .toFormat('webp')
        .save(outPath)
        .on('end', resolve)
        .on('error', reject);
    });
    const buf = fs.readFileSync(outPath);
    try { fs.unlinkSync(outPath); } catch {}
    return buf;
  }

  wss.on('connection', (ws) => {
    let registeredToken = null;
    let clientEntry = null;

    ws.on('message', async (data) => {
      let msg;
        try { msg = JSON.parse(data.toString()); } catch { return; }
        const incomingRequestId = msg && msg.requestId;
        const { type } = msg || {};

      if (type === 'register') {
        const { token, chats } = msg || {};
        if (!token || !isTokenAllowed(token)) {
          send(ws, { type: 'error', error: 'unauthorized' });
          ws.close();
          return;
        }
        registeredToken = token;
        const allowedChats = new Set(Array.isArray(chats) && chats.length ? chats : []);
        if (allowedChats.size === 0) allowedChats.add('*'); // default open if none provided
        clientEntry = { ws, allowedChats };
        if (!clientsByToken.has(token)) {
          clientsByToken.set(token, new Set());
        }
        clientsByToken.get(token).add(clientEntry);
        send(ws, { type: 'registered', ok: true });
        return;
      }

      if (!registeredToken || !clientEntry || !clientsByToken.has(registeredToken) || !clientsByToken.get(registeredToken).has(clientEntry)) {
        send(ws, { type: 'error', error: 'not_registered' });
        return;
      }

      if (type === 'subscribe') {
        const { chats } = msg || {};
        if (Array.isArray(chats)) {
          clientEntry.allowedChats = new Set(chats.length ? chats : ['*']);
          send(ws, { type: 'subscribed', ok: true });
        }
        return;
      }

      // Enforce authorization helper
      const canSendTo = (chatId) => clientEntry.allowedChats.has('*') || clientEntry.allowedChats.has(chatId);

      if (type === 'listChats') {
        const normalizeChat = (chat = {}) => {
          const id = chat.id || chat.jid || chat.remoteJid;
          if (!id) return null;
          const subject = chat.subject || chat.name || chat.formattedTitle || chat.title || '';
          const tsCandidate = Number(chat.conversationTimestamp || chat.t || chat.timestamp || chat.lastConversationTimestamp || 0);
          const conversationTimestamp = Number.isFinite(tsCandidate) ? tsCandidate : null;
          return {
            id,
            subject,
            name: chat.name || subject || '',
            isGroup: id.endsWith('@g.us'),
            conversationTimestamp
          };
        };

        const chatMap = new Map();
        const addChat = (chat) => {
          const normalized = normalizeChat(chat);
          if (!normalized || !normalized.id) return;
          const existing = chatMap.get(normalized.id) || {};
          chatMap.set(normalized.id, { ...existing, ...normalized });
        };

        const chatCollection = store?.chats instanceof Map
          ? Array.from(store.chats.values())
          : Object.values(store?.chats || {});
        const groupCollection = store?.groupMetadata instanceof Map
          ? Array.from(store.groupMetadata.values())
          : Object.values(store?.groupMetadata || {});

        chatCollection.forEach(addChat);
        groupCollection.forEach(addChat);

        const chats = Array.from(chatMap.values())
          .filter((chat) => chat.id && (clientEntry.allowedChats.has('*') || clientEntry.allowedChats.has(chat.id)));

        return send(ws, { type: 'chats', chats, requestId: incomingRequestId });
      }

      // Messaging commands
      if (type === 'sendText') {
        const { chatId, text } = msg || {};
        if (!chatId || !canSendTo(chatId)) return send(ws, { type: 'error', error: 'forbidden' });
        const sent = await sock.sendMessage(chatId, { text: String(text || '') });
        rememberOutgoing(sent);
        return send(ws, { type: 'ack', action: 'sendText', chatId });
      }

      if (type === 'simulateTyping') {
        const { chatId, on } = msg || {};
        if (!chatId || !canSendTo(chatId)) return send(ws, { type: 'error', error: 'forbidden' });
        try {
          await sock.presenceSubscribe(chatId);
          await sock.sendPresenceUpdate(on ? 'composing' : 'paused', chatId);
          send(ws, { type: 'ack', action: 'simulateTyping', chatId });
        } catch (e) {
          send(ws, { type: 'error', error: e.message });
        }
        return;
      }

      if (type === 'sendFile') {
        const {
          chatId,
          filePath,
          fileName,
          caption,
          ptt,
          withoutPreview,
          mimetype: explicitMime,
          asDocument
        } = msg || {};
        if (!chatId || !canSendTo(chatId)) return send(ws, { type: 'error', error: 'forbidden' });
        try {
          const buf = fs.readFileSync(filePath);
          const mime = explicitMime || mimeLookup(filePath) || 'application/octet-stream';
          const name = fileName || path.basename(filePath);

          if (!asDocument && mime.startsWith('video/')) {
            const sent = await sock.sendMessage(chatId, {
              video: buf,
              mimetype: mime,
              fileName: name,
              caption: caption || ''
            });
            rememberOutgoing(sent);
          } else if (!asDocument && mime.startsWith('audio/')) {
            const sent = await sock.sendMessage(chatId, {
              audio: buf,
              mimetype: mime,
              fileName: name,
              ptt: !!ptt
            });
            rememberOutgoing(sent);
          } else if (!asDocument && mime.startsWith('image/')) {
            const sent = await sock.sendMessage(chatId, {
              image: buf,
              mimetype: mime,
              fileName: name,
              caption: caption || ''
            });
            rememberOutgoing(sent);
          } else {
            // Fallback to document for unsupported/explicit document sends
            const sent = await sock.sendMessage(chatId, {
              document: buf,
              mimetype: mime,
              fileName: name
            });
            rememberOutgoing(sent);
          }
          send(ws, { type: 'ack', action: 'sendFile', chatId, requestId: incomingRequestId });
        } catch (e) {
          send(ws, { type: 'error', error: e.message, requestId: incomingRequestId });
        }
        return;
      }

      if (type === 'sendRawWebpAsSticker') {
        const { chatId, dataUrl, options } = msg || {};
        if (!chatId || !canSendTo(chatId)) return send(ws, { type: 'error', error: 'forbidden' });
        try {
          const match = /^data:image\/webp;base64,(.+)$/i.exec(String(dataUrl || ''));
          if (!match) throw new Error('invalid_data_url');
          const buf = Buffer.from(match[1], 'base64');
          const animated = typeof options?.animated === 'boolean' ? options.animated : isAnimatedWebpBuffer(buf);
          const sent = await sock.sendMessage(chatId, { sticker: buf, mimetype: 'image/webp', isAnimated: animated });
          rememberOutgoing(sent);
          send(ws, { type: 'ack', action: 'sendRawWebpAsSticker', chatId, requestId: incomingRequestId });
        } catch (e) {
          send(ws, { type: 'error', error: e.message, requestId: incomingRequestId });
        }
        return;
      }

      if (type === 'sendImageAsSticker') {
        const { chatId, filePath, options } = msg || {};
        if (!chatId || !canSendTo(chatId)) return send(ws, { type: 'error', error: 'forbidden' });
        try {
          // Expect already webp. If not, WhatsApp will likely reject.
          const buf = fs.readFileSync(filePath);
          const animated = typeof options?.animated === 'boolean' ? options.animated : isAnimatedWebpBuffer(buf);
          const sent = await sock.sendMessage(chatId, { sticker: buf, mimetype: 'image/webp', isAnimated: animated });
          rememberOutgoing(sent);
          send(ws, { type: 'ack', action: 'sendImageAsSticker', chatId, requestId: incomingRequestId });
        } catch (e) {
          send(ws, { type: 'error', error: e.message, requestId: incomingRequestId });
        }
        return;
      }

      if (type === 'sendImageAsStickerGif' || type === 'sendMp4AsSticker') {
        const { chatId, filePath } = msg || {};
        if (!chatId || !canSendTo(chatId)) return send(ws, { type: 'error', error: 'forbidden' });
        try {
          const stickerBuf = await convertToAnimatedWebp(filePath);
          const sent = await sock.sendMessage(chatId, { sticker: stickerBuf, mimetype: 'image/webp', isAnimated: true });
          rememberOutgoing(sent);
          return send(ws, { type: 'ack', action: type, chatId, requestId: incomingRequestId });
        } catch (e) {
          return send(ws, { type: 'error', error: e.message || String(e), requestId: incomingRequestId });
        }
      }

      if (type === 'groupParticipantsUpdate') {
        const { groupId, participants, action } = msg || {};
        if (!groupId || !participants || !action) {
          return send(ws, { type: 'error', error: 'missing_parameters', requestId: incomingRequestId });
        }
        if (!Array.isArray(participants) || participants.length === 0) {
          return send(ws, { type: 'error', error: 'invalid_participants', requestId: incomingRequestId });
        }
        const validActions = ['add', 'remove', 'promote', 'demote'];
        if (!validActions.includes(action)) {
          return send(ws, { type: 'error', error: 'invalid_action', requestId: incomingRequestId });
        }
        if (!canSendTo(groupId)) {
          return send(ws, { type: 'error', error: 'forbidden', requestId: incomingRequestId });
        }
        try {
          await sock.groupParticipantsUpdate(groupId, participants, action);
          return send(ws, { type: 'ack', action: 'groupParticipantsUpdate', groupId, requestId: incomingRequestId });
        } catch (e) {
          return send(ws, { type: 'error', error: e.message || String(e), requestId: incomingRequestId });
        }
      }

      if (type === 'downloadMedia') {
        const { messageId } = msg || {};
        const cached = messageId ? mediaCache.get(messageId) : null;
        if (cached && typeof cached.timestamp === 'number' && Date.now() - cached.timestamp > MEDIA_CACHE_TTL_MS) {
          mediaCache.delete(messageId);
          console.warn(`[WS Server] Media expired for message: ${messageId}`);
          return send(ws, { type: 'error', action: 'downloadMedia', messageId, error: 'media_expired' });
        }
        if (!cached) {
          console.warn(`[WS Server] Media not found in cache for message: ${messageId}`);
          return send(ws, { type: 'error', action: 'downloadMedia', messageId, error: 'media_not_found' });
        }
        const { m, chatId } = cached;
        const entryCan = clientEntry.allowedChats.has('*') || clientEntry.allowedChats.has(chatId);
        if (!entryCan) return send(ws, { type: 'error', action: 'downloadMedia', messageId, error: 'forbidden' });
        try {
          const buf = await buildMediaBuffer(m);
          const { type: mediaType, content } = extractMediaFromWebMessageInfo(m);
          const mimetype = content?.mimetype || DEFAULT_MIMETYPES[mediaType] || 'application/octet-stream';
          const dataUrl = `data:${mimetype};base64,${buf.toString('base64')}`;
          return send(ws, { type: 'media', messageId, mimetype, dataUrl, requestId: incomingRequestId });
        } catch (e) {
          console.error(`[WS Server] Failed to download media for message ${messageId}:`, e.message);
          // Provide more detailed error information
          const errorDetails = {
            message: e.message || String(e),
            type: e.name || 'Unknown',
            stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
          };
          return send(ws, { 
            type: 'error', 
            action: 'downloadMedia', 
            messageId, 
            error: e.message || String(e),
            errorDetails,
            requestId: incomingRequestId 
          });
        }
      }

      if (type === 'getQuotedMessage') {
        const { messageId } = msg || {};
        if (!messageId) return send(ws, { type: 'error', action: 'getQuotedMessage', error: 'messageId_required' });
        const stored = messageCache.get(messageId);
        if (stored && typeof stored.timestamp === 'number' && Date.now() - stored.timestamp > MESSAGE_CACHE_TTL_MS) {
          messageCache.delete(messageId);
          return send(ws, { type: 'error', action: 'getQuotedMessage', messageId, error: 'quoted_expired' });
        }
        if (!stored) return send(ws, { type: 'error', action: 'getQuotedMessage', messageId, error: 'quoted_not_found' });

        let target = null;
        if (stored.normalized?._fromQuote) {
          target = stored.normalized;
        } else if (stored.normalized?.quotedMsg) {
          target = stored.normalized.quotedMsg;
        } else if (stored.normalized?.quotedMsgId) {
          const nested = messageCache.get(stored.normalized.quotedMsgId);
          if (nested?.normalized) target = nested.normalized;
        }

        if (!target) {
          return send(ws, { type: 'error', action: 'getQuotedMessage', messageId, error: 'quoted_not_found' });
        }

        const chatId = target.chatId || stored.normalized?.chatId;
        if (chatId && !canSendTo(chatId)) {
          return send(ws, { type: 'error', action: 'getQuotedMessage', messageId, error: 'forbidden' });
        }

        return send(ws, { type: 'quotedMessage', messageId, data: target });
      }

      if (type === 'getContact') {
        const { jid } = msg || {};
        if (!jid) return send(ws, { type: 'error', action: 'getContact', error: 'jid_required' });
        const contactPayload = buildContactPayload(jid);
        return send(ws, { type: 'contact', jid, data: contactPayload });
      }
    });

    ws.on('close', () => {
      if (registeredToken && clientsByToken.has(registeredToken)) {
        const set = clientsByToken.get(registeredToken);
        if (clientEntry && set.has(clientEntry)) {
          set.delete(clientEntry);
        }
        if (set.size === 0) {
          clientsByToken.delete(registeredToken);
        } else {
          clientsByToken.set(registeredToken, set);
        }
      }
    });
  });

  // Helper for mimetype
  function mimeLookup(fp) {
    return mime.lookup(fp) || 'application/octet-stream';
  }

  // Forwarding incoming messages to authorized clients
  sock.ev.on('messages.upsert', (evt) => {
    if (!evt?.messages) return;
    const wrapped = normalizeOpenWAMessage(evt, {
      store,
      userId: sock?.user?.id,
      rememberMessage,
      rememberQuoted
    });
    if (wrapped) {
      // remember media for later download
      const m = evt.messages?.[0];
      try {
        const mediaInfo = extractMediaFromWebMessageInfo(m);
        if (mediaInfo.type) {
          rememberMedia(m);
        }
      } catch {}
      broadcastAuthorized(wrapped);
    }
  });

  server.listen(PORT, () => {
    console.log(`[WS] Baileys WebSocket Server listening on ws://0.0.0.0:${PORT}`);
  });
}

start().catch((e) => {
  console.error('[Server] Fatal error:', e);
  process.exit(1);
});
