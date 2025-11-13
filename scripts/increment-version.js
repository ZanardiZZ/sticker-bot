#!/usr/bin/env node
/**
 * Script to increment bot version
 * 
 * Usage:
 *   node scripts/increment-version.js              # Auto-increment minor by 0.1
 *   node scripts/increment-version.js --set 1.0    # Set specific version
 *   node scripts/increment-version.js --check      # Check for version in recent commits
 * 
 * Version format: Uses decimal minor versions (0.5, 0.6, 0.7, etc.)
 * - Major.Minor format where minor increments by 1 each changelog
 * - Supports manual bump via commit messages: "bump: version X.Y" or "bump: X.Y"
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Database setup
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, '..', 'stickers.db');
const db = new sqlite3.Database(dbPath);

/**
 * Get current version from database
 */
function getCurrentVersion() {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM version_info WHERE is_current = 1 ORDER BY created_at DESC LIMIT 1',
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

/**
 * Set version in database
 * @param {number} major - Major version number
 * @param {number} minor - Minor version number
 * @param {string} createdBy - Who/what created this version
 * @param {string} description - Description of changes
 */
function setVersion(major, minor, createdBy = 'changelog-system', description = 'Auto-increment') {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Mark current version as not current
      db.run('UPDATE version_info SET is_current = 0 WHERE is_current = 1', (err) => {
        if (err) {
          reject(err);
          return;
        }

        const hiddenData = JSON.stringify({
          increment_type: 'minor',
          created_at: new Date().toISOString(),
          automated: createdBy === 'changelog-system'
        });

        // Insert new version
        db.run(
          `INSERT INTO version_info (major, minor, patch, created_by, description, hidden_data, is_current)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [major, minor, 0, createdBy, description, hiddenData, 1],
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });
    });
  });
}

/**
 * Initialize version table if needed
 */
function initializeVersionTable() {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS version_info (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        major INTEGER NOT NULL DEFAULT 1,
        minor INTEGER NOT NULL DEFAULT 0,
        patch INTEGER NOT NULL DEFAULT 0,
        pre_release TEXT,
        build_metadata TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
        created_by TEXT,
        description TEXT,
        hidden_data TEXT,
        is_current INTEGER DEFAULT 1
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Update package.json with new version
 */
function updatePackageJson(major, minor) {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageJson.version = `${major}.${minor}.0`;
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`[VERSION] Updated package.json to ${packageJson.version}`);
}

/**
 * Check recent commits for version bump instructions
 * Format: "bump: version X.Y" or "bump: X.Y"
 */
function checkCommitsForVersionBump() {
  try {
    // Check last 10 commits since last changelog
    const commits = execSync('git log -10 --pretty=format:"%s"', { encoding: 'utf8' }).split('\n');
    
    for (const commit of commits) {
      // Match patterns like "bump: version 1.0" or "bump: 1.0"
      const match = commit.match(/bump:\s*(?:version\s+)?(\d+)\.(\d+)/i);
      if (match) {
        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2], 10);
        console.log(`[VERSION] Found version bump in commit: "${commit}"`);
        return { major, minor, found: true, commit };
      }
    }
    return { found: false };
  } catch (error) {
    console.error('[VERSION] Error checking commits:', error.message);
    return { found: false };
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  
  try {
    // Initialize version table
    await initializeVersionTable();
    
    // Check for --check flag
    if (args.includes('--check')) {
      const result = checkCommitsForVersionBump();
      if (result.found) {
        console.log(`[VERSION] Bump instruction found: ${result.major}.${result.minor}`);
        process.exit(0);
      } else {
        console.log('[VERSION] No bump instruction found');
        process.exit(1);
      }
      return;
    }
    
    // Check if we should set a specific version
    const setIndex = args.indexOf('--set');
    if (setIndex !== -1 && args[setIndex + 1]) {
      const versionStr = args[setIndex + 1];
      const [major, minor] = versionStr.split('.').map(n => parseInt(n, 10));
      
      if (isNaN(major) || isNaN(minor)) {
        console.error('[VERSION] Invalid version format. Use: major.minor (e.g., 0.5)');
        process.exit(1);
      }
      
      await setVersion(major, minor, 'manual', `Manual version set to ${major}.${minor}`);
      updatePackageJson(major, minor);
      console.log(`[VERSION] Version set to ${major}.${minor}.0`);
      db.close();
      return;
    }
    
    // First, check commits for manual bump instructions
    const bumpCheck = checkCommitsForVersionBump();
    if (bumpCheck.found) {
      console.log(`[VERSION] Using version from commit: ${bumpCheck.major}.${bumpCheck.minor}`);
      await setVersion(bumpCheck.major, bumpCheck.minor, 'commit-instruction', `Version bump via commit: ${bumpCheck.commit}`);
      updatePackageJson(bumpCheck.major, bumpCheck.minor);
      console.log(`[VERSION] Version set to ${bumpCheck.major}.${bumpCheck.minor}.0 from commit instruction`);
      db.close();
      return;
    }
    
    // Auto-increment by 0.1 (minor version)
    const currentVersion = await getCurrentVersion();
    
    let newMajor, newMinor;
    if (!currentVersion) {
      // No version exists, initialize to 0.5
      newMajor = 0;
      newMinor = 5;
      console.log('[VERSION] No existing version, initializing to 0.5.0');
    } else {
      // Increment minor by 1 (represents 0.1 increment)
      newMajor = currentVersion.major;
      newMinor = currentVersion.minor + 1;
      console.log(`[VERSION] Auto-incrementing from ${currentVersion.major}.${currentVersion.minor} to ${newMajor}.${newMinor}`);
    }
    
    await setVersion(newMajor, newMinor);
    updatePackageJson(newMajor, newMinor);
    console.log(`[VERSION] ✓ Version incremented to ${newMajor}.${newMinor}.0`);
    
    db.close();
  } catch (error) {
    console.error('[VERSION] Error:', error);
    db.close();
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { getCurrentVersion, setVersion, checkCommitsForVersionBump };
