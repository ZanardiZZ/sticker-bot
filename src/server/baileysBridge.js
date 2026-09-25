'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const qrcode = require('qrcode-terminal');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  getContentType,
} = require('@whiskeysockets/baileys');

const PORT = Number(process.env.BAILEYS_WS_PORT || 8876);
const AUTH_DIR = process.env.BAILEYS_AUTH_DIR || path.join(__dirname, '../../storage/baileys-canary-auth');
const clients = new Set();
const messages = new Map();
let sock;
let stopping = false;
let reconnectTimer;
let connectionState = 'connecting';

function log(...args) { console.log('[BAILEYS-CANARY]', ...args); }
function fetchErrorDetails(error) {
  const e = error || {};
  const c = e.cause || {};
  return {
    name: e.name || null,
    message: e.message || null,
    causeName: c.name || null,
    causeCode: c.code || c.errno || null,
    causeSyscall: c.syscall || null,
    causeAddress: c.address || null,
    causePort: c.port || null,
  };
}
function send(ws, value) { if (ws.readyState === 1) ws.send(JSON.stringify(value)); }
function broadcast(value) { for (const ws of clients) send(ws, value); }
function idOf(key) { return key?.id || crypto.createHash('sha1').update(JSON.stringify(key || {})).digest('hex').slice(0, 20); }
function unwrap(message) {
  let m = message || {};
  for (const key of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage']) m = m?.[key]?.message || m;
  return m || {};
}
function mediaType(m) {
  const t = getContentType(m);
  return t === 'conversation' || t === 'extendedTextMessage' ? 'chat' : ({ imageMessage: 'image', stickerMessage: 'sticker', videoMessage: 'video', audioMessage: 'audio', documentMessage: 'document' }[t] || t || 'unknown');
}
function normalize(msg) {
  const key = msg.key || {};
  const m = unwrap(msg.message);
  const type = mediaType(m);
  const text = m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || m.documentMessage?.caption || '';
  const context = m.extendedTextMessage?.contextInfo || m.imageMessage?.contextInfo || m.videoMessage?.contextInfo || m.stickerMessage?.contextInfo || {};
  const id = idOf(key);
  messages.set(id, msg);
  const senderId = key.participant || key.remoteJid || '';
  const senderName = typeof msg.pushName === 'string' ? msg.pushName.trim() : '';
  const data = {
    id, messageId: id, key: { ...key, id }, chatId: key.remoteJid || '', from: key.remoteJid || '', senderId,
    pushName: senderName || undefined, notifyName: senderName || undefined,
    sender: { id: senderId, pushname: senderName || undefined, name: senderName || undefined },
    timestamp: Number(msg.messageTimestamp || Math.floor(Date.now() / 1000)), body: text, type, mimetype: m.imageMessage?.mimetype || m.videoMessage?.mimetype || m.audioMessage?.mimetype || m.documentMessage?.mimetype || m.stickerMessage?.mimetype || '',
    isMedia: ['image', 'sticker', 'video', 'audio', 'document'].includes(type), isGroupMsg: String(key.remoteJid || '').endsWith('@g.us'), isFromMe: Boolean(key.fromMe),
    hasQuotedMsg: Boolean(context.stanzaId || context.quotedMessage), quotedMsgId: context.stanzaId || '', quotedMessage: context.quotedMessage || null,
    caption: text, rawMessage: msg,
  };
  return data;
}
function quotedKey(messageId) {
  const original = messages.get(messageId); const m = unwrap(original?.message); const c = m.extendedTextMessage?.contextInfo || m.imageMessage?.contextInfo || m.videoMessage?.contextInfo || m.stickerMessage?.contextInfo || {};
  return c.stanzaId ? { remoteJid: original.key.remoteJid, id: c.stanzaId, participant: c.participant } : null;
}
function dataBuffer(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^data:[^;]+;base64,(.+)$/);
  return Buffer.from(match ? match[1] : value, 'base64');
}
async function sendFile(msg) {
  let buffer = msg.dataUrl ? dataBuffer(msg.dataUrl) : (msg.filePath ? fs.readFileSync(msg.filePath) : null);
  if (!buffer) throw new Error('file_data_required');
  const name = msg.fileName || msg.filename || (msg.filePath ? path.basename(msg.filePath) : 'file');
  const ext = path.extname(name).toLowerCase();
  const inferredMime = ({ '.mp4': 'video/mp4', '.webm': 'video/webm', '.gif': 'image/gif', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' })[ext];
  const mimetype = msg.mimetype || inferredMime || 'application/octet-stream';
  let content;
  if (mimetype === 'image/webp' || msg.asSticker) content = { sticker: buffer };
  else if (mimetype.startsWith('image/')) content = { image: buffer, caption: msg.caption || undefined };
  else if (mimetype.startsWith('video/')) content = { video: buffer, caption: msg.caption || undefined, mimetype };
  else if (mimetype.startsWith('audio/')) content = { audio: buffer, mimetype, ptt: Boolean(msg.ptt) };
  else content = { document: buffer, mimetype, fileName: name, caption: msg.caption || undefined };
  const options = {}; const q = msg.quotedMessageId && messages.get(msg.quotedMessageId); if (q) options.quoted = q;
  return sock.sendMessage(msg.chatId, content, options);
}
async function rpc(msg) {
  if (!sock) throw new Error('whatsapp_not_ready');
  if (msg.type === 'sendText' || msg.type === 'sendMessage') return sock.sendMessage(msg.chatId, { text: msg.text || msg.message || '' });
  if (msg.type === 'sendRawWebpAsSticker') { const sent = await sock.sendMessage(msg.chatId, { sticker: dataBuffer(msg.dataUrl) }); return { messageId: sent?.key?.id || sent?.messageId || null }; }
  if (msg.type === 'sendFile' || msg.type === 'sendImageAsSticker' || msg.type === 'sendImageAsStickerGif') return sendFile({ ...msg, filePath: msg.filePath, asSticker: msg.type !== 'sendFile' });
  if (msg.type === 'simulateTyping') return sock.sendPresenceUpdate(msg.on ? 'composing' : 'paused', msg.chatId);
  if (msg.type === 'getQuotedMessage') { const key = quotedKey(msg.messageId); if (!key) throw new Error('quoted_not_found'); const q = await sock.loadMessage(key.remoteJid, key.id); return q ? normalize(q) : null; }
  if (msg.type === 'downloadMedia') { const original = messages.get(msg.messageId); if (!original) throw new Error('media_not_found'); const native = unwrap(original.message); const contentType = getContentType(native); const media = native?.[contentType] || {}; log('download request', { id: msg.messageId, contentType, hasUrl: Boolean(media.url), hasDirectPath: Boolean(media.directPath), hasMediaKey: Boolean(media.mediaKey), fileLength: media.fileLength || null }); let b; try { b = await downloadMediaMessage(original, 'buffer', {}, { reuploadRequest: async (message) => { log('reupload requested', { id: msg.messageId }); return sock.updateMediaMessage(message); } }); } catch (error) { log('download failed', { id: msg.messageId, ...fetchErrorDetails(error) }); throw error; } log('download complete', { id: msg.messageId, bytes: b.length }); return { messageId: msg.messageId, mimetype: original.message && (unwrap(original.message).imageMessage?.mimetype || unwrap(original.message).stickerMessage?.mimetype || 'application/octet-stream'), dataUrl: `data:application/octet-stream;base64,${b.toString('base64')}` }; }
  throw new Error(`unsupported_action:${msg.type}`);
}
async function start() {
  fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  sock = makeWASocket({ auth: state, printQRInTerminal: false, browser: ['Ubuntu', 'Chrome', '20.0.04'], markOnlineOnConnect: false, syncFullHistory: false });
  const pairingPhone = process.env.BAILEYS_PHONE_NUMBER;
  if (pairingPhone && !state.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(pairingPhone);
        log(`PAIRING_CODE=${code}`);
      } catch (error) {
        log(`pairing_code_failed=${error.message}`);
      }
    }, 3000);
  }
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) { fs.writeFileSync(path.join(AUTH_DIR, 'pairing.qr'), qr, { mode: 0o600 }); log('QR disponível para pareamento'); qrcode.generate(qr, { small: true }); broadcast({ type: 'connection.update', data: { connection: 'qr' } }); }
    if (connection) { connectionState = connection; log(`connection=${connection}`); broadcast({ type: 'connection.update', data: { connection } }); }
    if (connection === 'open') { reconnectTimer = null; }
    if (connection === 'close' && !stopping) {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut || code === DisconnectReason.badSession) { log(`terminal_auth_failure=${code}; pareamento necessário`); return; }
      clearTimeout(reconnectTimer); reconnectTimer = setTimeout(() => start().catch(e => log('reconnect_failed', e.message)), 2000);
    }
  });
  sock.ev.on('messages.upsert', ({ messages: incoming, type }) => { if (type !== 'notify') return; for (const raw of incoming) { const data = normalize(raw); broadcast({ type: 'message', data }); } });
}
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('Baileys canary\n'); });
const wss = new WebSocketServer({ server });
wss.on('connection', ws => { clients.add(ws); send(ws, { type: 'registered', ok: true, transport: 'baileys-canary' }); if (connectionState) send(ws, { type: 'connection.update', data: { connection: connectionState } }); ws.on('message', async raw => { let msg; try { msg = JSON.parse(raw); const result = await rpc(msg); if (msg.type === 'downloadMedia') send(ws, { type: 'media', messageId: msg.messageId, mimetype: result.mimetype, dataUrl: result.dataUrl }); else if (msg.type === 'sendRawWebpAsSticker') send(ws, { type: 'ack', requestId: msg.requestId, messageId: result?.messageId || null, result: result || { ok: true } }); else send(ws, { type: 'ack', requestId: msg.requestId, result: result || { ok: true } }); } catch (e) { if (msg?.type === 'downloadMedia') send(ws, { type: 'error', action: msg.type, messageId: msg.messageId, requestId: msg.requestId, error: e.message }); else send(ws, { type: 'error', action: msg?.type, requestId: msg?.requestId, error: e.message }); } }); ws.on('close', () => clients.delete(ws)); });
server.listen(PORT, '0.0.0.0', () => { log(`WebSocket listening on ws://0.0.0.0:${PORT}`); start().catch(e => { log('startup_failed', e.stack || e.message); process.exitCode = 1; }); });
async function shutdown() { stopping = true; clearTimeout(reconnectTimer); try { sock?.end(undefined); } catch {} server.close(); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
