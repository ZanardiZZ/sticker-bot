/**
 * Version model - manages SemVer versioning with hidden data
 */

const { dbHandler } = require('../connection');

/**
 * Gets current version information
 * @returns {Promise<Object|null>} Current version object or null if none exists
 */
async function getCurrentVersion() {
  try {
    const version = await dbHandler.get(
      'SELECT * FROM version_info WHERE is_current = 1 ORDER BY created_at DESC LIMIT 1'
    );
    return version;
  } catch (error) {
    console.error('[Version] Error getting current version:', error);
    throw error;
  }
}

/**
 * Gets current version as SemVer string
 * @returns {Promise<string>} Version string in format "major.minor.patch"
 */
async function getCurrentVersionString() {
  try {
    const version = await getCurrentVersion();
    if (!version) {
      // Initialize with version 0.5.0 if none exists
      await initializeVersion();
      return '0.5.0';
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
}

/**
 * Initializes version system with 1.0.0
 * @param {string} [createdBy] - Who/what created this version
 * @param {string} [description] - Description of this version
 * @param {Object} [hiddenData] - Additional hidden metadata
 * @returns {Promise<number>} Version ID
 */
async function initializeVersion(createdBy = 'system', description = 'Initial version', hiddenData = null) {
  try {
    // Check if version already exists
    const existing = await getCurrentVersion();
    if (existing) {
      return existing.id;
    }

    const hiddenDataStr = hiddenData ? JSON.stringify(hiddenData) : JSON.stringify({
      initialized_at: new Date().toISOString(),
      source: 'auto-initialization',
      package_version: '0.5.0'
    });

    const result = await dbHandler.run(
      `INSERT INTO version_info (major, minor, patch, created_by, description, hidden_data, is_current)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [0, 5, 0, createdBy, description, hiddenDataStr, 1]
    );

    console.log('[Version] Initialized version system with 0.5.0');
    return result.lastID;
  } catch (error) {
    console.error('[Version] Error initializing version:', error);
    throw error;
  }
}

/**
 * Creates new version by incrementing major version
 * @param {string} [createdBy] - Who/what created this version
 * @param {string} [description] - Description of changes
 * @param {Object} [hiddenData] - Additional hidden metadata
 * @returns {Promise<Object>} New version object
 */
async function incrementMajorVersion(createdBy = 'system', description = 'Major version increment', hiddenData = null) {
  try {
    const current = await getCurrentVersion();
    if (!current) {
      await initializeVersion();
      return await getCurrentVersion();
    }

    // Mark current version as not current
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
    console.log(`[Version] Incremented major version to ${newVersion.major}.${newVersion.minor}.${newVersion.patch}`);
    return newVersion;
  } catch (error) {
    console.error('[Version] Error incrementing major version:', error);
    throw error;
  }
}

/**
 * Creates new version by incrementing minor version
 * @param {string} [createdBy] - Who/what created this version
 * @param {string} [description] - Description of changes
 * @param {Object} [hiddenData] - Additional hidden metadata
 * @returns {Promise<Object>} New version object
 */
async function incrementMinorVersion(createdBy = 'system', description = 'Minor version increment', hiddenData = null) {
  try {
    const current = await getCurrentVersion();
    if (!current) {
      await initializeVersion();
      return await getCurrentVersion();
    }

    // Mark current version as not current
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
    console.log(`[Version] Incremented minor version to ${newVersion.major}.${newVersion.minor}.${newVersion.patch}`);
    return newVersion;
  } catch (error) {
    console.error('[Version] Error incrementing minor version:', error);
    throw error;
  }
}

/**
 * Creates new version by incrementing patch version
 * @param {string} [createdBy] - Who/what created this version
 * @param {string} [description] - Description of changes
 * @param {Object} [hiddenData] - Additional hidden metadata
 * @returns {Promise<Object>} New version object
 */
async function incrementPatchVersion(createdBy = 'system', description = 'Patch version increment', hiddenData = null) {
  try {
    const current = await getCurrentVersion();
    if (!current) {
      await initializeVersion();
      return await getCurrentVersion();
    }

    // Mark current version as not current
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
    console.log(`[Version] Incremented patch version to ${newVersion.major}.${newVersion.minor}.${newVersion.patch}`);
    return newVersion;
  } catch (error) {
    console.error('[Version] Error incrementing patch version:', error);
    throw error;
  }
}

/**
 * Creates a pre-release version
 * @param {string} preRelease - Pre-release identifier (e.g., 'alpha', 'beta', 'rc.1')
 * @param {string} [createdBy] - Who/what created this version
 * @param {string} [description] - Description of changes
 * @param {Object} [hiddenData] - Additional hidden metadata
 * @returns {Promise<Object>} New version object
 */
async function createPreReleaseVersion(preRelease, createdBy = 'system', description = 'Pre-release version', hiddenData = null) {
  try {
    const current = await getCurrentVersion();
    if (!current) {
      await initializeVersion();
      return await getCurrentVersion();
    }

    // Mark current version as not current
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
    console.log(`[Version] Created pre-release version ${newVersion.major}.${newVersion.minor}.${newVersion.patch}-${newVersion.pre_release}`);
    return newVersion;
  } catch (error) {
    console.error('[Version] Error creating pre-release version:', error);
    throw error;
  }
}

/**
 * Gets version history
 * @param {number} [limit=10] - Maximum number of versions to return
 * @returns {Promise<Array>} Array of version objects, newest first
 */
async function getVersionHistory(limit = 10) {
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
}

/**
 * Gets hidden data from current version
 * @returns {Promise<Object|null>} Hidden data object or null
 */
async function getCurrentHiddenData() {
  try {
    const current = await getCurrentVersion();
    if (!current || !current.hidden_data) {
      return null;
    }
    return JSON.parse(current.hidden_data);
  } catch (error) {
    console.error('[Version] Error parsing hidden data:', error);
    return null;
  }
}

/**
 * Updates hidden data for current version
 * @param {Object} hiddenData - New hidden data to store
 * @returns {Promise<boolean>} Success status
 */
async function updateCurrentHiddenData(hiddenData) {
  try {
    const current = await getCurrentVersion();
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

module.exports = {
  getCurrentVersion,
  getCurrentVersionString,
  initializeVersion,
  incrementMajorVersion,
  incrementMinorVersion,
  incrementPatchVersion,
  createPreReleaseVersion,
  getVersionHistory,
  getCurrentHiddenData,
  updateCurrentHiddenData
};