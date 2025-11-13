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
 * - Major.Minor.Patch format where minor increments by 1 each changelog
 * - Supports manual bump via commit messages: "bump: version X.Y" or "bump: X.Y"
 * - Supports patch-only updates via commit keyword: "patch" (increments only patch version)
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
 * @param {number} patch - Patch version number
 * @param {string} createdBy - Who/what created this version
 * @param {string} description - Description of changes
 * @param {string} incrementType - Type of increment (minor, patch, manual)
 */
function setVersion(major, minor, patch = 0, createdBy = 'changelog-system', description = 'Auto-increment', incrementType = 'minor') {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Mark current version as not current
      db.run('UPDATE version_info SET is_current = 0 WHERE is_current = 1', (err) => {
        if (err) {
          reject(err);
          return;
        }

        const hiddenData = JSON.stringify({
          increment_type: incrementType,
          created_at: new Date().toISOString(),
          automated: createdBy === 'changelog-system'
        });

        // Insert new version
        db.run(
          `INSERT INTO version_info (major, minor, patch, created_by, description, hidden_data, is_current)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [major, minor, patch, createdBy, description, hiddenData, 1],
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
function updatePackageJson(major, minor, patch = 0) {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageJson.version = `${major}.${minor}.${patch}`;
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`[VERSION] Updated package.json to ${packageJson.version}`);
}

/**
 * Check recent commits for version bump or patch-only instructions
 * Format: "bump: version X.Y" or "bump: X.Y" for version bumps
 *         "patch" keyword for patch-only updates
 */
function checkCommitsForVersionBump() {
  try {
    // Check last 10 commits since last changelog
    const commits = execSync('git log -10 --pretty=format:"%s"', { encoding: 'utf8' }).split('\n');
    
    for (const commit of commits) {
      // Match patterns like "bump: version 1.0" or "bump: 1.0"
      const bumpMatch = commit.match(/bump:\s*(?:version\s+)?(\d+)\.(\d+)/i);
      if (bumpMatch) {
        const major = parseInt(bumpMatch[1], 10);
        const minor = parseInt(bumpMatch[2], 10);
        console.log(`[VERSION] Found version bump in commit: "${commit}"`);
        return { major, minor, found: true, type: 'bump', commit };
      }
      
      // Check for patch keyword
      if (commit.toLowerCase().includes('patch')) {
        console.log(`[VERSION] Found patch keyword in commit: "${commit}"`);
        return { found: true, type: 'patch', commit };
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
      
      await setVersion(major, minor, 0, 'manual', `Manual version set to ${major}.${minor}`, 'manual');
      updatePackageJson(major, minor, 0);
      console.log(`[VERSION] Version set to ${major}.${minor}.0`);
      db.close();
      return;
    }
    
    // First, check commits for manual bump instructions
    const bumpCheck = checkCommitsForVersionBump();
    if (bumpCheck.found) {
      const currentVersion = await getCurrentVersion();
      
      if (bumpCheck.type === 'bump') {
        // Full version bump
        console.log(`[VERSION] Using version from commit: ${bumpCheck.major}.${bumpCheck.minor}`);
        await setVersion(bumpCheck.major, bumpCheck.minor, 0, 'commit-instruction', `Version bump via commit: ${bumpCheck.commit}`, 'bump');
        updatePackageJson(bumpCheck.major, bumpCheck.minor, 0);
        console.log(`[VERSION] Version set to ${bumpCheck.major}.${bumpCheck.minor}.0 from commit instruction`);
        db.close();
        return;
      } else if (bumpCheck.type === 'patch') {
        // Patch-only update
        if (!currentVersion) {
          // No version exists, initialize to 0.5.0
          await setVersion(0, 5, 0, 'patch-only', 'Initial version with patch', 'patch');
          updatePackageJson(0, 5, 0);
          console.log('[VERSION] No existing version, initializing to 0.5.0 (patch-only commit)');
        } else {
          // Increment only patch version
          const newPatch = currentVersion.patch + 1;
          console.log(`[VERSION] Patch-only update: incrementing from ${currentVersion.major}.${currentVersion.minor}.${currentVersion.patch} to ${currentVersion.major}.${currentVersion.minor}.${newPatch}`);
          await setVersion(currentVersion.major, currentVersion.minor, newPatch, 'patch-only', `Patch update via commit: ${bumpCheck.commit}`, 'patch');
          updatePackageJson(currentVersion.major, currentVersion.minor, newPatch);
          console.log(`[VERSION] ✓ Patch version incremented to ${currentVersion.major}.${currentVersion.minor}.${newPatch}`);
        }
        db.close();
        return;
      }
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
      // Increment minor by 1 (represents 0.1 increment), reset patch to 0
      newMajor = currentVersion.major;
      newMinor = currentVersion.minor + 1;
      console.log(`[VERSION] Auto-incrementing from ${currentVersion.major}.${currentVersion.minor}.${currentVersion.patch} to ${newMajor}.${newMinor}.0`);
    }
    
    await setVersion(newMajor, newMinor, 0, 'changelog-system', 'Auto-increment', 'minor');
    updatePackageJson(newMajor, newMinor, 0);
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
