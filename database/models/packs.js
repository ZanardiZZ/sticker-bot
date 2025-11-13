/**
 * Packs model - handles sticker pack-related database operations
 */

const { db, dbHandler } = require('../connection');
const { randomUUID } = require('crypto');

/**
 * Creates a new sticker pack
 * @param {string} name - Pack name (unique)
 * @param {string} description - Pack description (optional)
 * @param {string} createdBy - User ID who created the pack (optional)
 * @returns {Promise<number>} Pack ID
 */
async function createPack(name, description = null, createdBy = null) {
  try {
    const packId = randomUUID();
    const result = await dbHandler.run(
      `INSERT INTO sticker_packs (pack_id, name, description, created_by)
       VALUES (?, ?, ?, ?)`,
      [packId, name, description, createdBy]
    );
    return result.lastID;
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      throw new Error(`Pack com nome "${name}" já existe`);
    }
    throw error;
  }
}

/**
 * Gets pack by name
 * @param {string} name - Pack name
 * @returns {Promise<object|null>} Pack object or null
 */
async function getPackByName(name) {
  try {
    return await dbHandler.get(
      'SELECT * FROM sticker_packs WHERE name = ?',
      [name]
    );
  } catch (error) {
    console.error('[DB] Error getting pack by name:', error);
    throw error;
  }
}

/**
 * Gets pack by ID
 * @param {number} packId - Pack ID
 * @returns {Promise<object|null>} Pack object or null
 */
async function getPackById(packId) {
  try {
    return await dbHandler.get(
      'SELECT * FROM sticker_packs WHERE id = ?',
      [packId]
    );
  } catch (error) {
    console.error('[DB] Error getting pack by ID:', error);
    throw error;
  }
}

/**
 * Adds a sticker to a pack
 * @param {number} packId - Pack ID
 * @param {number} mediaId - Media ID
 * @returns {Promise<boolean>} Success status
 */
async function addStickerToPack(packId, mediaId) {
  await dbHandler.run('BEGIN IMMEDIATE TRANSACTION');
  
  try {
    // Check if pack exists and get current count
    const pack = await dbHandler.get(
      'SELECT id, sticker_count, max_stickers FROM sticker_packs WHERE id = ?',
      [packId]
    );
    
    if (!pack) {
      throw new Error('Pack não encontrado');
    }
    
    // Check if pack is full
    if (pack.sticker_count >= pack.max_stickers) {
      throw new Error('PACK_FULL');
    }
    
    // Check if sticker already in pack
    const existing = await dbHandler.get(
      'SELECT 1 FROM pack_stickers WHERE pack_id = ? AND media_id = ?',
      [packId, mediaId]
    );
    
    if (existing) {
      throw new Error('Sticker já está neste pack');
    }
    
    // Get next position
    const positionResult = await dbHandler.get(
      'SELECT COALESCE(MAX(position), -1) + 1 as next_position FROM pack_stickers WHERE pack_id = ?',
      [packId]
    );
    const nextPosition = positionResult.next_position;
    
    // Add sticker to pack
    await dbHandler.run(
      'INSERT INTO pack_stickers (pack_id, media_id, position) VALUES (?, ?, ?)',
      [packId, mediaId, nextPosition]
    );
    
    // Update pack sticker count
    await dbHandler.run(
      'UPDATE sticker_packs SET sticker_count = sticker_count + 1, updated_at = strftime(\'%s\',\'now\') WHERE id = ?',
      [packId]
    );
    
    await dbHandler.run('COMMIT');
    return true;
  } catch (error) {
    try {
      await dbHandler.run('ROLLBACK');
    } catch (rollbackError) {
      console.error('[DB] Failed to rollback after error in addStickerToPack:', rollbackError);
    }
    throw error;
  }
}

/**
 * Removes a sticker from a pack
 * @param {number} packId - Pack ID
 * @param {number} mediaId - Media ID
 * @returns {Promise<boolean>} Success status
 */
async function removeStickerFromPack(packId, mediaId) {
  await dbHandler.run('BEGIN IMMEDIATE TRANSACTION');
  
  try {
    const result = await dbHandler.run(
      'DELETE FROM pack_stickers WHERE pack_id = ? AND media_id = ?',
      [packId, mediaId]
    );
    
    if (result.changes > 0) {
      // Update pack sticker count
      await dbHandler.run(
        'UPDATE sticker_packs SET sticker_count = sticker_count - 1, updated_at = strftime(\'%s\',\'now\') WHERE id = ?',
        [packId]
      );
    }
    
    await dbHandler.run('COMMIT');
    return result.changes > 0;
  } catch (error) {
    try {
      await dbHandler.run('ROLLBACK');
    } catch (rollbackError) {
      console.error('[DB] Failed to rollback after error in removeStickerFromPack:', rollbackError);
    }
    throw error;
  }
}

/**
 * Gets all stickers in a pack
 * @param {number} packId - Pack ID
 * @param {number} limit - Maximum number of stickers to return (default: all)
 * @returns {Promise<Array>} Array of media objects with pack position
 */
async function getPackStickers(packId, limit = null) {
  try {
    let query = `
      SELECT m.*, ps.position, ps.added_at as pack_added_at
      FROM media m
      INNER JOIN pack_stickers ps ON m.id = ps.media_id
      WHERE ps.pack_id = ?
      ORDER BY ps.position ASC
    `;
    
    const params = [packId];
    if (limit && limit > 0) {
      query += ' LIMIT ?';
      params.push(limit);
    }
    
    return await dbHandler.all(query, params);
  } catch (error) {
    console.error('[DB] Error getting pack stickers:', error);
    throw error;
  }
}

/**
 * Lists all packs, optionally filtered by search term
 * @param {string} searchTerm - Optional search term for pack name or description
 * @param {number} limit - Maximum number of packs to return
 * @returns {Promise<Array>} Array of pack objects
 */
async function listPacks(searchTerm = null, limit = 50) {
  try {
    let query = 'SELECT * FROM sticker_packs';
    const params = [];
    
    if (searchTerm) {
      query += ' WHERE name LIKE ? OR description LIKE ?';
      const searchPattern = `%${searchTerm}%`;
      params.push(searchPattern, searchPattern);
    }
    
    query += ' ORDER BY updated_at DESC LIMIT ?';
    params.push(limit);
    
    return await dbHandler.all(query, params);
  } catch (error) {
    console.error('[DB] Error listing packs:', error);
    throw error;
  }
}

/**
 * Deletes a pack and all its sticker associations
 * @param {number} packId - Pack ID
 * @returns {Promise<boolean>} Success status
 */
async function deletePack(packId) {
  try {
    const result = await dbHandler.run(
      'DELETE FROM sticker_packs WHERE id = ?',
      [packId]
    );
    return result.changes > 0;
  } catch (error) {
    console.error('[DB] Error deleting pack:', error);
    throw error;
  }
}

/**
 * Suggests a new pack name when the current one is full
 * @param {string} baseName - Base pack name
 * @returns {Promise<string>} Suggested pack name
 */
async function suggestPackName(baseName) {
  try {
    // Check if base name exists
    const basePack = await getPackByName(baseName);
    if (!basePack) {
      return baseName;
    }
    
    // Find similar packs with numbered suffixes
    const similarPacks = await dbHandler.all(
      `SELECT name FROM sticker_packs 
       WHERE name = ? OR name LIKE ? 
       ORDER BY name`,
      [baseName, `${baseName} (%`]
    );
    
    if (similarPacks.length === 0) {
      return baseName;
    }
    
    // Extract numbers from pack names
    const numbers = [];
    const regex = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\((\\d+)\\)$`);
    
    for (const pack of similarPacks) {
      if (pack.name === baseName) {
        numbers.push(1);
      } else {
        const match = pack.name.match(regex);
        if (match) {
          numbers.push(parseInt(match[1], 10));
        }
      }
    }
    
    if (numbers.length === 0) {
      return `${baseName} (2)`;
    }
    
    // Find next available number
    const maxNumber = Math.max(...numbers);
    return `${baseName} (${maxNumber + 1})`;
  } catch (error) {
    console.error('[DB] Error suggesting pack name:', error);
    return `${baseName} (2)`;
  }
}

/**
 * Gets pack count by search term
 * @param {string} searchTerm - Search term
 * @returns {Promise<number>} Number of matching packs
 */
async function getPackCount(searchTerm = null) {
  try {
    let query = 'SELECT COUNT(*) as count FROM sticker_packs';
    const params = [];
    
    if (searchTerm) {
      query += ' WHERE name LIKE ? OR description LIKE ?';
      const searchPattern = `%${searchTerm}%`;
      params.push(searchPattern, searchPattern);
    }
    
    const result = await dbHandler.get(query, params);
    return result.count;
  } catch (error) {
    console.error('[DB] Error getting pack count:', error);
    throw error;
  }
}

module.exports = {
  createPack,
  getPackByName,
  getPackById,
  addStickerToPack,
  removeStickerFromPack,
  getPackStickers,
  listPacks,
  deletePack,
  suggestPackName,
  getPackCount
};
