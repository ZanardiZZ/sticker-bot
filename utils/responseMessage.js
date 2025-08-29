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
  let responseMessage = '';
  
  // Check for GIF first (either actual GIF mimetype or GIF-like video)
  if (mimetypeToSave === 'image/gif' || isGifLike) {
    responseMessage = `🎞️ GIF adicionado!\n\n`;
  } else if (mimetypeToSave.startsWith('video/')) {
    responseMessage = `🎥 Vídeo adicionado!\n\n`;
  } else if (mimetypeToSave.startsWith('audio/')) {
    responseMessage = `🎵 Áudio adicionado!\n\n`;
  } else {
    responseMessage = `✅ Figurinha adicionada!\n\n`;
  }
  
  return responseMessage;
}

module.exports = {
  generateResponseMessage
};