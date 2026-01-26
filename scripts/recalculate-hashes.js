/**
 * Script to recalculate and fix outdated/corrupted hashes
 *
 * This script:
 * 1. Scans all media in database
 * 2. Validates hash integrity (compares file hash vs DB hash)
 * 3. Recalculates hashes for files that have been modified
 * 4. Generates detailed report
 *
 * Usage:
 *   node scripts/recalculate-hashes.js [--dry-run] [--limit N]
 *
 * Options:
 *   --dry-run: Check without updating database
 *   --limit N: Only process first N records
 */

require('dotenv').config();
const fs = require('fs');
const { dbHandler } = require('../database/connection');
const {
  validateHashIntegrity,
  recalculateHashForMedia,
  isValidHash,
  isDegenerateHash
} = require('../database/utils');

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : null;

  console.log('🔍 Hash Recalculation Script');
  console.log('=============================');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will update DB)'}`);
  if (limit) console.log(`Limit: ${limit} records`);
  console.log('');

  // Statistics
  const stats = {
    total: 0,
    checked: 0,
    fileNotFound: 0,
    md5Mismatch: 0,
    visualHashMismatch: 0,
    invalidVisualHash: 0,
    degenerateVisualHash: 0,
    updated: 0,
    errors: 0
  };

  const details = {
    md5Mismatches: [],
    visualHashMismatches: [],
    invalidHashes: [],
    degenerateHashes: [],
    fileNotFound: []
  };

  try {
    // Get all media with files
    const sql = limit
      ? 'SELECT id, file_path, hash_md5, hash_visual, mimetype FROM media ORDER BY id DESC LIMIT ?'
      : 'SELECT id, file_path, hash_md5, hash_visual, mimetype FROM media ORDER BY id DESC';

    const params = limit ? [limit] : [];
    const allMedia = await dbHandler.all(sql, params);
    stats.total = allMedia.length;

    console.log(`Found ${stats.total} media records to check\n`);

    // Process each media
    for (let i = 0; i < allMedia.length; i++) {
      const media = allMedia[i];
      const progress = `[${i + 1}/${stats.total}]`;

      process.stdout.write(`\r${progress} Checking media ${media.id}...    `);

      stats.checked++;

      // Check if file exists
      if (!fs.existsSync(media.file_path)) {
        stats.fileNotFound++;
        details.fileNotFound.push({
          id: media.id,
          file_path: media.file_path
        });
        continue;
      }

      // Validate visual hash format
      if (media.hash_visual) {
        if (!isValidHash(media.hash_visual)) {
          stats.invalidVisualHash++;
          details.invalidHashes.push({
            id: media.id,
            hash: media.hash_visual,
            reason: 'Invalid format or size'
          });
        } else if (isDegenerateHash(media.hash_visual)) {
          stats.degenerateVisualHash++;
          details.degenerateHashes.push({
            id: media.id,
            hash: media.hash_visual
          });
        }
      }

      // Validate hash integrity
      const integrity = await validateHashIntegrity(
        media.file_path,
        media.hash_md5,
        media.hash_visual
      );

      let needsUpdate = false;

      if (integrity.md5Match === false) {
        stats.md5Mismatch++;
        details.md5Mismatches.push({
          id: media.id,
          file_path: media.file_path,
          oldHash: media.hash_md5,
          newHash: integrity.fileHashMd5
        });
        needsUpdate = true;
      }

      if (integrity.visualHashMatch === false) {
        stats.visualHashMismatch++;
        details.visualHashMismatches.push({
          id: media.id,
          file_path: media.file_path,
          oldHash: media.hash_visual,
          newHash: integrity.fileHashVisual
        });
        needsUpdate = true;
      }

      // Recalculate if needed
      if (needsUpdate) {
        try {
          const result = await recalculateHashForMedia(
            media.id,
            media.file_path,
            dryRun
          );

          if (result.updated) {
            stats.updated++;
          }

          if (result.errors.length > 0) {
            stats.errors++;
          }
        } catch (err) {
          stats.errors++;
          console.error(`\n❌ Error recalculating media ${media.id}:`, err.message);
        }
      }
    }

    // Clear progress line
    process.stdout.write('\r' + ' '.repeat(80) + '\r');

    // Print report
    console.log('\n📊 Hash Integrity Report');
    console.log('========================\n');
    console.log(`Total media checked: ${stats.checked}/${stats.total}`);
    console.log(`File not found: ${stats.fileNotFound}`);
    console.log(`MD5 mismatches: ${stats.md5Mismatch}`);
    console.log(`Visual hash mismatches: ${stats.visualHashMismatch}`);
    console.log(`Invalid visual hashes: ${stats.invalidVisualHash}`);
    console.log(`Degenerate visual hashes: ${stats.degenerateVisualHash}`);
    console.log(`Records ${dryRun ? 'that would be' : ''} updated: ${stats.updated}`);
    console.log(`Errors: ${stats.errors}\n`);

    // Show details if there are issues
    if (details.md5Mismatches.length > 0) {
      console.log('\n⚠️  MD5 Mismatches (file modified after save):');
      details.md5Mismatches.slice(0, 10).forEach(item => {
        console.log(`  - Media ${item.id}: ${item.file_path}`);
        console.log(`    Old: ${item.oldHash}`);
        console.log(`    New: ${item.newHash}`);
      });
      if (details.md5Mismatches.length > 10) {
        console.log(`  ... and ${details.md5Mismatches.length - 10} more`);
      }
    }

    if (details.visualHashMismatches.length > 0) {
      console.log('\n⚠️  Visual Hash Mismatches (file modified after save):');
      details.visualHashMismatches.slice(0, 10).forEach(item => {
        console.log(`  - Media ${item.id}: ${item.file_path}`);
        console.log(`    Old: ${item.oldHash?.slice(0, 32)}...`);
        console.log(`    New: ${item.newHash?.slice(0, 32)}...`);
      });
      if (details.visualHashMismatches.length > 10) {
        console.log(`  ... and ${details.visualHashMismatches.length - 10} more`);
      }
    }

    if (details.invalidHashes.length > 0) {
      console.log('\n⚠️  Invalid Visual Hashes:');
      details.invalidHashes.slice(0, 10).forEach(item => {
        console.log(`  - Media ${item.id}: ${item.hash?.slice(0, 32)}... (${item.reason})`);
      });
      if (details.invalidHashes.length > 10) {
        console.log(`  ... and ${details.invalidHashes.length - 10} more`);
      }
    }

    if (details.degenerateHashes.length > 0) {
      console.log('\n⚠️  Degenerate Visual Hashes (may cause false positives):');
      details.degenerateHashes.slice(0, 10).forEach(item => {
        console.log(`  - Media ${item.id}: ${item.hash?.slice(0, 32)}...`);
      });
      if (details.degenerateHashes.length > 10) {
        console.log(`  ... and ${details.degenerateHashes.length - 10} more`);
      }
    }

    if (details.fileNotFound.length > 0) {
      console.log('\n⚠️  Files Not Found:');
      details.fileNotFound.slice(0, 10).forEach(item => {
        console.log(`  - Media ${item.id}: ${item.file_path}`);
      });
      if (details.fileNotFound.length > 10) {
        console.log(`  ... and ${details.fileNotFound.length - 10} more`);
      }
    }

    console.log('');

    if (dryRun && (stats.md5Mismatch > 0 || stats.visualHashMismatch > 0)) {
      console.log('💡 To fix these issues, run without --dry-run flag');
    }

    if (!dryRun && stats.updated > 0) {
      console.log('✅ Hashes updated successfully!');
    }

    if (stats.fileNotFound > 0) {
      console.log('⚠️  Some files are missing from disk - consider cleanup');
    }

    if (stats.errors > 0) {
      console.log('❌ Some errors occurred during recalculation');
    }

  } catch (err) {
    console.error('❌ Fatal error:', err);
    await dbHandler.close();
    process.exit(1);
  }

  // Close database properly
  try {
    await dbHandler.close();
  } catch (closeErr) {
    console.warn('Warning: Database close error:', closeErr.message);
  }

  console.log('\n✅ Hash recalculation completed');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Unhandled error:', err);
  process.exit(1);
});
