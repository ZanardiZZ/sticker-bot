/**
 * Tag utilities - shared functions for tag manipulation
 */

/**
 * Normalizes a comma-separated tag string into an array of clean tag names
 * @param {string} tagsString - Comma-separated tags (e.g. "meme, funny, cat")
 * @returns {string[]} Array of normalized tag names
 */
function normalizeTagList(tagsString) {
  if (!tagsString || typeof tagsString !== 'string') {
    return [];
  }

  return tagsString
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(t => t && t.length > 0);
}

module.exports = {
  normalizeTagList
};
