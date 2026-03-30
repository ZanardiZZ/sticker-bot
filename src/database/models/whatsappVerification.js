/**
 * WhatsApp verification codes model
 */

const crypto = require('crypto');

/**
 * Generate a random 8-character verification code
 * @returns {string} 8-character alphanumeric code
 */
function generateVerificationCode() {
  // Generate 8 random characters (alphanumeric, uppercase)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create a new verification code for a WhatsApp user
 * @param {object} db - Database connection
 * @param {string} whatsappJid - WhatsApp JID of the user
 * @returns {Promise<string>} The generated verification code
 */
function createVerificationCode(db, whatsappJid) {
  return new Promise((resolve, reject) => {
    const code = generateVerificationCode();
    const now = Date.now();
    const expiresAt = now + (30 * 60 * 1000); // 30 minutes

    // First, invalidate any existing pending codes for this JID
    db.run(`
      UPDATE whatsapp_verification_codes 
      SET status = 'expired' 
      WHERE whatsapp_jid = ? AND status = 'pending'
    `, [whatsappJid], (err) => {
      if (err) {
        console.error('[VERIFY] Error invalidating old codes:', err);
        return reject(err);
      }

      // Create new verification code
      db.run(`
        INSERT INTO whatsapp_verification_codes (code, whatsapp_jid, status, created_at, expires_at)
        VALUES (?, ?, 'pending', ?, ?)
      `, [code, whatsappJid, now, expiresAt], function(err) {
        if (err) {
          console.error('[VERIFY] Error creating verification code:', err);
          return reject(err);
        }

        console.log(`[VERIFY] Created verification code ${code} for ${whatsappJid}`);
        resolve(code);
      });
    });
  });
}

/**
 * Get verification code details
 * @param {object} db - Database connection
 * @param {string} code - Verification code
 * @returns {Promise<object|null>} Code details or null if not found
 */
function getVerificationCode(db, code) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT * FROM whatsapp_verification_codes 
      WHERE code = ? AND status = 'pending' AND expires_at > ?
    `, [code, Date.now()], (err, row) => {
      if (err) {
        console.error('[VERIFY] Error getting verification code:', err);
        return reject(err);
      }
      resolve(row);
    });
  });
}

/**
 * Link verification code to a user account
 * @param {object} db - Database connection
 * @param {string} code - Verification code
 * @param {number} userId - User ID to link to
 * @returns {Promise<boolean>} Success status
 */
function linkVerificationCode(db, code, userId) {
  return new Promise((resolve, reject) => {
    // First get the code details
    getVerificationCode(db, code).then((codeData) => {
      if (!codeData) {
        return resolve(false);
      }

      const now = Date.now();

      // Update the verification code
      db.run(`
        UPDATE whatsapp_verification_codes 
        SET user_id = ?, status = 'verified', verified_at = ?
        WHERE code = ?
      `, [userId, now, code], (err) => {
        if (err) {
          console.error('[VERIFY] Error updating verification code:', err);
          return reject(err);
        }

        // Update the user with WhatsApp verification
        db.run(`
          UPDATE users 
          SET whatsapp_verified = 1, whatsapp_jid = ?, can_edit = 1
          WHERE id = ?
        `, [codeData.whatsapp_jid, userId], (err) => {
          if (err) {
            console.error('[VERIFY] Error updating user verification:', err);
            return reject(err);
          }

          console.log(`[VERIFY] Successfully linked code ${code} to user ${userId} (${codeData.whatsapp_jid})`);
          resolve(true);
        });
      });
    }).catch(reject);
  });
}

/**
 * Check if a WhatsApp JID is already verified
 * @param {object} db - Database connection
 * @param {string} whatsappJid - WhatsApp JID
 * @returns {Promise<object|null>} User data if verified, null otherwise
 */
function getVerifiedUser(db, whatsappJid) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT id, username, whatsapp_jid, whatsapp_verified 
      FROM users 
      WHERE whatsapp_jid = ? AND whatsapp_verified = 1
    `, [whatsappJid], (err, row) => {
      if (err) {
        console.error('[VERIFY] Error checking verified user:', err);
        return reject(err);
      }
      resolve(row);
    });
  });
}

/**
 * Get verification status for a user
 * @param {object} db - Database connection
 * @param {number} userId - User ID
 * @returns {Promise<object>} Verification status
 */
function getUserVerificationStatus(db, userId) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT whatsapp_verified, whatsapp_jid 
      FROM users 
      WHERE id = ?
    `, [userId], (err, row) => {
      if (err) {
        console.error('[VERIFY] Error getting user verification status:', err);
        return reject(err);
      }
      resolve(row || { whatsapp_verified: 0, whatsapp_jid: null });
    });
  });
}

module.exports = {
  generateVerificationCode,
  createVerificationCode,
  getVerificationCode,
  linkVerificationCode,
  getVerifiedUser,
  getUserVerificationStatus
};
