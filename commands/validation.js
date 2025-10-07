/**
 * Command validation utilities
 */

const { normalizeText } = require('../utils/commandNormalizer');

/**
 * List of valid commands
 */
const VALID_COMMANDS = [
  '#random',
  '#editar',
  '#editar ID', 
  '#top10',
  '#top5users',
  '#ID',
  '#forçar',
  '#count',
  '#tema',
  '#theme',
  '#verificar',
  '#verify',
  '#ping'
];

/**
 * Checks if a message is a valid command
 * @param {string} messageBody - Message text
 * @returns {boolean} True if valid command
 */
function isValidCommand(messageBody) {
  if (!messageBody.startsWith('#')) return true; // não é comando

  const normalizedMessage = normalizeText(messageBody);
  
  const isValid = VALID_COMMANDS.some(cmd => {
    const normalizedCmd = normalizeText(cmd);
    if (normalizedCmd.endsWith('id')) {
      return normalizedMessage.startsWith(normalizedCmd + ' ');
    }
    return normalizedMessage === normalizedCmd || normalizedMessage.startsWith(normalizedCmd + ' ');
  });

  return isValid;
}

/**
 * Sends invalid command message
 * @param {object} client - WhatsApp client
 * @param {string} chatId - Chat ID
 */
async function handleInvalidCommand(client, chatId) {
  await client.sendText(chatId,
    `Comando não reconhecido.\nComandos disponíveis:\n` +
    VALID_COMMANDS.join('\n')
  );
}

/**
 * Cleans description and tags from AI-generated bad phrases
 * @param {string} description - Description text
 * @param {string} tags - Tags text
 * @returns {object} Cleaned description and tags
 */
function cleanDescriptionTags(description, tags) {
  const badPhrases = [
    'desculpe',
    'não posso ajudar',
    'não disponível',
    'sem descrição',
    'audio salvo sem descrição ai'
  ];
  
  let cleanDesc = description ? description.toLowerCase() : '';
  if (badPhrases.some(phrase => cleanDesc.includes(phrase))) {
    cleanDesc = '';
  } else {
    cleanDesc = description || '';
  }
  
  let cleanTags = tags ? tags.toLowerCase() : '';
  if (badPhrases.some(phrase => cleanTags.includes(phrase))) {
    cleanTags = '';
  } else {
    cleanTags = tags || '';
  }
  
  return { description: cleanDesc, tags: cleanTags };
}

module.exports = {
  VALID_COMMANDS,
  isValidCommand,
  handleInvalidCommand,
  cleanDescriptionTags
};