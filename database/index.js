/**
 * Database module index - exports all database functionality
 */

// Connection and setup
const { db, dbHandler } = require('./connection');
const { initializeTables } = require('./migrations/schema');

// Models
const mediaModel = require('./models/media');
const tagsModel = require('./models/tags');
const contactsModel = require('./models/contacts');

// Utilities
const utils = require('./utils');

// Initialize database
(async () => {
  try {
    await initializeTables(db);
    console.log('[DB] Database initialization completed');
  } catch (error) {
    console.error('[DB] Database initialization failed:', error);
  }
})();

// Export all database functionality
module.exports = {
  // Connection and handlers
  db,
  dbHandler,
  
  // Media operations
  ...mediaModel,
  
  // Tag operations
  ...tagsModel,
  
  // Contact operations
  ...contactsModel,
  
  // Utilities
  ...utils
  
  // TODO: Move remaining functions from original database.js:
  // - processWebpWithRepair
  // - processOldStickers
  // - findSimilarTags
  // - Various other functions that need to be migrated
  // These will be added after the original database.js is refactored
};