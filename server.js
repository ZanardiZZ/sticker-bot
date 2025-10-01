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

const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  downloadContentFromMessage
} = require('@whiskeysockets/baileys');

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
// token -> { ws, allowedChats: Set<string> }
const clientsByToken = new Map();

function isTokenAllowed(token) {
  if (!token) return false;
  if (ALLOWED_TOKENS.length === 0) return true; // open policy if none configured
  return ALLOWED_TOKENS.includes(token);
}

function normalizeOpenWAMessage(msg) {
  // Convert Baileys message to an OpenWA-like shape used by current code
  const m = msg?.messages?.[0];
  if (!m) return null;
  const remoteJid = m.key?.remoteJid || '';
  const from = remoteJid;
  const isGroupMsg = String(remoteJid).endsWith('@g.us');
  const chatId = remoteJid;
  const id = m.key?.id;
  const senderId = m.key?.participant || m.participant || m.pushName || m.key?.fromMe ? undefined : undefined;

  // Body extraction (text/caption)
  let body = '';
  try {
    body = m.message?.conversation
      || m.message?.extendedTextMessage?.text
      || m.message?.imageMessage?.caption
      || m.message?.videoMessage?.caption
      || '';
  } catch {}

  // Media detection
  let isMedia = false;
  let mimetype = '';
  let type = 'chat';
  if (m.message?.imageMessage) {
    isMedia = true; mimetype = m.message.imageMessage.mimetype || 'image/jpeg'; type = 'image';
  } else if (m.message?.videoMessage) {
    isMedia = true; mimetype = m.message.videoMessage.mimetype || 'video/mp4'; type = 'video';
  } else if (m.message?.stickerMessage) {
    isMedia = true; mimetype = m.message.stickerMessage.mimetype || 'image/webp'; type = 'sticker';
  } else if (m.message?.audioMessage) {
    isMedia = true; mimetype = m.message.audioMessage.mimetype || 'audio/ogg'; type = 'audio';
  }

  return {
    from,
    chatId,
    id,
    messageId: id,
    body: body || '',
    type,
    isMedia,
    mimetype,
    isGroupMsg,
    sender: { id: m.key?.participant || m.pushName || '' },
    author: m.key?.participant || '',
    // raw for advanced usage
    _raw: m
  };
}

async function start() {
  // Ensure auth dir exists
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const store = makeInMemoryStore({});

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    syncFullHistory: false,
    browser: ['StickerBot', 'Chrome', '1.0']
  });

  store.bind(sock.ev);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) console.log('[Baileys] QR updated. Scan to authenticate.');
    if (connection === 'open') {
      console.log('[Baileys] Connection opened');
    } else if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.message;
      console.warn('[Baileys] Connection closed. Reason:', reason);
      if (reason !== DisconnectReason.loggedOut) {
        setTimeout(() => start().catch(console.error), 3000);
      }
    }
  });

  // HTTP server + WS for clients
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Baileys WebSocket Server running\n');
  });

  const wss = new WebSocketServer({ server });

  function send(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch {}
  }

  // cache limited number of recent media messages for download on demand
  const MAX_CACHE = 500;
  const mediaCache = new Map(); // messageId -> { m, chatId }

  function rememberMedia(m) {
    try {
      const id = m?.key?.id;
      const chatId = m?.key?.remoteJid;
      if (!id || !chatId) return;
      if (mediaCache.size >= MAX_CACHE) {
        const firstKey = mediaCache.keys().next().value;
        if (firstKey) mediaCache.delete(firstKey);
      }
      mediaCache.set(id, { m, chatId });
    } catch {}
  }

  function broadcastAuthorized(openwaMsg) {
    if (!openwaMsg) return;
    const chatId = openwaMsg.chatId;
    for (const [token, entry] of clientsByToken) {
      if (entry.allowedChats.has('*') || entry.allowedChats.has(chatId)) {
        send(entry.ws, { type: 'message', data: openwaMsg });
      }
    }
  }

  async function buildMediaBuffer(m) {
    const content = m.message?.imageMessage || m.message?.videoMessage || m.message?.stickerMessage || m.message?.audioMessage || m.message?.documentMessage;
    if (!content) throw new Error('no_media');
    let kind = 'image';
    if (m.message?.videoMessage) kind = 'video';
    else if (m.message?.stickerMessage) kind = 'sticker';
    else if (m.message?.audioMessage) kind = 'audio';
    else if (m.message?.documentMessage) kind = 'document';
    const stream = await downloadContentFromMessage(content, kind);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
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

    ws.on('message', async (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
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
        clientsByToken.set(token, { ws, allowedChats });
        send(ws, { type: 'registered', ok: true });
        return;
      }

      if (!registeredToken || !clientsByToken.has(registeredToken)) {
        send(ws, { type: 'error', error: 'not_registered' });
        return;
      }

      const entry = clientsByToken.get(registeredToken);

      if (type === 'subscribe') {
        const { chats } = msg || {};
        if (Array.isArray(chats)) {
          entry.allowedChats = new Set(chats.length ? chats : ['*']);
          clientsByToken.set(registeredToken, entry);
          send(ws, { type: 'subscribed', ok: true });
        }
        return;
      }

      // Enforce authorization helper
      const canSendTo = (chatId) => entry.allowedChats.has('*') || entry.allowedChats.has(chatId);

      // Messaging commands
      if (type === 'sendText') {
        const { chatId, text } = msg || {};
        if (!chatId || !canSendTo(chatId)) return send(ws, { type: 'error', error: 'forbidden' });
        await sock.sendMessage(chatId, { text: String(text || '') });
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
        const { chatId, filePath, fileName } = msg || {};
        if (!chatId || !canSendTo(chatId)) return send(ws, { type: 'error', error: 'forbidden' });
        try {
          const buf = fs.readFileSync(filePath);
          const mime = mimeLookup(filePath) || 'application/octet-stream';
          // Send as document to be generic
          await sock.sendMessage(chatId, { document: buf, mimetype: mime, fileName: fileName || path.basename(filePath) });
          send(ws, { type: 'ack', action: 'sendFile', chatId });
        } catch (e) {
          send(ws, { type: 'error', error: e.message });
        }
        return;
      }

      if (type === 'sendRawWebpAsSticker') {
        const { chatId, dataUrl } = msg || {};
        if (!chatId || !canSendTo(chatId)) return send(ws, { type: 'error', error: 'forbidden' });
        try {
          const match = /^data:image\/webp;base64,(.+)$/i.exec(String(dataUrl || ''));
          if (!match) throw new Error('invalid_data_url');
          const buf = Buffer.from(match[1], 'base64');
          await sock.sendMessage(chatId, { sticker: buf });
          send(ws, { type: 'ack', action: 'sendRawWebpAsSticker', chatId });
        } catch (e) {
          send(ws, { type: 'error', error: e.message });
        }
        return;
      }

      if (type === 'sendImageAsSticker') {
        const { chatId, filePath } = msg || {};
        if (!chatId || !canSendTo(chatId)) return send(ws, { type: 'error', error: 'forbidden' });
        try {
          // Expect already webp. If not, WhatsApp will likely reject.
          const buf = fs.readFileSync(filePath);
          await sock.sendMessage(chatId, { sticker: buf });
          send(ws, { type: 'ack', action: 'sendImageAsSticker', chatId });
        } catch (e) {
          send(ws, { type: 'error', error: e.message });
        }
        return;
      }

      if (type === 'sendImageAsStickerGif' || type === 'sendMp4AsSticker') {
        const { chatId, filePath } = msg || {};
        if (!chatId || !canSendTo(chatId)) return send(ws, { type: 'error', error: 'forbidden' });
        try {
          const stickerBuf = await convertToAnimatedWebp(filePath);
          await sock.sendMessage(chatId, { sticker: stickerBuf });
          return send(ws, { type: 'ack', action: type, chatId });
        } catch (e) {
          return send(ws, { type: 'error', error: e.message || String(e) });
        }
      }

      if (type === 'downloadMedia') {
        const { messageId } = msg || {};
        const cached = messageId ? mediaCache.get(messageId) : null;
        if (!cached) return send(ws, { type: 'error', error: 'media_not_found' });
        const { m, chatId } = cached;
        const entryCan = entry.allowedChats.has('*') || entry.allowedChats.has(chatId);
        if (!entryCan) return send(ws, { type: 'error', error: 'forbidden' });
        try {
          const buf = await buildMediaBuffer(m);
          const mimetype = m.message?.imageMessage?.mimetype || m.message?.videoMessage?.mimetype || m.message?.stickerMessage?.mimetype || m.message?.audioMessage?.mimetype || m.message?.documentMessage?.mimetype || 'application/octet-stream';
          const dataUrl = `data:${mimetype};base64,${buf.toString('base64')}`;
          return send(ws, { type: 'media', messageId, mimetype, dataUrl });
        } catch (e) {
          return send(ws, { type: 'error', error: e.message || String(e) });
        }
      }
    });

    ws.on('close', () => {
      if (registeredToken && clientsByToken.get(registeredToken)?.ws === ws) {
        clientsByToken.delete(registeredToken);
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
    const wrapped = normalizeOpenWAMessage(evt);
    if (wrapped) {
      // remember media for later download
      const m = evt.messages?.[0];
      try {
        if (m?.message?.imageMessage || m?.message?.videoMessage || m?.message?.stickerMessage || m?.message?.audioMessage || m?.message?.documentMessage) {
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
