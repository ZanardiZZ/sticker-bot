const { EventEmitter } = require('events');

/**
 * Lightweight mock for the Baileys-compatible client interface.
 * It records outgoing operations and lets tests simulate inbound messages.
 */
class MockBaileysClient extends EventEmitter {
  constructor({ id = 'mock-client' } = {}) {
    super();
    this.id = id;
    this._anyListeners = new Set();
    this._messageListeners = new Set();
    this.sent = [];
    this.typingState = new Map();
    this.contacts = new Map();
    this.connected = true;
  }

  /**
   * Helper for tests to preload contact data returned by getContact.
   */
  setContact(jid, contact) {
    this.contacts.set(jid, contact);
  }

  clearContacts() {
    this.contacts.clear();
  }

  clearSent() {
    this.sent = [];
  }

  // --- Listener registration ---
  onAnyMessage(handler) {
    this._anyListeners.add(handler);
  }

  onMessage(handler) {
    this._messageListeners.add(handler);
  }

  removeAllListeners() {
    this._anyListeners.clear();
    this._messageListeners.clear();
    super.removeAllListeners();
  }

  /**
   * Simulate an incoming WhatsApp message payload.
   */
  async emitIncoming(message) {
    const maybePromises = [];
    for (const handler of this._anyListeners) {
      maybePromises.push(handler(message));
    }
    for (const handler of this._messageListeners) {
      maybePromises.push(handler(message));
    }

    const pending = maybePromises.filter((value) => value && typeof value.then === 'function');
    if (pending.length > 0) {
      await Promise.all(pending);
    }
  }

  // --- Outgoing operations (recorded so tests can assert on them) ---
  async sendText(chatId, text) {
    this.sent.push({ type: 'text', chatId, payload: text });
    return { chatId, text };
  }

  async reply(chatId, text, quotedMessageId) {
    this.sent.push({ type: 'reply', chatId, payload: text, quotedMessageId });
    return { chatId, text, quotedMessageId };
  }

  async sendFile(chatId, filePath, fileName) {
    this.sent.push({ type: 'file', chatId, payload: { filePath, fileName } });
  }

  async sendRawWebpAsSticker(chatId, dataUrl, options = {}) {
    this.sent.push({ type: 'sticker-raw', chatId, payload: { dataUrl, options } });
  }

  async sendImageAsSticker(chatId, filePath, options = {}) {
    this.sent.push({ type: 'sticker-image', chatId, payload: { filePath, options } });
  }

  async sendImageAsStickerGif(chatId, filePath, options = {}) {
    this.sent.push({ type: 'sticker-gif', chatId, payload: { filePath, options } });
  }

  async sendMp4AsSticker(chatId, filePath, options = {}) {
    this.sent.push({ type: 'sticker-mp4', chatId, payload: { filePath, options } });
  }

  async simulateTyping(chatId, on) {
    this.typingState.set(chatId, !!on);
  }

  async getContact(jid) {
    if (!this.contacts.has(jid)) {
      const error = new Error('contact_not_found');
      error.code = 'CONTACT_NOT_FOUND';
      throw error;
    }
    return this.contacts.get(jid);
  }
}

module.exports = { MockBaileysClient };
