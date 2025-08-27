/**
 * Database connection and initialization
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const DatabaseHandler = require('../services/databaseHandler');

const dbPath = path.resolve(__dirname, '..', 'media.db');
const db = new sqlite3.Database(dbPath);

// Initialize enhanced database handler
const dbHandler = new DatabaseHandler(db);

// Handle WAL recovery on startup
const walPath = path.resolve(__dirname, '..', 'media.db-wal');
const dbExists = fs.existsSync(dbPath);
const walExists = fs.existsSync(walPath);

if (walExists && (!dbExists || fs.statSync(walPath).size > 0)) {
  console.log('[DB] WAL file detected, performing recovery checkpoint...');
  // Ensure WAL data is committed to main database
  setTimeout(async () => {
    try {
      await dbHandler.checkpointWAL();
      console.log('[DB] WAL checkpoint completed successfully');
    } catch (error) {
      console.error('[DB] WAL checkpoint failed:', error);
    }
  }, 100); // Small delay to ensure DB is ready
}

// Set up periodic WAL checkpoints to prevent data loss
setInterval(async () => {
  try {
    await dbHandler.checkpointWAL();
    console.log('[DB] Periodic WAL checkpoint completed');
  } catch (error) {
    console.warn('[DB] Periodic WAL checkpoint warning:', error.message);
  }
}, 5 * 60 * 1000); // Every 5 minutes

module.exports = { db, dbHandler };