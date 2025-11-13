/**
 * Wastickers Pack Generator
 * Creates WhatsApp-compatible .wastickers files for sticker packs
 */

const fs = require('fs').promises;
const path = require('path');
const { PACK_NAME, AUTHOR_NAME } = require('../config/stickers');

const WASTICKERS_DIR = path.resolve(__dirname, '..', 'wastickers');

/**
 * Ensures wastickers directory exists
 */
async function ensureWastickersDir() {
  try {
    await fs.mkdir(WASTICKERS_DIR, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Generates a .wastickers file for a sticker pack
 * @param {object} pack - Pack object from database
 * @param {Array} stickers - Array of sticker objects with file paths
 * @returns {Promise<string>} Path to generated wastickers file
 */
async function generateWastickersFile(pack, stickers) {
  await ensureWastickersDir();

  // Create wastickers manifest
  const manifest = {
    android_play_store_link: '',
    ios_app_store_link: '',
    identifier: pack.pack_id,
    name: pack.name,
    publisher: PACK_NAME,
    tray_image_file: '', // Will be set to first sticker's thumbnail
    image_data_version: '1',
    avoid_cache: false,
    publisher_email: '',
    publisher_website: '',
    privacy_policy_website: '',
    license_agreement_website: '',
    stickers: []
  };

  // Add stickers to manifest
  for (let i = 0; i < stickers.length && i < 30; i++) {
    const sticker = stickers[i];
    
    // Each sticker entry in wastickers format
    const stickerEntry = {
      image_file: path.basename(sticker.file_path),
      emojis: sticker.tags ? sticker.tags.slice(0, 3) : [] // Max 3 emojis per sticker
    };
    
    manifest.stickers.push(stickerEntry);
  }

  // Use first sticker as tray image
  if (stickers.length > 0) {
    manifest.tray_image_file = path.basename(stickers[0].file_path);
  }

  // Write wastickers file
  const wastickersPath = path.join(WASTICKERS_DIR, `${pack.pack_id}.wastickers`);
  await fs.writeFile(wastickersPath, JSON.stringify(manifest, null, 2), 'utf-8');

  return wastickersPath;
}

/**
 * Gets the path to a pack's wastickers file
 * @param {string} packId - Pack UUID
 * @returns {string} Path to wastickers file
 */
function getWastickersPath(packId) {
  return path.join(WASTICKERS_DIR, `${packId}.wastickers`);
}

/**
 * Checks if a wastickers file exists for a pack
 * @param {string} packId - Pack UUID
 * @returns {Promise<boolean>} True if file exists
 */
async function wastickersExists(packId) {
  try {
    await fs.access(getWastickersPath(packId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes a wastickers file
 * @param {string} packId - Pack UUID
 */
async function deleteWastickersFile(packId) {
  try {
    await fs.unlink(getWastickersPath(packId));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('[Wastickers] Error deleting file:', error);
    }
  }
}

/**
 * Generates a ZIP file containing the wastickers manifest and all sticker files
 * This is the complete pack that can be imported into WhatsApp
 * @param {object} pack - Pack object from database
 * @param {Array} stickers - Array of sticker objects with file paths
 * @returns {Promise<string>} Path to generated ZIP file
 */
async function generateWastickersZip(pack, stickers) {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip();

  // Generate wastickers manifest
  const wastickersPath = await generateWastickersFile(pack, stickers);
  
  // Read manifest content
  const manifestContent = await fs.readFile(wastickersPath, 'utf-8');
  const manifest = JSON.parse(manifestContent);

  // Add manifest to zip as contents.json
  zip.addFile('contents.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

  // Add all sticker files to zip
  for (const sticker of stickers) {
    try {
      const stickerContent = await fs.readFile(sticker.file_path);
      zip.addFile(path.basename(sticker.file_path), stickerContent);
    } catch (error) {
      console.error(`[Wastickers] Error adding sticker ${sticker.id}:`, error);
    }
  }

  // Write ZIP file
  const zipPath = path.join(WASTICKERS_DIR, `${pack.pack_id}.zip`);
  zip.writeZip(zipPath);

  return zipPath;
}

module.exports = {
  generateWastickersFile,
  generateWastickersZip,
  getWastickersPath,
  wastickersExists,
  deleteWastickersFile,
  WASTICKERS_DIR
};
