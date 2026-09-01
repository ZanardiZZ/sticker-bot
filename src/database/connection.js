/**
 * Database connection and initialization
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const DatabaseHandler = require('../services/databaseHandler');
const { DB_PATH, DB_WAL_PATH } = require('../paths');

const dbPath = DB_PATH;
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new sqlite3.Database(dbPath);

// Initialize enhanced database handler
const dbHandler = new DatabaseHandler(db);

// Handle WAL recovery on startup
const walPath = DB_WAL_PATH;
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

// Automatic WAL checkpoints are handled by SQLite via wal_autocheckpoint.
// Aggressive periodic TRUNCATE checkpoints were removed because multiple
// long-lived processes share this database and TRUNCATE competes with writers.
function startPeriodicCheckpoint() {
  console.log('[DB] Periodic WAL checkpoint disabled; SQLite autocheckpoint remains active');
}

function stopPeriodicCheckpoint() {
  // Kept as a no-op for shutdown/test compatibility.
}

// Start checkpoint automatically in long-lived runtime processes only.
if (process.env.NODE_ENV !== 'test' && process.env.STICKERBOT_DISABLE_PERIODIC_CHECKPOINT !== '1') {
  startPeriodicCheckpoint();
}

module.exports = { db, dbHandler, startPeriodicCheckpoint, stopPeriodicCheckpoint };
