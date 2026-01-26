#!/usr/bin/env node
/**
 * Script to increment bot version following Conventional Commits
 *
 * Usage:
 *   node scripts/increment-version.js              # Auto-increment based on commits
 *   node scripts/increment-version.js --set 1.0.0  # Set specific version
 *   node scripts/increment-version.js --check      # Check what version bump would happen
 *
 * Conventional Commits:
 *   fix: ...           → Patch (0.6.0 → 0.6.1)
 *   feat: ...          → Minor (0.6.0 → 0.7.0)
 *   feat!: ...         → Major (0.6.0 → 1.0.0)
 *   BREAKING CHANGE:   → Major (0.6.0 → 1.0.0)
 *   bump: X.Y.Z        → Set exact version
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Database setup (uses the live media database)
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, '..', 'media.db');
const db = new sqlite3.Database(dbPath);

// Commit types that trigger version bumps
const PATCH_TYPES = ['fix', 'perf', 'refactor', 'style'];
const MINOR_TYPES = ['feat'];
const NO_BUMP_TYPES = ['docs', 'test', 'ci', 'build', 'chore'];

/**
 * Get current version from database or package.json (fallback for CI)
 */
function getCurrentVersion() {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM version_info WHERE is_current = 1 ORDER BY created_at DESC LIMIT 1',
      (err, row) => {
        if (err) {
          // Database error - try fallback to package.json
          try {
            const packagePath = path.join(__dirname, '..', 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
            const version = packageJson.version || '0.6.0';
            const parts = version.split('.').map(n => parseInt(n, 10));
            const [major, minor, patch = 0] = parts;
            console.log(`[VERSION] Using package.json version as fallback: ${major}.${minor}.${patch}`);
            resolve({ major, minor, patch });
          } catch (pkgErr) {
            reject(new Error(`Failed to read version from both database and package.json: ${err.message}, ${pkgErr.message}`));
          }
        } else if (!row) {
          // No version in database - try package.json as fallback
          try {
            const packagePath = path.join(__dirname, '..', 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
            const version = packageJson.version || '0.6.0';
            const parts = version.split('.').map(n => parseInt(n, 10));
            const [major, minor, patch = 0] = parts;
            console.log(`[VERSION] No version in database, using package.json: ${major}.${minor}.${patch}`);
            resolve({ major, minor, patch });
          } catch (pkgErr) {
            // If package.json also fails, resolve as null (will initialize)
            console.log('[VERSION] No version found in database or package.json');
            resolve(null);
          }
        } else {
          resolve(row);
        }
      }
    );
  });
}

/**
 * Get last processed commit SHA from database or git history (fallback for CI)
 */
function getLastProcessedCommit() {
  return new Promise((resolve) => {
    db.get(
      `SELECT value FROM bot_config WHERE key = 'last_version_commit'`,
      (err, row) => {
        if (err || !row) {
          // No record in database - try to find last changelog commit in git history
          // (changelog commits are created after version bumps)
          try {
            const lastChangelogCommit = execSync(
              'git log --grep="docs(changelog)" --format=%H -1',
              { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
            ).trim();

            if (lastChangelogCommit) {
              console.log(`[VERSION] Using last changelog commit from git history: ${lastChangelogCommit.slice(0, 8)}`);
              resolve(lastChangelogCommit);
            } else {
              console.log('[VERSION] No previous changelog commit found in git history');
              resolve(null);
            }
          } catch (gitErr) {
            // Git command failed, resolve as null
            resolve(null);
          }
        } else {
          resolve(row.value);
        }
      }
    );
  });
}

/**
 * Set last processed commit SHA
 */
function setLastProcessedCommit(sha) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO bot_config (key, value) VALUES ('last_version_commit', ?)`,
      [sha],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

/**
 * Set version in database
 */
function setVersion(major, minor, patch = 0, createdBy = 'changelog-system', description = 'Auto-increment', incrementType = 'minor') {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
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
 * Initialize tables if needed
 */
function initializeTables() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
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
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS bot_config (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
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
 * Parse a commit message and determine bump type
 * @param {string} message - Commit message
 * @returns {'major'|'minor'|'patch'|'none'|{type: 'set', version: string}}
 */
function parseCommitType(message) {
  if (!message) return 'none';

  const firstLine = message.split('\n')[0].trim();
  const fullMessage = message.toLowerCase();

  // Check for manual version set: "bump: X.Y.Z" or "bump: version X.Y.Z"
  const bumpMatch = firstLine.match(/bump:\s*(?:version\s+)?(\d+\.\d+(?:\.\d+)?)/i);
  if (bumpMatch) {
    return { type: 'set', version: bumpMatch[1] };
  }

  // Check for BREAKING CHANGE (in body or footer)
  if (fullMessage.includes('breaking change') || fullMessage.includes('breaking-change')) {
    return 'major';
  }

  // Parse conventional commit format: type(scope)!: description
  const conventionalMatch = firstLine.match(/^(\w+)(?:\([^)]*\))?(!)?:\s*.+/i);
  if (conventionalMatch) {
    const type = conventionalMatch[1].toLowerCase();
    const hasBreaking = conventionalMatch[2] === '!';

    if (hasBreaking) {
      return 'major';
    }

    if (MINOR_TYPES.includes(type)) {
      return 'minor';
    }

    if (PATCH_TYPES.includes(type)) {
      return 'patch';
    }

    if (NO_BUMP_TYPES.includes(type)) {
      return 'none';
    }
  }

  // Default: no bump for unrecognized commits
  return 'none';
}

/**
 * Analyze recent commits and determine version bump
 * @param {string|null} sinceCommit - Only analyze commits after this SHA
 * @returns {{bumpType: string, commits: Array, description: string, setVersion?: string}}
 */
function analyzeCommits(sinceCommit = null) {
  try {
    // Get commits since last version bump, or last 50 if no reference
    let gitCmd = 'git log --pretty=format:"%H|||%s|||%b|||END" -50';
    if (sinceCommit) {
      gitCmd = `git log ${sinceCommit}..HEAD --pretty=format:"%H|||%s|||%b|||END"`;
    }

    const output = execSync(gitCmd, { encoding: 'utf8' });
    if (!output.trim()) {
      return { bumpType: 'none', commits: [], description: 'No new commits' };
    }

    const commitBlocks = output.split('|||END').filter(b => b.trim());
    const analyzedCommits = [];
    let highestBump = 'none';
    let setVersion = null;
    const bumpPriority = { major: 3, minor: 2, patch: 1, none: 0 };

    for (const block of commitBlocks) {
      const parts = block.split('|||');
      if (parts.length < 2) continue;

      const sha = parts[0].trim();
      const subject = parts[1].trim();
      const body = parts[2] ? parts[2].trim() : '';

      // Skip version bump commits from the workflow itself
      if (subject.includes('chore: bump version') || subject.includes('docs(changelog)')) {
        continue;
      }

      const fullMessage = `${subject}\n${body}`;
      const bumpType = parseCommitType(fullMessage);

      if (typeof bumpType === 'object' && bumpType.type === 'set') {
        setVersion = bumpType.version;
        analyzedCommits.push({ sha, subject, bumpType: 'set', version: bumpType.version });
        continue;
      }

      analyzedCommits.push({ sha, subject, bumpType });

      if (bumpPriority[bumpType] > bumpPriority[highestBump]) {
        highestBump = bumpType;
      }
    }

    // If explicit version set was found, use it
    if (setVersion) {
      return {
        bumpType: 'set',
        setVersion,
        commits: analyzedCommits,
        description: `Manual version set to ${setVersion}`
      };
    }

    // Build description from commits
    const relevantCommits = analyzedCommits.filter(c => c.bumpType !== 'none');
    const description = relevantCommits.length > 0
      ? relevantCommits.map(c => `- ${c.subject}`).join('\n')
      : 'Maintenance updates';

    return {
      bumpType: highestBump,
      commits: analyzedCommits,
      description
    };
  } catch (error) {
    console.error('[VERSION] Error analyzing commits:', error.message);
    return { bumpType: 'none', commits: [], description: 'Error analyzing commits' };
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  try {
    await initializeTables();

    // Check for --check flag (dry run)
    if (args.includes('--check')) {
      const currentVersion = await getCurrentVersion();
      const lastCommit = await getLastProcessedCommit();
      const analysis = analyzeCommits(lastCommit);

      console.log('\n📊 Análise de Commits:');
      console.log(`   Versão atual: ${currentVersion ? `${currentVersion.major}.${currentVersion.minor}.${currentVersion.patch}` : 'N/A'}`);
      console.log(`   Tipo de bump: ${analysis.bumpType}`);
      console.log(`   Commits analisados: ${analysis.commits.length}`);

      if (analysis.commits.length > 0) {
        console.log('\n   Commits relevantes:');
        for (const c of analysis.commits.filter(x => x.bumpType !== 'none').slice(0, 10)) {
          const icon = c.bumpType === 'major' ? '💥' : c.bumpType === 'minor' ? '✨' : c.bumpType === 'patch' ? '🐛' : '📝';
          console.log(`   ${icon} [${c.bumpType}] ${c.subject.slice(0, 60)}`);
        }
      }

      if (currentVersion && analysis.bumpType !== 'none') {
        let newVersion;
        if (analysis.bumpType === 'set') {
          newVersion = analysis.setVersion;
        } else if (analysis.bumpType === 'major') {
          newVersion = `${currentVersion.major + 1}.0.0`;
        } else if (analysis.bumpType === 'minor') {
          newVersion = `${currentVersion.major}.${currentVersion.minor + 1}.0`;
        } else {
          newVersion = `${currentVersion.major}.${currentVersion.minor}.${currentVersion.patch + 1}`;
        }
        console.log(`\n   ➡️  Nova versão seria: ${newVersion}`);
      }

      db.close();
      process.exit(analysis.bumpType !== 'none' ? 0 : 1);
      return;
    }

    // Check for --set flag
    const setIndex = args.indexOf('--set');
    if (setIndex !== -1 && args[setIndex + 1]) {
      const versionStr = args[setIndex + 1];
      const parts = versionStr.split('.').map(n => parseInt(n, 10));
      const [major, minor, patch = 0] = parts;

      if (isNaN(major) || isNaN(minor)) {
        console.error('[VERSION] Invalid version format. Use: X.Y or X.Y.Z');
        process.exit(1);
      }

      await setVersion(major, minor, patch, 'manual', `Manual version set to ${major}.${minor}.${patch}`, 'manual');
      updatePackageJson(major, minor, patch);

      // Update last processed commit
      try {
        const currentSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
        await setLastProcessedCommit(currentSha);
      } catch (e) { /* ignore */ }

      console.log(`[VERSION] ✓ Version set to ${major}.${minor}.${patch}`);
      db.close();
      return;
    }

    // Auto-increment based on commits
    const currentVersion = await getCurrentVersion();
    const lastCommit = await getLastProcessedCommit();
    const analysis = analyzeCommits(lastCommit);

    console.log(`[VERSION] Analyzing commits... Found bump type: ${analysis.bumpType}`);

    if (analysis.bumpType === 'none') {
      console.log('[VERSION] No version-relevant commits found. Skipping version bump.');
      db.close();
      return;
    }

    let newMajor, newMinor, newPatch;

    if (!currentVersion) {
      // No version exists, initialize to 0.6.0
      newMajor = 0;
      newMinor = 6;
      newPatch = 0;
      console.log('[VERSION] No existing version, initializing to 0.6.0');
    } else if (analysis.bumpType === 'set') {
      // Explicit version set
      const parts = analysis.setVersion.split('.').map(n => parseInt(n, 10));
      [newMajor, newMinor, newPatch = 0] = parts;
      console.log(`[VERSION] Setting version to ${analysis.setVersion} from commit instruction`);
    } else if (analysis.bumpType === 'major') {
      newMajor = currentVersion.major + 1;
      newMinor = 0;
      newPatch = 0;
      console.log(`[VERSION] 💥 MAJOR bump: ${currentVersion.major}.${currentVersion.minor}.${currentVersion.patch} → ${newMajor}.${newMinor}.${newPatch}`);
    } else if (analysis.bumpType === 'minor') {
      newMajor = currentVersion.major;
      newMinor = currentVersion.minor + 1;
      newPatch = 0;
      console.log(`[VERSION] ✨ MINOR bump: ${currentVersion.major}.${currentVersion.minor}.${currentVersion.patch} → ${newMajor}.${newMinor}.${newPatch}`);
    } else {
      // patch
      newMajor = currentVersion.major;
      newMinor = currentVersion.minor;
      newPatch = currentVersion.patch + 1;
      console.log(`[VERSION] 🐛 PATCH bump: ${currentVersion.major}.${currentVersion.minor}.${currentVersion.patch} → ${newMajor}.${newMinor}.${newPatch}`);
    }

    await setVersion(newMajor, newMinor, newPatch, 'changelog-system', analysis.description, analysis.bumpType);
    updatePackageJson(newMajor, newMinor, newPatch);

    // Update last processed commit
    try {
      const currentSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
      await setLastProcessedCommit(currentSha);
    } catch (e) { /* ignore */ }

    console.log(`[VERSION] ✓ Version updated to ${newMajor}.${newMinor}.${newPatch}`);

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

module.exports = { getCurrentVersion, setVersion, analyzeCommits, parseCommitType };
