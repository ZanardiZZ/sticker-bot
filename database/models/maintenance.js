/**
 * Maintenance model - handles database migrations and maintenance operations
 */

const { db } = require('../connection');

/**
 * Returns statistics about contacts that need to be migrated
 * @returns {Promise<object>} Statistics object with migration counts
 */
function getHistoricalContactsStats() {
  return new Promise((resolve, reject) => {
    const statsQueries = {
      totalMediaWithSender: `
        SELECT COUNT(*) as count 
        FROM media 
        WHERE sender_id IS NOT NULL AND sender_id != ''
      `,
      existingContacts: `
        SELECT COUNT(*) as count 
        FROM contacts
      `,
      uniqueSendersInMedia: `
        SELECT COUNT(DISTINCT sender_id) as count 
        FROM media 
        WHERE sender_id IS NOT NULL AND sender_id != ''
      `,
      sendersNeedingMigration: `
        SELECT COUNT(DISTINCT m.sender_id) as count
        FROM media m
        LEFT JOIN contacts c ON c.sender_id = m.sender_id
        WHERE m.sender_id IS NOT NULL 
          AND m.sender_id != '' 
          AND c.sender_id IS NULL
      `
    };
    
    const results = {};
    const queryKeys = Object.keys(statsQueries);
    let completed = 0;
    
    queryKeys.forEach(key => {
      db.get(statsQueries[key], [], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        results[key] = row.count;
        completed++;
        
        if (completed === queryKeys.length) {
          resolve(results);
        }
      });
    });
  });
}

/**
 * Migrates historical entries from media table to contacts table
 * For historical sends to be counted in user rankings
 * @param {object} logger - Logger object (defaults to console)
 * @returns {Promise<number>} Number of migrated contacts
 */
async function migrateHistoricalContacts(logger = console) {
  return new Promise((resolve, reject) => {
    logger.log('[migrate] Iniciando migração de contatos históricos...');
    
    // Search for all unique sender_ids from media table that don't exist in contacts table
    const sql = `
      SELECT DISTINCT m.sender_id 
      FROM media m
      LEFT JOIN contacts c ON c.sender_id = m.sender_id
      WHERE m.sender_id IS NOT NULL 
        AND m.sender_id != '' 
        AND c.sender_id IS NULL
    `;
    
    db.all(sql, [], (err, rows) => {
      if (err) {
        console.error('[migrate] Erro ao buscar sender_ids históricos:', err);
        reject(err);
        return;
      }
      
      if (!rows || rows.length === 0) {
        console.log('[migrate] Nenhum contato histórico para migrar.');
        resolve(0);
        return;
      }
      
      console.log(`[migrate] Encontrados ${rows.length} contatos históricos para migrar.`);
      
      let processedCount = 0;
      let errorCount = 0;
      
      // Process each unique sender_id
      const processNext = () => {
        if (processedCount + errorCount >= rows.length) {
          const successCount = processedCount;
          console.log(`[migrate] Migração concluída. Sucessos: ${successCount}, Erros: ${errorCount}`);
          resolve(successCount);
          return;
        }
        
        const row = rows[processedCount + errorCount];
        const senderId = row.sender_id;
        
        // Insert contact with empty display_name (will be filled when user interacts again)
        db.run(`
          INSERT INTO contacts(sender_id, display_name, updated_at)
          VALUES (?, '', strftime('%s','now'))
        `, [senderId], (insertErr) => {
          if (insertErr) {
            console.error(`[migrate] Erro ao inserir contato para ${senderId}:`, insertErr);
            errorCount++;
          } else {
            processedCount++;
            if (processedCount % 50 === 0) {
              console.log(`[migrate] Processados ${processedCount} contatos...`);
            }
          }
          
          // Continue processing
          setImmediate(processNext);
        });
      };
      
      // Start processing
      processNext();
    });
  });
}

/**
 * Gets group name from group ID (placeholder - would be filled by WhatsApp integration)
 * @param {string} groupId - Group ID
 * @returns {string|null} Group name or null
 */
function getGroupName(groupId) {
  // For now, extracts a "friendly" name from the group ID
  if (!groupId || !groupId.includes('@g.us')) {
    return null;
  }
  
  // Remove @g.us and take first characters as temporary name
  const cleanId = groupId.replace('@g.us', '');
  return `Grupo ${cleanId.substring(0, 10)}...`;
}

/**
 * Enhanced migration function that includes chat_id/group_id when sender_id is null
 * @param {object} logger - Logger object (defaults to console)
 * @returns {Promise<number>} Number of migrated IDs
 */
async function migrateMediaWithMissingSenderId(logger = console) {
  return new Promise((resolve, reject) => {
    logger.log('[migrate] Iniciando migração de mídias com sender_id faltante...');
    
    // Search for media that don't have sender_id but have chat_id or group_id
    const sql = `
      SELECT DISTINCT 
        COALESCE(m.chat_id, m.group_id) as effective_id,
        m.group_id,
        m.chat_id,
        COUNT(*) as media_count
      FROM media m
      LEFT JOIN contacts c ON c.sender_id = COALESCE(m.chat_id, m.group_id)
      WHERE (m.sender_id IS NULL OR m.sender_id = '') 
        AND COALESCE(m.chat_id, m.group_id) IS NOT NULL
        AND COALESCE(m.chat_id, m.group_id) != ''
        AND c.sender_id IS NULL  -- Does not exist yet in contacts table
      GROUP BY effective_id
    `;
    
    db.all(sql, [], (err, rows) => {
      if (err) {
        logger.error('[migrate] Erro ao buscar mídias com sender_id faltante:', err);
        reject(err);
        return;
      }
      
      if (!rows || rows.length === 0) {
        logger.log('[migrate] Nenhuma mídia com sender_id faltante para migrar.');
        resolve(0);
        return;
      }
      
      logger.log(`[migrate] Encontradas ${rows.length} IDs únicos para migrar (${rows.reduce((sum, r) => sum + r.media_count, 0)} mídias total).`);
      
      let processedCount = 0;
      let errorCount = 0;
      
      // Process each unique effective_id
      const processNext = () => {
        if (processedCount + errorCount >= rows.length) {
          const successCount = processedCount;
          logger.log(`[migrate] Migração de IDs faltantes concluída. Sucessos: ${successCount}, Erros: ${errorCount}`);
          resolve(successCount);
          return;
        }
        
        const row = rows[processedCount + errorCount];
        const effectiveId = row.effective_id;
        const isGroup = row.group_id === effectiveId;
        
        // For groups, use group name; for users, empty name will be filled later
        let displayName = '';
        if (isGroup) {
          displayName = getGroupName(effectiveId);
        }
        
        // Insert contact using effective_id
        db.run(`
          INSERT INTO contacts(sender_id, display_name, updated_at)
          VALUES (?, ?, strftime('%s','now'))
        `, [effectiveId, displayName], (insertErr) => {
          if (insertErr) {
            logger.error(`[migrate] Erro ao inserir contato para ${effectiveId}:`, insertErr);
            errorCount++;
          } else {
            processedCount++;
            if (processedCount % 50 === 0) {
              logger.log(`[migrate] Processados ${processedCount} IDs faltantes...`);
            }
          }
          
          // Continue processing
          setImmediate(processNext);
        });
      };
      
      // Start processing
      processNext();
    });
  });
}

module.exports = {
  getHistoricalContactsStats,
  migrateHistoricalContacts,
  migrateMediaWithMissingSenderId,
  getGroupName
};