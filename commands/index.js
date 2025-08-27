/**
 * Commands module index - exports all command functionality
 */

// Command handlers
const { handleRandomCommand } = require('./handlers/random');
const { handleCountCommand } = require('./handlers/count');
const { handleTop10Command } = require('./handlers/top10');

// Utilities
const validation = require('./validation');
const media = require('./media');

// TODO: Add remaining handlers:
// - handleEditCommand
// - handleIdCommand  
// - handleTop5UsersCommand
// - handleForceCommand

module.exports = {
  // Handlers
  handleRandomCommand,
  handleCountCommand,
  handleTop10Command,
  
  // Utilities
  ...validation,
  ...media
  
  // Legacy - TODO: move remaining functions from original commands.js
};