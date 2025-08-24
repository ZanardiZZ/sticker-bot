/**
 * Utility functions for normalizing commands to handle case and accent insensitivity
 */

/**
 * Remove accents and normalize text for command comparison
 * @param {string} text 
 * @returns {string}
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics/accents
    .trim();
}

/**
 * Check if a message body matches a command pattern (case/accent insensitive)
 * @param {string} messageBody 
 * @param {string} commandPattern 
 * @returns {boolean}
 */
function matchesCommand(messageBody, commandPattern) {
  if (!messageBody || !commandPattern) return false;
  
  const normalizedMessage = normalizeText(messageBody);
  const normalizedCommand = normalizeText(commandPattern);
  
  // For commands ending with ID, check if message starts with the pattern
  if (normalizedCommand.endsWith('id')) {
    return normalizedMessage.startsWith(normalizedCommand + ' ');
  }
  
  // For exact commands, check exact match or match with space
  return normalizedMessage === normalizedCommand || 
         normalizedMessage.startsWith(normalizedCommand + ' ');
}

/**
 * Parse command and extract parameters from message body
 * @param {string} messageBody 
 * @returns {object} {command, params}
 */
function parseCommand(messageBody) {
  if (!messageBody || !messageBody.startsWith('#')) {
    return { command: null, params: [] };
  }
  
  const parts = messageBody.trim().split(/\s+/);
  const command = normalizeText(parts[0]);
  const params = parts.slice(1);
  
  return { command, params };
}

module.exports = {
  normalizeText,
  matchesCommand,
  parseCommand
};