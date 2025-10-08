#!/usr/bin/env node
/**
 * Periodic cleanup script for media entries whose files are missing on disk.
 *
 * Usage:
 *   node scripts/cleanup-missing-media.js --dry-run   # only report
 *   node scripts/cleanup-missing-media.js             # delete orphan rows (prompts)
 *   node scripts/cleanup-missing-media.js --force     # delete without prompt
 */

try {
  require('dotenv').config();
} catch (err) {
  // Dotenv is optional.
}

const fs = require('fs');
const readline = require('readline');
const { db } = require('../database');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const FORCE = argv.includes('--force');

function queryAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function exec(err) {
      if (err) reject(err);
      else resolve(this.changes || 0);
    });
  });
}

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function main() {
  console.log('=== Cleanup: media entries with missing files ===');
  if (DRY_RUN) {
    console.log('Running in DRY-RUN mode (no changes will be made).');
  }

  const rows = await queryAll(`
    SELECT id, file_path, mimetype, description
    FROM media
    ORDER BY id ASC
  `);

  if (!rows.length) {
    console.log('Media table is empty. Nothing to do.');
    return;
  }

  const missing = rows.filter((row) => {
    if (!row.file_path) return true;
    try {
      return !fs.existsSync(row.file_path);
    } catch (err) {
      console.warn(`[cleanup] Failed to stat ${row.file_path}:`, err.message);
      return true;
    }
  });

  if (!missing.length) {
    console.log('✅ All media files are present. No cleanup required.');
    return;
  }

  console.log(`⚠️  Found ${missing.length} media entries whose files are missing.`);
  if (DRY_RUN) {
    missing.slice(0, 20).forEach((row) => {
      console.log(` - ID ${row.id} | ${row.mimetype} | ${row.file_path}`);
    });
    if (missing.length > 20) {
      console.log(`   ...and ${missing.length - 20} more.`);
    }
    console.log('\nRe-run without --dry-run (and optionally with --force) to remove them.');
    return;
  }

  if (!FORCE) {
    const answer = await prompt('Delete these records from the database? (yes/no): ');
    if (!['y', 'yes'].includes(answer)) {
      console.log('Aborted. No changes were made.');
      return;
    }
  }

  let deleted = 0;
  for (const row of missing) {
    try {
      await run('DELETE FROM media_tags WHERE media_id = ?', [row.id]);
      const changes = await run('DELETE FROM media WHERE id = ?', [row.id]);
      deleted += changes;
      console.log(`🗑️  Removed media ID ${row.id} (missing file: ${row.file_path || 'n/a'})`);
    } catch (err) {
      console.error(`❌ Failed to delete media ID ${row.id}:`, err.message);
    }
  }

  console.log(`\nCleanup complete. Deleted ${deleted} media records.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Cleanup failed:', err);
    process.exit(1);
  });

