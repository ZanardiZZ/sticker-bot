const { decryptMedia } = require('@open-wa/wa-decrypt');

const DATA_URL_REGEX = /^data:([^;]+);base64,(.+)$/i;

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

    if (typeof client.downloadMedia === 'function') {
      try {
        const rpcResponse = await client.downloadMedia(messageId);
        const match = DATA_URL_REGEX.exec(rpcResponse?.dataUrl || '');
        if (!match) {
          throw new Error('invalid_media_payload');
        }
        const buffer = Buffer.from(match[2], 'base64');
        const mimetype = rpcResponse?.mimetype || match[1] || message?.mimetype || 'application/octet-stream';
        return { buffer, mimetype };
      } catch (err) {
        console.warn('[MediaDownload] RPC downloadMedia failed, falling back to getMediaBuffer:', err.message);
      }
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
