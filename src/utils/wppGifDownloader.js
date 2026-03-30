/**
 * Custom GIF downloader for WPPConnect
 *
 * WPPConnect's downloadMedia() returns only a thumbnail (JPEG) for GIFs.
 * This module implements proper GIF video download using WhatsApp's media encryption.
 *
 * Based on Baileys' approach to downloading encrypted media.
 */

const axios = require('axios');
const crypto = require('crypto');

/**
 * Download and decrypt WhatsApp media
 * @param {object} message - WPPConnect message object
 * @returns {Promise<Buffer>} - Decrypted media buffer
 */
async function downloadEncryptedMedia(message) {
  // PRIORITY 1: Try deprecatedMms3Url first (may contain full MP4 for GIFs)
  if (message.deprecatedMms3Url) {
    console.log('[WPPGifDownloader] Attempting download from deprecatedMms3Url...');
    try {
      const response = await axios.get(message.deprecatedMms3Url, {
        responseType: 'arraybuffer',
        timeout: 30000
      });

      const downloadedData = Buffer.from(response.data);
      console.log('[WPPGifDownloader] Downloaded from deprecatedMms3Url:', downloadedData.length, 'bytes');

      // Check if this is actually MP4 (not JPEG)
      const header = downloadedData.slice(0, 12).toString('hex');
      const isMP4 = header.includes('66747970') || // 'ftyp' box
                    header.slice(8, 16) === '66747970'; // ftyp at offset 4
      const isJPEG = header.slice(0, 6) === 'ffd8ff'; // JPEG signature

      console.log('[WPPGifDownloader] File signature check:', {
        headerHex: header,
        isMP4,
        isJPEG
      });

      if (isMP4) {
        console.log('[WPPGifDownloader] ✓ deprecatedMms3Url returned valid MP4! Using it.');
        return downloadedData;
      } else {
        console.warn('[WPPGifDownloader] deprecatedMms3Url returned non-MP4 data, falling back to encrypted download');
      }
    } catch (err) {
      console.warn('[WPPGifDownloader] deprecatedMms3Url download failed:', err.message);
    }
  }

  // FALLBACK: Use encrypted download with directPath
  if (!message.directPath) {
    throw new Error('Message is missing directPath - cannot download media');
  }

  if (!message.mediaKey) {
    throw new Error('Message is missing mediaKey - cannot decrypt media');
  }

  // WhatsApp CDN URL
  const mediaUrl = `https://mmg.whatsapp.net${message.directPath}`;

  console.log('[WPPGifDownloader] Downloading from directPath:', mediaUrl.substring(0, 80) + '...');

  // Download encrypted media from WhatsApp CDN
  const response = await axios.get(mediaUrl, {
    responseType: 'arraybuffer',
    timeout: 30000
  });

  const encryptedMedia = Buffer.from(response.data);
  console.log('[WPPGifDownloader] Downloaded encrypted media:', encryptedMedia.length, 'bytes');

  // Decrypt using mediaKey
  const mediaKeyBuffer = Buffer.from(message.mediaKey, 'base64');
  const decrypted = await decryptMedia(encryptedMedia, mediaKeyBuffer, getMediaType(message));

  console.log('[WPPGifDownloader] Decrypted media:', decrypted.length, 'bytes');

  return decrypted;
}

/**
 * Decrypt WhatsApp media using AES-CBC
 * Based on WhatsApp's media encryption protocol
 */
async function decryptMedia(encryptedBuffer, mediaKey, mediaType) {
  // WhatsApp uses HKDF to derive encryption keys from mediaKey
  const mediaKeyExpanded = hkdfExpand(mediaKey, 112, getMediaInfo(mediaType));

  const iv = mediaKeyExpanded.slice(0, 16);
  const cipherKey = mediaKeyExpanded.slice(16, 48);
  const macKey = mediaKeyExpanded.slice(48, 80);

  // Verify MAC (last 10 bytes of encrypted data)
  const encData = encryptedBuffer.slice(0, -10);
  const mac = encryptedBuffer.slice(-10);

  const hmac = crypto.createHmac('sha256', macKey);
  hmac.update(iv);
  hmac.update(encData);
  const calculatedMac = hmac.digest().slice(0, 10);

  if (!calculatedMac.equals(mac)) {
    throw new Error('MAC verification failed - corrupted media or wrong key');
  }

  // Decrypt with AES-256-CBC
  const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
  const decrypted = Buffer.concat([
    decipher.update(encData),
    decipher.final()
  ]);

  return decrypted;
}

/**
 * HKDF (HMAC-based Key Derivation Function) implementation per RFC 5869
 */
function hkdfExpand(key, length, info) {
  // Extract step: derive PRK from input key material
  // RFC 5869: if salt not provided, use a string of HashLen zeros
  const prk = crypto.createHmac('sha256', Buffer.alloc(32)).update(key).digest();

  // Expand step
  const iterations = Math.ceil(length / 32);
  let result = Buffer.alloc(0);
  let previous = Buffer.alloc(0);

  for (let i = 1; i <= iterations; i++) {
    const hmac = crypto.createHmac('sha256', prk);
    hmac.update(previous);
    hmac.update(info);
    hmac.update(Buffer.from([i]));
    previous = hmac.digest();
    result = Buffer.concat([result, previous]);
  }

  return result.slice(0, length);
}

/**
 * Get media type info bytes for HKDF
 */
function getMediaInfo(mediaType) {
  const types = {
    'image': 'WhatsApp Image Keys',
    'video': 'WhatsApp Video Keys',
    'audio': 'WhatsApp Audio Keys',
    'document': 'WhatsApp Document Keys',
    'sticker': 'WhatsApp Image Keys'
  };

  return Buffer.from(types[mediaType] || 'WhatsApp Video Keys', 'utf-8');
}

/**
 * Determine media type from message
 */
function getMediaType(message) {
  if (message.isGif) return 'video';
  if (message.type === 'video') return 'video';
  if (message.type === 'image') return 'image';
  if (message.type === 'audio' || message.type === 'ptt') return 'audio';
  if (message.type === 'document') return 'document';
  if (message.type === 'sticker') return 'sticker';
  return 'video'; // default for GIFs
}

module.exports = {
  downloadEncryptedMedia
};
