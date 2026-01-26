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

// Periodic WAL checkpoint with timeout and failure tracking
let checkpointInterval = null;
let checkpointFailures = 0;
const MAX_CHECKPOINT_FAILURES = 3;
const CHECKPOINT_TIMEOUT = 10000; // 10 seconds

function startPeriodicCheckpoint() {
  if (checkpointInterval) {
    console.warn('[DB] Checkpoint interval already running');
    return;
  }

  checkpointInterval = setInterval(async () => {
    // Skip if database is closed
    if (dbHandler.isClosed) {
      stopPeriodicCheckpoint();
      return;
    }

    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Checkpoint timeout after 10s')), CHECKPOINT_TIMEOUT)
      );

      // Race between checkpoint and timeout
      await Promise.race([
        dbHandler.checkpointWAL(),
        timeoutPromise
      ]);

      checkpointFailures = 0; // Reset on success
      console.log('[DB] Periodic WAL checkpoint completed');
    } catch (error) {
      // Ignore errors if database is closed
      if (dbHandler.isClosed) {
        stopPeriodicCheckpoint();
        return;
      }

      checkpointFailures++;
      console.warn(`[DB] Periodic WAL checkpoint warning: ${error.message}`);

      if (checkpointFailures >= MAX_CHECKPOINT_FAILURES) {
        console.error('[DB] Too many checkpoint failures, stopping periodic checkpoint');
        stopPeriodicCheckpoint();
      }
    }
  }, 5 * 60 * 1000); // Every 5 minutes

  console.log('[DB] Started periodic WAL checkpoint');
}

function stopPeriodicCheckpoint() {
  if (checkpointInterval) {
    clearInterval(checkpointInterval);
    checkpointInterval = null;
    console.log('[DB] Stopped periodic WAL checkpoint');
  }
}

// Start checkpoint automatically
startPeriodicCheckpoint();

module.exports = { db, dbHandler, startPeriodicCheckpoint, stopPeriodicCheckpoint };