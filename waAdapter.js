// WhatsApp Adapter (Baileys over WebSocket)
// Exposes an OpenWA-like client API used by commands/ and services/

require('dotenv').config();

const WebSocket = require('ws');

class BaileysWsAdapter {
  constructor({ url, token, chats = ['*'] }) {
    this.url = url;
    this.token = token;
    this.chats = chats;
    this.ws = null;
    this._listeners = new Set();
    this._anyListeners = new Set();
    this._ready = false;
    this._pendingMedia = new Map(); // messageId -> resolver
    this._pendingQuoted = new Map(); // messageId -> resolver
    this._pendingContacts = new Map(); // jid -> resolver
  this._pendingAcks = new Map(); // requestId -> { resolve, reject, timeout }
  }

  async connect() {
    if (this.ws && this._ready) return this;
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      this._send({ type: 'register', token: this.token, chats: this.chats });
    });

    this.ws.on('message', (data) => {
      let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg.type === 'registered' && msg.ok) {
        this._ready = true;
        // subscribe confirm
        this._send({ type: 'subscribe', chats: this.chats });
      } else if (msg.requestId) {
        // Resolve/reject pending ack promises
        const pending = this._pendingAcks.get(msg.requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          this._pendingAcks.delete(msg.requestId);
          if (msg.type === 'ack') {
            pending.resolve(msg);
          } else if (msg.type === 'error') {
            pending.reject(new Error(msg.error || 'server_error'));
          } else {
            // Other responses (like media) also resolve
            pending.resolve(msg);
          }
        }
      } else if (msg.type === 'message' && msg.data) {
        const m = msg.data;
        for (const fn of this._anyListeners) fn(m);
        for (const fn of this._listeners) fn(m);
      } else if (msg.type === 'media' && msg.messageId) {
        const pending = this._pendingMedia.get(msg.messageId);
        if (pending) {
          this._pendingMedia.delete(msg.messageId);
          pending.resolve(msg);
        }
      } else if (msg.type === 'quotedMessage' && msg.messageId) {
        const pending = this._pendingQuoted.get(msg.messageId);
        if (pending) {
          this._pendingQuoted.delete(msg.messageId);
          pending.resolve(msg.data);
        }
      } else if (msg.type === 'contact' && msg.jid) {
        const pending = this._pendingContacts.get(msg.jid);
        if (pending) {
          this._pendingContacts.delete(msg.jid);
          pending.resolve(msg.data);
        }
      } else if (msg.type === 'error') {
        if (msg.action === 'downloadMedia' && msg.messageId) {
          const pending = this._pendingMedia.get(msg.messageId);
          if (pending) {
            this._pendingMedia.delete(msg.messageId);
            pending.reject(new Error(msg.error || 'media_error'));
          }
        } else if (msg.action === 'getQuotedMessage' && msg.messageId) {
          const pending = this._pendingQuoted.get(msg.messageId);
          if (pending) {
            this._pendingQuoted.delete(msg.messageId);
            pending.reject(new Error(msg.error || 'quoted_not_found'));
          }
        } else if (msg.action === 'getContact' && msg.jid) {
          const pending = this._pendingContacts.get(msg.jid);
          if (pending) {
            this._pendingContacts.delete(msg.jid);
            pending.reject(new Error(msg.error || 'contact_error'));
          }
        }
      }
    });

    this.ws.on('close', () => {
      this._ready = false;
      setTimeout(() => this.connect().catch(() => {}), 2000);
    });

    this.ws.on('error', () => {});
    return this;
  }

  async downloadMedia(messageId) {
    if (!messageId) throw new Error('messageId_required');
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('ws_not_ready');
    const p = new Promise((resolve, reject) => {
      this._pendingMedia.set(messageId, { resolve, reject });
      setTimeout(() => {
        if (this._pendingMedia.has(messageId)) {
          this._pendingMedia.delete(messageId);
          reject(new Error('media_timeout'));
        }
      }, 20000);
    });
    this._send({ type: 'downloadMedia', messageId });
    const res = await p;
    return res; // { messageId, mimetype, dataUrl }
  }

  // Helper to send RPC and wait for server ack. If server doesn't ack within timeout, rejects.
  async _sendAndWaitForAck(obj, timeoutMs = 10000) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('ws_not_ready');
    const requestId = `req_${Date.now()}_${Math.floor(Math.random()*100000)}`;
    const payload = Object.assign({}, obj, { requestId });
    const p = new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        if (this._pendingAcks.has(requestId)) this._pendingAcks.delete(requestId);
        reject(new Error('ack_timeout'));
      }, timeoutMs);
      this._pendingAcks.set(requestId, { resolve, reject, timeout: t });
    });
    this._send(payload);
    return p;
  }

  async getMediaBuffer(messageId) {
    const res = await this.downloadMedia(messageId);
    const m = /^data:([^;]+);base64,(.+)$/i.exec(res.dataUrl || '');
    if (!m) throw new Error('invalid_data_url');
    return {
      buffer: Buffer.from(m[2], 'base64'),
      mimetype: m[1]
    };
  }

  async getQuotedMessage(messageId) {
    if (!messageId) throw new Error('messageId_required');
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('ws_not_ready');
    const resultPromise = new Promise((resolve, reject) => {
      this._pendingQuoted.set(messageId, { resolve, reject });
      setTimeout(() => {
        if (this._pendingQuoted.has(messageId)) {
          this._pendingQuoted.delete(messageId);
          reject(new Error('quoted_timeout'));
        }
      }, 10000);
    });
    this._send({ type: 'getQuotedMessage', messageId });
    return resultPromise;
  }

  async getContact(jid) {
    if (!jid) throw new Error('jid_required');
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('ws_not_ready');
    const resultPromise = new Promise((resolve, reject) => {
      this._pendingContacts.set(jid, { resolve, reject });
      setTimeout(() => {
        if (this._pendingContacts.has(jid)) {
          this._pendingContacts.delete(jid);
          reject(new Error('contact_timeout'));
        }
      }, 10000);
    });
    this._send({ type: 'getContact', jid });
    return resultPromise;
  }

  // OpenWA-like event APIs used by current code
  onAnyMessage(fn) { this._anyListeners.add(fn); }
  onMessage(fn) { this._listeners.add(fn); }

  // Messaging primitives
  async sendText(chatId, text) {
  // fire-and-forget text
  this._send({ type: 'sendText', chatId, text });
  }

  async reply(chatId, text, quotedMessageId) {
    // Not implemented server-side; use sendText as safeReply already simulates reply
    this._send({ type: 'sendText', chatId, text });
  }

  async simulateTyping(chatId, on) {
    this._send({ type: 'simulateTyping', chatId, on: !!on });
  }

  async sendFile(
    chatId,
    filePath,
    fileName,
    caption,
    quotedMessageId,
    waitForId,
    ptt,
    withoutPreview,
    hideTags,
    viewOnce,
    requestConfig
  ) {
    // For file sends, wait for server ack before resolving so callers can rely on delivery ordering
    return this._sendAndWaitForAck({
      type: 'sendFile',
      chatId,
      filePath,
      fileName,
      caption,
      quotedMessageId,
      waitForId,
      ptt,
      withoutPreview,
      hideTags,
      viewOnce,
      ...(requestConfig && typeof requestConfig === 'object' ? requestConfig : {})
    });
  }

  async sendRawWebpAsSticker(chatId, dataUrl, options = {}) {
    return this._sendAndWaitForAck({ type: 'sendRawWebpAsSticker', chatId, dataUrl, options });
  }

  async sendImageAsSticker(chatId, filePath, options = {}) {
    return this._sendAndWaitForAck({ type: 'sendImageAsSticker', chatId, filePath, options });
  }

  async sendImageAsStickerGif(chatId, filePath, options = {}) {
  return this._sendAndWaitForAck({ type: 'sendImageAsStickerGif', chatId, filePath, options });
  }

  async sendMp4AsSticker(chatId, filePath, options = {}) {
  return this._sendAndWaitForAck({ type: 'sendMp4AsSticker', chatId, filePath, options });
  }

  _send(obj) {
    try { this.ws && this.ws.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify(obj)); } catch {}
  }
}

async function createAdapter(opts = {}) {
  const url = opts.url || process.env.BAILEYS_WS_URL || 'ws://localhost:8765';
  const token = opts.token || process.env.BAILEYS_CLIENT_TOKEN || 'dev';
  const chats = Array.isArray(opts.chats) ? opts.chats : (process.env.BAILEYS_ALLOWED_CHATS ? process.env.BAILEYS_ALLOWED_CHATS.split(',').map(s => s.trim()) : ['*']);
  const adapter = new BaileysWsAdapter({ url, token, chats });
  await adapter.connect();
  return adapter;
}

module.exports = { createAdapter, BaileysWsAdapter };
