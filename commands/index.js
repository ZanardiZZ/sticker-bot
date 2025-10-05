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

// Utilities
const validation = require('./validation');
const media = require('./media');

module.exports = {
  // Handlers
  handleRandomCommand,
  handleCountCommand,
  handleTop10Command,
  handleTop5UsersCommand,
  handleIdCommand,
  handleForceCommand,
  handleEditCommand,
  handleThemeCommand,
  
  // Utilities
  ...validation,
  ...media
};