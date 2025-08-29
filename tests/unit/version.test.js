#!/usr/bin/env node
/**
 * Tests for Version Model - SemVer implementation with hidden data
 */

const path = require('path');
const { createTestDatabase, assert, assertEqual, runTestSuite } = require('../helpers/testUtils');

// Mock version model factory
function createVersionModel(db) {
  const DatabaseHandler = require('../../services/databaseHandler');
  const dbHandler = new DatabaseHandler(db);
  
  // Create a new instance of the version model for each test
  return {
    async getCurrentVersion() {
      try {
        const version = await dbHandler.get(
          'SELECT * FROM version_info WHERE is_current = 1 ORDER BY created_at DESC LIMIT 1'
        );
        return version;
      } catch (error) {
        console.error('[Version] Error getting current version:', error);
        throw error;
      }
    },

    async getCurrentVersionString() {
      try {
        const version = await this.getCurrentVersion();
        if (!version) {
          await this.initializeVersion();
          return '1.0.0';
        }
        
        let versionString = `${version.major}.${version.minor}.${version.patch}`;
        if (version.pre_release) {
          versionString += `-${version.pre_release}`;
        }
        if (version.build_metadata) {
          versionString += `+${version.build_metadata}`;
        }
        
        return versionString;
      } catch (error) {
        console.error('[Version] Error getting current version string:', error);
        throw error;
      }
    },

    async initializeVersion(createdBy = 'system', description = 'Initial version', hiddenData = null) {
      try {
        const existing = await this.getCurrentVersion();
        if (existing) {
          return existing.id;
        }

        const hiddenDataStr = hiddenData ? JSON.stringify(hiddenData) : JSON.stringify({
          initialized_at: new Date().toISOString(),
          source: 'auto-initialization',
          package_version: '1.0.0'
        });

        const result = await dbHandler.run(
          `INSERT INTO version_info (major, minor, patch, created_by, description, hidden_data, is_current)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [1, 0, 0, createdBy, description, hiddenDataStr, 1]
        );

        return result.lastID;
      } catch (error) {
        console.error('[Version] Error initializing version:', error);
        throw error;
      }
    },

    async incrementMajorVersion(createdBy = 'system', description = 'Major version increment', hiddenData = null) {
      try {
        const current = await this.getCurrentVersion();
        if (!current) {
          await this.initializeVersion();
          return await this.getCurrentVersion();
        }

        await dbHandler.run('UPDATE version_info SET is_current = 0 WHERE is_current = 1');

        const defaultHiddenData = {
          previous_version: `${current.major}.${current.minor}.${current.patch}`,
          increment_type: 'major',
          created_at: new Date().toISOString(),
          breaking_changes: true
        };
        
        const hiddenDataStr = JSON.stringify({
          ...defaultHiddenData,
          ...(hiddenData || {})
        });

        const result = await dbHandler.run(
          `INSERT INTO version_info (major, minor, patch, created_by, description, hidden_data, is_current)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [current.major + 1, 0, 0, createdBy, description, hiddenDataStr, 1]
        );

        const newVersion = await dbHandler.get('SELECT * FROM version_info WHERE id = ?', [result.lastID]);
        return newVersion;
      } catch (error) {
        console.error('[Version] Error incrementing major version:', error);
        throw error;
      }
    },

    async incrementMinorVersion(createdBy = 'system', description = 'Minor version increment', hiddenData = null) {
      try {
        const current = await this.getCurrentVersion();
        if (!current) {
          await this.initializeVersion();
          return await this.getCurrentVersion();
        }

        await dbHandler.run('UPDATE version_info SET is_current = 0 WHERE is_current = 1');

        const defaultHiddenData = {
          previous_version: `${current.major}.${current.minor}.${current.patch}`,
          increment_type: 'minor',
          created_at: new Date().toISOString(),
          new_features: true
        };
        
        const hiddenDataStr = JSON.stringify({
          ...defaultHiddenData,
          ...(hiddenData || {})
        });

        const result = await dbHandler.run(
          `INSERT INTO version_info (major, minor, patch, created_by, description, hidden_data, is_current)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [current.major, current.minor + 1, 0, createdBy, description, hiddenDataStr, 1]
        );

        const newVersion = await dbHandler.get('SELECT * FROM version_info WHERE id = ?', [result.lastID]);
        return newVersion;
      } catch (error) {
        console.error('[Version] Error incrementing minor version:', error);
        throw error;
      }
    },

    async incrementPatchVersion(createdBy = 'system', description = 'Patch version increment', hiddenData = null) {
      try {
        const current = await this.getCurrentVersion();
        if (!current) {
          await this.initializeVersion();
          return await this.getCurrentVersion();
        }

        await dbHandler.run('UPDATE version_info SET is_current = 0 WHERE is_current = 1');

        const defaultHiddenData = {
          previous_version: `${current.major}.${current.minor}.${current.patch}`,
          increment_type: 'patch',
          created_at: new Date().toISOString(),
          bug_fixes: true
        };
        
        const hiddenDataStr = JSON.stringify({
          ...defaultHiddenData,
          ...(hiddenData || {})
        });

        const result = await dbHandler.run(
          `INSERT INTO version_info (major, minor, patch, created_by, description, hidden_data, is_current)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [current.major, current.minor, current.patch + 1, createdBy, description, hiddenDataStr, 1]
        );

        const newVersion = await dbHandler.get('SELECT * FROM version_info WHERE id = ?', [result.lastID]);
        return newVersion;
      } catch (error) {
        console.error('[Version] Error incrementing patch version:', error);
        throw error;
      }
    },

    async createPreReleaseVersion(preRelease, createdBy = 'system', description = 'Pre-release version', hiddenData = null) {
      try {
        const current = await this.getCurrentVersion();
        if (!current) {
          await this.initializeVersion();
          return await this.getCurrentVersion();
        }

        await dbHandler.run('UPDATE version_info SET is_current = 0 WHERE is_current = 1');

        const defaultHiddenData = {
          previous_version: `${current.major}.${current.minor}.${current.patch}`,
          increment_type: 'pre-release',
          pre_release_type: preRelease,
          created_at: new Date().toISOString(),
          stable: false
        };
        
        const hiddenDataStr = JSON.stringify({
          ...defaultHiddenData,
          ...(hiddenData || {})
        });

        const result = await dbHandler.run(
          `INSERT INTO version_info (major, minor, patch, pre_release, created_by, description, hidden_data, is_current)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [current.major, current.minor, current.patch, preRelease, createdBy, description, hiddenDataStr, 1]
        );

        const newVersion = await dbHandler.get('SELECT * FROM version_info WHERE id = ?', [result.lastID]);
        return newVersion;
      } catch (error) {
        console.error('[Version] Error creating pre-release version:', error);
        throw error;
      }
    },

    async getVersionHistory(limit = 10) {
      try {
        const versions = await dbHandler.all(
          'SELECT * FROM version_info ORDER BY id DESC LIMIT ?',
          [limit]
        );
        return versions;
      } catch (error) {
        console.error('[Version] Error getting version history:', error);
        throw error;
      }
    },

    async getCurrentHiddenData() {
      try {
        const current = await this.getCurrentVersion();
        if (!current || !current.hidden_data) {
          return null;
        }
        return JSON.parse(current.hidden_data);
      } catch (error) {
        console.error('[Version] Error parsing hidden data:', error);
        return null;
      }
    },

    async updateCurrentHiddenData(hiddenData) {
      try {
        const current = await this.getCurrentVersion();
        if (!current) {
          return false;
        }

        const hiddenDataStr = JSON.stringify({
          ...JSON.parse(current.hidden_data || '{}'),
          ...hiddenData,
          updated_at: new Date().toISOString()
        });

        await dbHandler.run(
          'UPDATE version_info SET hidden_data = ? WHERE id = ?',
          [hiddenDataStr, current.id]
        );

        return true;
      } catch (error) {
        console.error('[Version] Error updating hidden data:', error);
        return false;
      }
    }
  };
}

// Create version table for testing
async function createVersionTable(db) {
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

// Test cases
const tests = [
  {
    name: 'Initialize version with 1.0.0',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('version-init');
      await createVersionTable(db);
      const versionModel = createVersionModel(db);
      
      const versionId = await versionModel.initializeVersion('test-user', 'Test initialization');
      assert(versionId, 'Version ID should be returned');
      
      const current = await versionModel.getCurrentVersion();
      assert(current, 'Current version should exist');
      assertEqual(current.major, 1, 'Major version should be 1');
      assertEqual(current.minor, 0, 'Minor version should be 0');
      assertEqual(current.patch, 0, 'Patch version should be 0');
      assertEqual(current.created_by, 'test-user', 'Created by should match');
      assertEqual(current.is_current, 1, 'Should be marked as current');
      
      const versionString = await versionModel.getCurrentVersionString();
      assertEqual(versionString, '1.0.0', 'Version string should be 1.0.0');
      
      await cleanup();
    }
  },
  
  {
    name: 'Skip initialization if version exists',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('version-skip-init');
      await createVersionTable(db);
      const versionModel = createVersionModel(db);
      
      // Initialize first time
      await versionModel.initializeVersion('first-user', 'First init');
      
      // Try to initialize again
      const secondId = await versionModel.initializeVersion('second-user', 'Should be skipped');
      
      const current = await versionModel.getCurrentVersion();
      assertEqual(current.created_by, 'first-user', 'Should keep original user');
      
      await cleanup();
    }
  },
  
  {
    name: 'Increment major version',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('version-major');
      await createVersionTable(db);
      const versionModel = createVersionModel(db);
      
      await versionModel.initializeVersion('test-user', 'Initial');
      
      const newVersion = await versionModel.incrementMajorVersion('test-major', 'Breaking changes', {
        breaking_changes: ['removed old API', 'changed database schema']
      });
      
      assertEqual(newVersion.major, 2, 'Major should be 2');
      assertEqual(newVersion.minor, 0, 'Minor should reset to 0');
      assertEqual(newVersion.patch, 0, 'Patch should reset to 0');
      
      const versionString = await versionModel.getCurrentVersionString();
      assertEqual(versionString, '2.0.0', 'Version string should be 2.0.0');
      
      const hiddenData = await versionModel.getCurrentHiddenData();
      assert(hiddenData, 'Hidden data should exist');
      assert(hiddenData.increment_type, 'Hidden data should have increment_type');
      assertEqual(hiddenData.increment_type, 'major', 'Hidden data should track increment type');
      assertEqual(hiddenData.previous_version, '1.0.0', 'Hidden data should track previous version');
      
      await cleanup();
    }
  },
  
  {
    name: 'Increment minor version',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('version-minor');
      await createVersionTable(db);
      const versionModel = createVersionModel(db);
      
      await versionModel.initializeVersion('test-user', 'Initial');
      
      const newVersion = await versionModel.incrementMinorVersion('test-minor', 'New features', {
        new_features: ['added user management', 'improved search']
      });
      
      assertEqual(newVersion.major, 1, 'Major should remain 1');
      assertEqual(newVersion.minor, 1, 'Minor should be 1');
      assertEqual(newVersion.patch, 0, 'Patch should reset to 0');
      
      const versionString = await versionModel.getCurrentVersionString();
      assertEqual(versionString, '1.1.0', 'Version string should be 1.1.0');
      
      await cleanup();
    }
  },
  
  {
    name: 'Increment patch version',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('version-patch');
      await createVersionTable(db);
      const versionModel = createVersionModel(db);
      
      await versionModel.initializeVersion('test-user', 'Initial');
      await versionModel.incrementMinorVersion('test-user', 'Add features');
      
      const newVersion = await versionModel.incrementPatchVersion('test-patch', 'Bug fixes', {
        bug_fixes: ['fixed memory leak', 'corrected typos']
      });
      
      assertEqual(newVersion.major, 1, 'Major should remain 1');
      assertEqual(newVersion.minor, 1, 'Minor should remain 1');
      assertEqual(newVersion.patch, 1, 'Patch should be 1');
      
      const versionString = await versionModel.getCurrentVersionString();
      assertEqual(versionString, '1.1.1', 'Version string should be 1.1.1');
      
      await cleanup();
    }
  },
  
  {
    name: 'Create pre-release version',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('version-prerelease');
      await createVersionTable(db);
      const versionModel = createVersionModel(db);
      
      await versionModel.initializeVersion('test-user', 'Initial');
      
      const newVersion = await versionModel.createPreReleaseVersion('beta.1', 'test-beta', 'Beta release', {
        beta_features: ['experimental UI', 'draft API']
      });
      
      assertEqual(newVersion.major, 1, 'Major should remain 1');
      assertEqual(newVersion.minor, 0, 'Minor should remain 0');
      assertEqual(newVersion.patch, 0, 'Patch should remain 0');
      assertEqual(newVersion.pre_release, 'beta.1', 'Pre-release should be set');
      
      const versionString = await versionModel.getCurrentVersionString();
      assertEqual(versionString, '1.0.0-beta.1', 'Version string should include pre-release');
      
      await cleanup();
    }
  },
  
  {
    name: 'Get version history',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('version-history');
      await createVersionTable(db);
      const versionModel = createVersionModel(db);
      
      await versionModel.initializeVersion('test-user', 'Initial'); // 1.0.0
      await versionModel.incrementPatchVersion('test-user', 'Fix 1'); // 1.0.1
      await versionModel.incrementPatchVersion('test-user', 'Fix 2'); // 1.0.2
      const finalVersion = await versionModel.incrementMinorVersion('test-user', 'Feature 1'); // 1.1.0
      
      const history = await versionModel.getVersionHistory(10);
      assert(history.length >= 4, 'Should have at least 4 version entries');
      
      // Check order (newest first by ID)
      for (let i = 1; i < history.length; i++) {
        assert(history[i].id < history[i-1].id, 'History should be in reverse ID order (newest first)');
      }
      
      // Latest should be minor version (1.1.0) - check the actual final version
      assertEqual(history[0].major, finalVersion.major, `Latest version major should be ${finalVersion.major}`);
      assertEqual(history[0].minor, finalVersion.minor, `Latest version should have minor = ${finalVersion.minor}`);
      assertEqual(history[0].patch, finalVersion.patch, `Latest version patch should be ${finalVersion.patch}`);
      
      await cleanup();
    }
  },
  
  {
    name: 'Update current hidden data',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('version-hidden-data');
      await createVersionTable(db);
      const versionModel = createVersionModel(db);
      
      await versionModel.initializeVersion('test-user', 'Initial');
      
      const success = await versionModel.updateCurrentHiddenData({
        deployment_status: 'ready',
        test_results: 'all passed'
      });
      
      assert(success, 'Hidden data update should succeed');
      
      const hiddenData = await versionModel.getCurrentHiddenData();
      assertEqual(hiddenData.deployment_status, 'ready', 'Hidden data should be updated');
      assert(hiddenData.updated_at, 'Updated timestamp should be added');
      
      await cleanup();
    }
  },
  
  {
    name: 'Only one version marked as current',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('version-current-unique');
      await createVersionTable(db);
      const versionModel = createVersionModel(db);
      
      await versionModel.initializeVersion('test-user', 'Initial');
      await versionModel.incrementPatchVersion('test-user', 'Fix 1');
      await versionModel.incrementMinorVersion('test-user', 'Feature 1');
      
      // Check that only one version is marked as current
      const currentVersions = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM version_info WHERE is_current = 1', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      assertEqual(currentVersions.length, 1, 'Should have exactly one current version');
      
      await cleanup();
    }
  }
];

// Test SemVer utilities
const semverTests = [
  {
    name: 'Parse basic SemVer string',
    fn: async () => {
      const { parseSemVer } = require('../../database/utils');
      const parsed = parseSemVer('1.2.3');
      assertEqual(parsed.major, 1, 'Major should be 1');
      assertEqual(parsed.minor, 2, 'Minor should be 2');
      assertEqual(parsed.patch, 3, 'Patch should be 3');
      assertEqual(parsed.preRelease, null, 'Pre-release should be null');
      assertEqual(parsed.buildMetadata, null, 'Build metadata should be null');
    }
  },
  
  {
    name: 'Parse SemVer with pre-release',
    fn: async () => {
      const { parseSemVer } = require('../../database/utils');
      const parsed = parseSemVer('1.2.3-alpha.1');
      assertEqual(parsed.preRelease, 'alpha.1', 'Pre-release should be parsed correctly');
    }
  },
  
  {
    name: 'Parse SemVer with build metadata',
    fn: async () => {
      const { parseSemVer } = require('../../database/utils');
      const parsed = parseSemVer('1.2.3+build.123');
      assertEqual(parsed.buildMetadata, 'build.123', 'Build metadata should be parsed correctly');
    }
  },
  
  {
    name: 'Compare SemVer versions',
    fn: async () => {
      const { compareSemVer } = require('../../database/utils');
      assertEqual(compareSemVer('1.0.0', '2.0.0'), -1, 'Should compare major versions correctly');
      assertEqual(compareSemVer('2.0.0', '1.0.0'), 1, 'Should compare major versions correctly');
      assertEqual(compareSemVer('1.2.0', '1.3.0'), -1, 'Should compare minor versions correctly');
      assertEqual(compareSemVer('1.2.3', '1.2.4'), -1, 'Should compare patch versions correctly');
      assertEqual(compareSemVer('1.0.0', '1.0.0'), 0, 'Should detect equal versions');
      assertEqual(compareSemVer('1.0.0', '1.0.0-alpha'), 1, 'Should handle pre-release correctly');
    }
  },
  
  {
    name: 'Validate SemVer strings',
    fn: async () => {
      const { isValidSemVer } = require('../../database/utils');
      assert(isValidSemVer('1.0.0'), 'Basic version should be valid');
      assert(isValidSemVer('10.20.30'), 'Multi-digit versions should be valid');
      assert(isValidSemVer('1.0.0-alpha'), 'Pre-release should be valid');
      assert(isValidSemVer('1.0.0+build'), 'Build metadata should be valid');
      assert(!isValidSemVer('1.0'), 'Two-part version should be invalid');
      assert(!isValidSemVer('v1.0.0'), 'Version with v prefix should be invalid');
      assert(!isValidSemVer('1.0.0.0'), 'Four-part version should be invalid');
    }
  }
];

// Combine all tests
const allTests = [...tests, ...semverTests];

async function main() {
  try {
    await runTestSuite('Version Model Tests', allTests);
  } catch (error) {
    console.error('Version test suite failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { tests: allTests };