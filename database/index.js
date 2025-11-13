/**
 * Database module index - exports all database functionality
 */

// Connection and setup
const { db, dbHandler } = require('./connection');
const { initializeTables } = require('./migrations/schema');

// Initialize media queue
const MediaQueue = require('../services/mediaQueue');
const mediaQueue = new MediaQueue({ 
  concurrency: 3, 
  retryAttempts: 5, 
  retryDelay: 1000 
});

// Models
const mediaModel = require('./models/media');
const tagsModel = require('./models/tags');
const contactsModel = require('./models/contacts');
const duplicatesModel = require('./models/duplicates');
const maintenanceModel = require('./models/maintenance');
const processingModel = require('./models/processing');
const versionModel = require('./models/version');
const lidMappingModel = require('./models/lidMapping');
const deleteRequestsModel = require('./models/deleteRequests');
const configModel = require('./models/config');
const commandUsageModel = require('./models/commandUsage');
const packsModel = require('./models/packs');

// Utilities
const utils = require('./utils');

// Initialize database
(async () => {
  try {
    await initializeTables(db);
    console.log('[DB] Database initialization completed');
    
    // Initialize version system if needed
    await versionModel.initializeVersion();
    const currentVersion = await versionModel.getCurrentVersionString();
    console.log(`[DB] Version system initialized - Current version: ${currentVersion}`);
  } catch (error) {
    console.error('[DB] Database initialization failed:', error);
  }
})();

// Export all database functionality
module.exports = {
  // Connection and handlers
  db,
  dbHandler,
  mediaQueue,
  
  // Media operations
  ...mediaModel,
  
  // Tag operations
  ...tagsModel,
  
  // Contact operations
  ...contactsModel,
  
  // Duplicate management operations
  ...duplicatesModel,
  
  // Maintenance and migration operations
  ...maintenanceModel,
  
  // Media processing operations
  ...processingModel,
  
  // Version operations
  ...versionModel,
  
  // LID mapping operations
  ...lidMappingModel,

  // Delete vote requests
  ...deleteRequestsModel,

  // Bot configuration
  ...configModel,

  // Command usage analytics
  ...commandUsageModel,

  // Sticker packs operations
  ...packsModel,

  // Utilities
  ...utils
};
