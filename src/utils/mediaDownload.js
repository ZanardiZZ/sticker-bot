const { parseBase64DataUrl } = require('./dataUrl');

/**
 * Downloads media for a WhatsApp message, using the Baileys adapter RPC.
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
        const { buffer, mimetype: parsedMimetype } = parseBase64DataUrl(rpcResponse?.dataUrl || '');
        const mimetype = rpcResponse?.mimetype || parsedMimetype || message?.mimetype || 'application/octet-stream';
        return { buffer, mimetype };
      } catch (err) {
        // Log detailed error information for debugging
        console.warn('[MediaDownload] RPC downloadMedia failed, falling back to getMediaBuffer:', err.message);
        console.warn('[MediaDownload] Message ID:', messageId);
        console.warn('[MediaDownload] Error details:', {
          error: err.message,
          type: err.name || 'Unknown',
          messageId: messageId
        });
      }
    }

    // Fallback to getMediaBuffer - note this uses the same underlying mechanism
    // but may provide a different code path in some implementations
    try {
      const { buffer, mimetype } = await client.getMediaBuffer(messageId);
      return {
        buffer,
        mimetype: mimetype || message?.mimetype || 'application/octet-stream'
      };
    } catch (fallbackErr) {
      // If both methods fail, provide detailed error to help diagnose the issue
      console.error('[MediaDownload] Both downloadMedia and getMediaBuffer failed!');
      console.error('[MediaDownload] Message ID:', messageId);
      console.error('[MediaDownload] Fallback error:', fallbackErr.message);
      
      // Throw a more descriptive error
      throw new Error(`media_download_failed: ${fallbackErr.message} (messageId: ${messageId})`);
    }
  }

  throw new Error('client_missing_media_support');
}

module.exports = {
  downloadMediaForMessage,
};
