// WhatsApp Adapter (Baileys over WebSocket)
// Exposes an OpenWA-like client API used by commands/ and services/

require('dotenv').config();

const WebSocket = require('ws');
const { parseBase64DataUrl } = require('./utils/dataUrl');

class BaileysWsAdapter {
  constructor({ url, token, chats = ['*'] }) {
    this.url = url;
    this.token = token;
    this.chats = chats;
    this.ws = null;
    this._listeners = new Set();
    this._anyListeners = new Set();
    this._reactionListeners = new Set();
    this._ready = false;
    this._registered = false;
    this._pendingMedia = new Map(); // messageId -> resolver
    this._pendingQuoted = new Map(); // messageId -> resolver
    this._pendingContacts = new Map(); // jid -> resolver
    this._pendingAcks = new Map(); // requestId -> { resolve, reject, timeout }
    this._readyWaiters = []; // resolve callbacks waiting for _ready
  }

  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this._ready) return this;
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      this._ready = false;
      this._registered = false;
      this._send({ type: 'register', token: this.token, chats: this.chats });
    });

    this.ws.on('message', (data) => {
      let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg.type === 'registered' && msg.ok) {
        this._registered = true;
        this._send({ type: 'subscribe', chats: this.chats });
      } else if (msg.type === 'connection.update') {
        const isOpen = msg?.data?.connection === 'open';
        this._ready = isOpen;
        if (isOpen) {
          const waiters = this._readyWaiters.splice(0);
          for (const resolve of waiters) resolve();
        }
      } else if (msg.requestId) {
        // Resolve/reject pending ack promises
        const pending = this._pendingAcks.get(msg.requestId);
        if (pending) {
          console.log('[WA Adapter] Received ACK for requestId:', msg.requestId, 'type:', msg.type);
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
        } else {
          console.log('[WA Adapter] Received response for unknown requestId:', msg.requestId);
        }
      } else if (msg.type === 'message' && msg.data) {
        const m = msg.data;
        for (const fn of this._anyListeners) fn(m);
        for (const fn of this._listeners) fn(m);
      } else if (msg.type === 'reaction' && msg.data) {
        const r = msg.data;
        for (const fn of this._reactionListeners) fn(r);
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

    this.ws.on('close', (code, reason) => {
      console.log(`[WA Adapter] WebSocket closed (code: ${code}, reason: ${reason || 'none'})`);
      this._ready = false;
      this._registered = false;
      console.log('[WA Adapter] Reconnecting in 2 seconds...');
      setTimeout(() => this.connect().catch((err) => {
        console.error('[WA Adapter] Reconnection failed:', err.message);
      }), 2000);
    });

    this.ws.on('error', (err) => {
      console.error('[WA Adapter] WebSocket error:', err.message);
    });
    return this;
  }

  async downloadMedia(messageId) {
    if (!messageId) throw new Error('messageId_required');
    await this._ensureReady();

    // Increased timeout to 45 seconds for larger media files
    const MEDIA_DOWNLOAD_TIMEOUT = 45000;
    
    const p = new Promise((resolve, reject) => {
      this._pendingMedia.set(messageId, { resolve, reject });
      setTimeout(() => {
        if (this._pendingMedia.has(messageId)) {
          this._pendingMedia.delete(messageId);
          console.warn(`[WA Adapter] Media download timeout after ${MEDIA_DOWNLOAD_TIMEOUT}ms for message: ${messageId}`);
          reject(new Error(`media_timeout_${MEDIA_DOWNLOAD_TIMEOUT}ms`));
        }
      }, MEDIA_DOWNLOAD_TIMEOUT);
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
    console.log('[WA Adapter] Sending request with ID:', requestId, 'type:', obj.type);
    const p = new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        console.log('[WA Adapter] ACK TIMEOUT for requestId:', requestId, 'type:', obj.type);
        if (this._pendingAcks.has(requestId)) this._pendingAcks.delete(requestId);
        reject(new Error('ack_timeout'));
      }, timeoutMs);
      this._pendingAcks.set(requestId, { resolve, reject, timeout: t });
    });
    this._send(payload);
    return p;
  }

  async _ensureReady(timeoutMs = 10000) {
    // Fast path: already connected and ready
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this._ready) {
      return;
    }

    if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
      console.log('[WA Adapter] WebSocket not connected, connecting...');
      await this.connect();
    }

    // May have become ready during connect()
    if (this._ready) return;

    // Event-based wait instead of polling loop
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const idx = this._readyWaiters.indexOf(onReady);
        if (idx !== -1) this._readyWaiters.splice(idx, 1);
        console.error('[WA Adapter] Timeout waiting for WebSocket to be ready');
        reject(new Error('ws_not_ready'));
      }, timeoutMs);

      const onReady = () => {
        clearTimeout(timeout);
        resolve();
      };
      this._readyWaiters.push(onReady);
    });
  }

  async waitUntilReady(timeoutMs = 5000) {
    return this._ensureReady(timeoutMs);
  }

  async getAllChats() {
    await this._ensureReady(8000);
    const resp = await this._sendAndWaitForAck({ type: 'listChats' }, 10000);
    const chats = Array.isArray(resp?.chats) ? resp.chats : [];
    return chats.map((chat) => {
      if (chat && !chat.name && chat.subject) {
        return { ...chat, name: chat.subject };
      }
      return chat;
    });
  }

  async getMediaBuffer(messageId) {
    const res = await this.downloadMedia(messageId);
    const { buffer, mimetype } = parseBase64DataUrl(res.dataUrl || '');
    return {
      buffer,
      mimetype: res.mimetype || mimetype
    };
  }

  async getQuotedMessage(messageId) {
    if (!messageId) throw new Error('messageId_required');
    await this._ensureReady();
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
    await this._ensureReady();
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
  onReaction(fn) { this._reactionListeners.add(fn); }

  // Messaging primitives
  async sendText(chatId, text) {
  // fire-and-forget text
  this._send({ type: 'sendText', chatId, text });
  }

  async sendReactionToMessage(messageId, chatId, emoji) {
    await this._ensureReady();
    return this._sendAndWaitForAck({ type: 'sendReactionToMessage', messageId, chatId, emoji }, 10000);
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
    await this._ensureReady();
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
    }, 60000);
  }

  async sendRawWebpAsSticker(chatId, dataUrl, options = {}) {
    console.log('[WA Adapter] sendRawWebpAsSticker called for chatId:', chatId, 'dataUrlLength:', dataUrl?.length);
    const stack = new Error().stack;
    console.log('[WA Adapter] Call stack:', stack.split('\n').slice(1, 4).join('\n'));
    await this._ensureReady();
    return this._sendAndWaitForAck({ type: 'sendRawWebpAsSticker', chatId, dataUrl, options }, 45000);
  }

  async sendImageAsSticker(chatId, filePath, options = {}) {
    await this._ensureReady();
    return this._sendAndWaitForAck({ type: 'sendImageAsSticker', chatId, filePath, options }, 45000);
  }

  async sendImageAsStickerGif(chatId, filePath, options = {}) {
    await this._ensureReady();
    return this._sendAndWaitForAck({ type: 'sendImageAsStickerGif', chatId, filePath, options }, 45000);
  }

  async sendMp4AsSticker(chatId, filePath, options = {}) {
    await this._ensureReady();
    return this._sendAndWaitForAck({ type: 'sendMp4AsSticker', chatId, filePath, options }, 45000);
  }

  async getAllGroupsMetadata() {
    await this._ensureReady(8000);
    const resp = await this._sendAndWaitForAck({ type: 'getAllGroupsMetadata' }, 15000);
    return Array.isArray(resp?.groups) ? resp.groups : [];
  }

  /**
   * Update group participants (add, remove, promote, demote)
   * @param {string} groupId - Group JID
   * @param {Array<string>} participants - Array of participant JIDs
   * @param {string} action - Action to perform: 'add', 'remove', 'promote', 'demote'
   */
  async groupParticipantsUpdate(groupId, participants, action) {
    await this._ensureReady();
    return this._sendAndWaitForAck({
      type: 'groupParticipantsUpdate',
      groupId,
      participants,
      action
    });
  }

  _send(obj) {
    try { this.ws && this.ws.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify(obj)); } catch {}
  }

  // Simulate Baileys socket interface for LID functionality
  // Uses local DB directly instead of routing through WebSocket
  get sock() {
    let lidModel = null;
    try {
      lidModel = require('./database/models/lidMapping');
    } catch (e) {
      // lidMapping module not available
    }

    return {
      signalRepository: {
        lidMapping: {
          getLIDForPN: async (pn) => {
            if (!lidModel) return null;
            try { return lidModel.getLidForPn(pn); } catch { return null; }
          },
          getPNForLID: async (lid) => {
            if (!lidModel) return null;
            try { return lidModel.getPnForLid(lid); } catch { return null; }
          },
          getLIDsForPNs: async (pns) => {
            if (!lidModel || !Array.isArray(pns)) return {};
            try {
              const result = {};
              for (const pn of pns) {
                result[pn] = await lidModel.getLidForPn(pn);
              }
              return result;
            } catch { return {}; }
          },
          storeLIDPNMapping: (lid, pn) => {
            if (!lidModel) return;
            try { lidModel.storeLidPnMapping(lid, pn); } catch {}
          },
          storeLIDPNMappings: (mappings) => {
            if (!lidModel || !Array.isArray(mappings)) return;
            try {
              for (const { lid, pn } of mappings) {
                lidModel.storeLidPnMapping(lid, pn);
              }
            } catch {}
          }
        }
      }
    };
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
