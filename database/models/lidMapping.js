/**
 * LID-PN mapping model
 * Handles storage and retrieval of WhatsApp LID ↔ PN mappings
 */

const { normalizeJid, isPnUser, isLidUser } = require('../../utils/jidUtils');

/**
 * Initialize LID mapping table
 * @param {Database} db - SQLite database instance
 */
function initializeLidMappingTable(db) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Create LID mapping table
            db.run(`
                CREATE TABLE IF NOT EXISTS lid_mapping (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    lid TEXT UNIQUE,
                    pn TEXT UNIQUE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) {
                    console.error('[DB] Error creating lid_mapping table:', err);
                    reject(err);
                    return;
                }
                
                // Create indexes
                db.run(`CREATE INDEX IF NOT EXISTS idx_lid_mapping_lid ON lid_mapping(lid)`);
                db.run(`CREATE INDEX IF NOT EXISTS idx_lid_mapping_pn ON lid_mapping(pn)`);
                
                console.log('[DB] LID mapping table initialized');
                resolve();
            });
        });
    });
}

/**
 * Store or update LID ↔ PN mapping
 * @param {string} lid - Local Identifier
 * @param {string} pn - Phone Number
 */
function storeLidPnMapping(lid, pn) {
    const { db } = require('../connection');
    if (!lid || !pn) return;
    
    const normalizedLid = normalizeJid(lid);
    const normalizedPn = normalizeJid(pn);
    
    try {
        db.run(
            `INSERT OR REPLACE INTO lid_mapping (lid, pn, updated_at)
             VALUES (?, ?, CURRENT_TIMESTAMP)`,
            [normalizedLid, normalizedPn],
            function (err) {
                if (err) {
                    console.error('[DB] Erro ao armazenar mapeamento LID↔PN:', err);
                } else {
                    console.log(`[DB] Mapeamento LID↔PN armazenado: ${normalizedLid} ↔ ${normalizedPn}`);
                }
            }
        );
    } catch (error) {
        console.error('[DB] Erro ao armazenar mapeamento LID↔PN:', error);
    }
}

/**
 * Get PN for a LID
 * @param {string} lid - Local Identifier
 * @returns {string|null} Phone Number or null
 */
function getPnForLid(lid) {
    const { db } = require('../connection');
    if (!lid) return null;
    
    try {
        return new Promise((resolve) => {
            db.get(
                'SELECT pn FROM lid_mapping WHERE lid = ?',
                [normalizeJid(lid)],
                (err, result) => {
                    if (err) {
                        console.error('[DB] Erro ao obter PN para LID:', err);
                        resolve(null);
                    } else {
                        resolve(result?.pn || null);
                    }
                }
            );
        });
    } catch (error) {
        console.error('[DB] Erro ao obter PN para LID:', error);
        return null;
    }
}

/**
 * Get LID for a PN
 * @param {string} pn - Phone Number
 * @returns {string|null} Local Identifier or null
 */
function getLidForPn(pn) {
    const { db } = require('../connection');
    if (!pn) return null;
    
    try {
        return new Promise((resolve) => {
            db.get(
                'SELECT lid FROM lid_mapping WHERE pn = ?',
                [normalizeJid(pn)],
                (err, result) => {
                    if (err) {
                        console.error('[DB] Erro ao obter LID para PN:', err);
                        resolve(null);
                    } else {
                        resolve(result?.lid || null);
                    }
                }
            );
        });
    } catch (error) {
        console.error('[DB] Erro ao obter LID para PN:', error);
        return null;
    }
}

/**
 * Get all LID-PN mappings
 * @returns {Array} Array of mapping objects
 */
function getAllMappings() {
    const { db } = require('../connection');
    try {
        return new Promise((resolve) => {
            db.all(
                'SELECT * FROM lid_mapping ORDER BY updated_at DESC',
                [],
                (err, mappings) => {
                    if (err) {
                        console.error('[DB] Erro ao obter todos os mapeamentos:', err);
                        resolve([]);
                    } else {
                        resolve(mappings || []);
                    }
                }
            );
        });
    } catch (error) {
        console.error('[DB] Erro ao obter todos os mapeamentos:', error);
        return [];
    }
}

/**
 * Delete a LID-PN mapping
 * @param {string} lid - Local Identifier
 */
function deleteLidMapping(lid) {
    const { db } = require('../connection');
    if (!lid) return;
    
    try {
        db.run(
            'DELETE FROM lid_mapping WHERE lid = ?',
            [normalizeJid(lid)],
            function (err) {
                if (err) {
                    console.error('[DB] Erro ao remover mapeamento LID:', err);
                } else {
                    console.log(`[DB] Mapeamento LID removido: ${lid}`);
                }
            }
        );
    } catch (error) {
        console.error('[DB] Erro ao remover mapeamento LID:', error);
    }
}

/**
 * Resolve sender ID considering LIDs and PNs
 * @param {Object} sock - Baileys socket instance
 * @param {string} jid - JID of the sender
 * @returns {Promise<string>} Normalized user ID
 */
async function resolveSenderId(sock, jid) {
    if (!jid) return null;

    const normalizedJid = normalizeJid(jid);
    if (!normalizedJid) return null;

    let preferredId = normalizedJid;

    if (isPnUser(normalizedJid)) {
        try {
            const existingLid = await getLidForPn(normalizedJid);
            if (existingLid) {
                preferredId = existingLid;
                return preferredId;
            }
        } catch (error) {
            console.log(`[JID] Falha ao consultar LID local para ${normalizedJid}:`, error?.message || error);
        }

        const remoteResolver = sock?.signalRepository?.lidMapping?.getLIDForPN;
        if (typeof remoteResolver === 'function') {
            try {
                const lid = await remoteResolver.call(sock.signalRepository.lidMapping, normalizedJid);
                const normalizedLid = normalizeJid(lid);
                if (normalizedLid) {
                    preferredId = normalizedLid;
                    storeLidPnMapping(normalizedLid, normalizedJid);
                }
            } catch (error) {
                if (error?.message !== 'ack_timeout') {
                    console.log(`[JID] Erro ao resolver sender ID remoto para ${normalizedJid}:`, error?.message || error);
                }
            }
        }
    } else if (isLidUser(normalizedJid)) {
        try {
            const existingPn = await getPnForLid(normalizedJid);
            if (existingPn) {
                storeLidPnMapping(normalizedJid, existingPn);
            }
        } catch (error) {
            console.log(`[JID] Falha ao consultar PN local para ${normalizedJid}:`, error?.message || error);
        }
        // For LIDs, return as-is to avoid unnecessary network lookups that can timeout
    }

    return preferredId;
}

module.exports = {
    initializeLidMappingTable,
    storeLidPnMapping,
    getPnForLid,
    getLidForPn,
    getAllMappings,
    deleteLidMapping,
    resolveSenderId
};
