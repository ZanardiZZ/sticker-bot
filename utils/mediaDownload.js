const { decryptMedia } = require('@open-wa/wa-decrypt');

/**
 * Downloads media for a WhatsApp message, preferring the Baileys adapter RPC when available.
 * Falls back to the legacy decryptMedia implementation for open-wa clients.
 *
 * @param {Object} client - WhatsApp client or adapter instance
 * @param {Object} message - Message payload containing the media metadata
 * @returns {Promise<{ buffer: Buffer, mimetype: string }>} Media buffer and mimetype
 */
async function downloadMediaForMessage(client, message) {
  if (!message) {
    throw new Error('message_required');
  }

  const messageId = message?.id || message?.messageId || message?.key?.id;

  if (client && typeof client.getMediaBuffer === 'function') {
    if (!messageId) {
      throw new Error('message_id_missing');
    }
    const { buffer, mimetype } = await client.getMediaBuffer(messageId);
    return {
      buffer,
      mimetype: mimetype || message?.mimetype || 'application/octet-stream'
    };
  }

  const buffer = await decryptMedia(message);
  return {
    buffer,
    mimetype: message?.mimetype || 'application/octet-stream'
  };
}

module.exports = {
  downloadMediaForMessage,
};
