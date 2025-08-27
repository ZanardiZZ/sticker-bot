#!/usr/bin/env node

/**
 * Database WAL Recovery Utility
 * 
 * This script recovers data from a SQLite WAL file by performing a checkpoint
 * operation that commits the WAL data to the main database file.
 * 
 * Usage: node scripts/recover-wal-database.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../media.db');
const walPath = path.resolve(__dirname, '../media.db-wal');

console.log('=== Database WAL Recovery Utility ===');

// Check if files exist
const dbExists = fs.existsSync(dbPath);
const walExists = fs.existsSync(walPath);

console.log(`Database file (${dbPath}): ${dbExists ? 'EXISTS' : 'NOT FOUND'}`);
console.log(`WAL file (${walPath}): ${walExists ? 'EXISTS' : 'NOT FOUND'}`);

if (walExists) {
  const walSize = fs.statSync(walPath).size;
  console.log(`WAL file size: ${(walSize / 1024).toFixed(2)} KB`);
  
  if (walSize === 0) {
    console.log('WAL file is empty, no recovery needed.');
    process.exit(0);
  }
} else {
  console.log('No WAL file found, no recovery needed.');
  process.exit(0);
}

// Open database connection
console.log('\nOpening database connection...');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open database:', err);
    process.exit(1);
  }
});

// Perform WAL checkpoint
console.log('Performing WAL checkpoint...');

db.run('PRAGMA wal_checkpoint(TRUNCATE)', function(err) {
  if (err) {
    console.error('WAL checkpoint failed:', err);
    db.close();
    process.exit(1);
  }
  
  console.log('WAL checkpoint completed successfully');
  
  // Check if WAL file was cleared
  if (fs.existsSync(walPath)) {
    const newWalSize = fs.statSync(walPath).size;
    console.log(`WAL file size after checkpoint: ${newWalSize} bytes`);
    
    if (newWalSize === 0) {
      console.log('✅ WAL file successfully cleared - data committed to main database');
    } else {
      console.log('⚠️  WAL file still contains data - checkpoint may have been partial');
    }
  } else {
    console.log('✅ WAL file removed - data committed to main database');
  }
  
  // Get record counts to verify data
  db.get('SELECT COUNT(*) as count FROM media', (err, row) => {
    if (err) {
      console.warn('Could not count media records:', err.message);
    } else {
      console.log(`Media records in database: ${row.count}`);
    }
    
    db.close(() => {
      console.log('\n🎉 Database recovery completed successfully!');
      console.log('Your data should now be accessible in the main database file.');
    });
  });
});