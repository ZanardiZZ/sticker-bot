/**
 * Utility functions for generating response messages based on media type
 */

/**
 * Generate response message based on media type and GIF detection
 * @param {string} mimetypeToSave - The mimetype of the saved media
 * @param {boolean} isGifLike - Whether the media is detected as GIF-like (for videos that are actually GIFs)
 * @returns {string} The appropriate response message
 */
function generateResponseMessage(mimetypeToSave, isGifLike = false) {
  // Check for GIF first (either actual GIF mimetype or GIF-like video)
  if (mimetypeToSave === 'image/gif' || isGifLike) {
    return `🎞️ GIF adicionado!\n\n`;
  } else if (mimetypeToSave.startsWith('video/')) {
    return `🎥 Vídeo adicionado!\n\n`;
  } else if (mimetypeToSave.startsWith('audio/')) {
    return `🎵 Áudio adicionado!\n\n`;
  } else {
    return `✅ Figurinha adicionada!\n\n`;
  }
}

module.exports = {
  generateResponseMessage
};