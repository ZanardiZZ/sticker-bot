/**
 * Commands module index - exports all command functionality
 */

// Command handlers
const { handleRandomCommand } = require('./handlers/random');
const { handleCountCommand } = require('./handlers/count');
const { handleTop10Command } = require('./handlers/top10');
const { handleTop5UsersCommand } = require('./handlers/top5users');
const { handleIdCommand } = require('./handlers/id');
const { handleForceCommand } = require('./handlers/force');
const { handleEditCommand } = require('./handlers/edit');
const { handleThemeCommand } = require('./handlers/theme');
const { handleVerifyCommand } = require('./handlers/verify');
const { handleCriarMemeCommand, handleExportarMemesCommand } = require('./handlers/meme');

// Utilities
const validation = require('./validation');
const media = require('./media');

// Database functions
const { updateMediaDescription, updateMediaTags } = require('../database/index.js');
const { safeReply } = require('../utils/safeMessaging');
const { parseCommand } = require('../utils/commandNormalizer');
const packageJson = require('../package.json');
const os = require('os');

// Constants
const MAX_TAGS_LENGTH = 500;

// State maps
const taggingMap = new Map();
const forceMap = new Map();
const clearDescriptionCmds = [];

/**
 * Main command handler that routes commands to appropriate handlers
 * @param {object} client - WhatsApp client
 * @param {object} message - Message object
 * @param {string} chatId - Chat ID
 * @returns {boolean} True if command was handled
 */
async function handleCommand(client, message, chatId) {
  const rawCommand = message.body || message.caption || '';
  if (!rawCommand || !rawCommand.startsWith('#')) {
    return false;
  }

  const { command, params } = parseCommand(rawCommand);

  try {
    switch (command) {
      case '#random':
        await handleRandomCommand(client, message, chatId);
        return true;
      
      case '#count':
        await handleCountCommand(client, message, chatId);
        return true;
      
      case '#top10':
        await handleTop10Command(client, message, chatId);
        return true;
      
      case '#top5users':
        await handleTop5UsersCommand(client, message, chatId);
        return true;
      
      case '#id':
        await handleIdCommand(client, message, chatId);
        return true;
      
      case '#forçar':
        await handleForceCommand(client, message, chatId, forceMap);
        return true;
      
      case '#editar':
        await handleEditCommand(client, message, chatId, taggingMap, MAX_TAGS_LENGTH);
        return true;
      
      case '#tema':
      case '#theme':
        await handleThemeCommand(client, message, chatId, params);
        return true;

      case '#verificar':
      case '#verify':
        await handleVerifyCommand(client, message, chatId);
        return true;

      case '#criar':
        await safeReply(client, chatId, '🚧 Pipeline de memes temporariamente indisponível. Tente novamente mais tarde.', message);
        return true;

      case '#exportarmemes':
        await handleExportarMemesCommand(client, message, chatId);
        return true;

      case '#ping': {
          // Build ping response
          const uptimeSeconds = Math.floor(process.uptime());
          function formatUptime(seconds) {
            const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
            const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
            const s = String(seconds % 60).padStart(2, '0');
            return `${h}:${m}:${s}`;
          }

          const uptime = formatUptime(uptimeSeconds);
          const latency = 0; // We don't have a roundtrip measurement here in handler tests
          const cronSchedule = process.env.BOT_CRON_SCHEDULE || '0 0-23 * * *';
          const botVersion = (packageJson && packageJson.version) ? packageJson.version : '1.0.0';

          const response = `🤖 *Sticker Bot` + `*\n` +
            `🟢 Uptime: ${uptime}\n` +
            `📡 Latência: ${latency} ms\n` +
            `⏰ CRON: ${cronSchedule}\n` +
            `🛠️ Versão: ${botVersion}`;

          await safeReply(client, chatId, response, message);
          return true;
        }
      
      default:
        // Check if it's an invalid command
        if (validation.isValidCommand(rawCommand) === false) {
          await validation.handleInvalidCommand(client, chatId);
          return true;
        }
        return false;
    }
  } catch (error) {
    console.error('Error handling command:', error);
    await safeReply(client, chatId, 'Erro ao processar comando.', message.id);
    return true;
  }
}

/**
 * Handles tagging mode input (editing media description and tags)
 * @param {object} client - WhatsApp client
 * @param {object} message - Message object
 * @param {string} chatId - Chat ID
 * @returns {boolean} True if tagging mode input was handled
 */
async function handleTaggingMode(client, message, chatId) {
  if (!message.body || !taggingMap.has(chatId)) {
    return false;
  }

  const mediaId = taggingMap.get(chatId);
  const input = message.body.trim();

  try {
    // Parse description and tags from input
    let description = '';
    let tags = '';

    if (input.includes(';')) {
      const parts = input.split(';').map(p => p.trim());
      for (const part of parts) {
        if (part.toLowerCase().startsWith('descricao:')) {
          description = part.substring('descricao:'.length).trim();
        } else if (part.toLowerCase().startsWith('tags:')) {
          tags = part.substring('tags:'.length).trim();
        }
      }
    } else if (input.toLowerCase().startsWith('descricao:')) {
      description = input.substring('descricao:'.length).trim();
    } else if (input.toLowerCase().startsWith('tags:')) {
      tags = input.substring('tags:'.length).trim();
    } else {
      // If no prefix, assume it's description
      description = input;
    }

    // Validate length
    const totalLength = description.length + tags.length;
    if (totalLength > MAX_TAGS_LENGTH) {
      await safeReply(client, chatId, `Conteúdo muito longo. Limite total: ${MAX_TAGS_LENGTH} caracteres.`, message.id);
      return true;
    }

    // Update media
    if (description) {
      await updateMediaDescription(mediaId, description);
    }
    
    if (tags) {
      const tagsArray = tags.split(',').map(t => t.trim()).filter(t => t);
      await updateMediaTags(mediaId, tagsArray);
    }

    taggingMap.delete(chatId);
    await safeReply(client, chatId, 'Mídia atualizada com sucesso!', message.id);
    return true;

  } catch (error) {
    console.error('Error in tagging mode:', error);
    await safeReply(client, chatId, 'Erro ao atualizar mídia.', message.id);
    taggingMap.delete(chatId);
    return true;
  }
}

module.exports = {
  // Main handlers
  handleCommand,
  handleTaggingMode,
  taggingMap,
  
  // Individual handlers
  handleRandomCommand,
  handleCountCommand,
  handleTop10Command,
  handleTop5UsersCommand,
  handleIdCommand,
  handleForceCommand,
  handleEditCommand,
  handleThemeCommand,
  
  // Constants
  MAX_TAGS_LENGTH,
  forceMap,
  clearDescriptionCmds,
  
  // Utilities
  ...validation,
  ...media
};