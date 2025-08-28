#!/usr/bin/env node
/**
 * Unit tests for maintenance model
 */

const path = require('path');
const { createTestDatabase, createTestTables, insertTestMedia, insertTestContacts, assert, assertEqual, assertLength, assertArrayEquals, runTestSuite } = require('../helpers/testUtils');

// Mock the maintenance model
function createMaintenanceModel(db) {
  const maintenanceModel = {
    getHistoricalContactsStats() {
      return new Promise((resolve, reject) => {
        const statsQueries = {
          totalMedia: 'SELECT COUNT(*) as count FROM media',
          mediaWithSenderId: 'SELECT COUNT(*) as count FROM media WHERE sender_id IS NOT NULL AND sender_id != ""',
          uniqueSenderIds: 'SELECT COUNT(DISTINCT sender_id) as count FROM media WHERE sender_id IS NOT NULL AND sender_id != ""',
          existingContacts: 'SELECT COUNT(*) as count FROM contacts',
          needsMigration: `SELECT COUNT(DISTINCT sender_id) as count FROM media 
                          WHERE sender_id IS NOT NULL AND sender_id != "" 
                          AND sender_id NOT IN (SELECT sender_id FROM contacts)`
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
    },

    async migrateHistoricalContacts(logger = console) {
      return new Promise((resolve, reject) => {
        // Get unique sender_ids from media that don't exist in contacts
        db.all(`
          SELECT DISTINCT sender_id, 
                 CASE 
                   WHEN sender_id LIKE '%@g.us' THEN 'Grupo ' || substr(sender_id, 1, 8) || '...'
                   ELSE 'Usuário ' || substr(sender_id, 1, 8) || '...'
                 END as display_name
          FROM media 
          WHERE sender_id IS NOT NULL AND sender_id != ''
          AND sender_id NOT IN (SELECT sender_id FROM contacts)
        `, [], (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          
          if (rows.length === 0) {
            logger.log('[migrate] Nenhum contato histórico para migrar.');
            resolve(0);
            return;
          }
          
          logger.log(`[migrate] Iniciando migração de ${rows.length} contatos históricos...`);
          
          let processedCount = 0;
          let errorCount = 0;
          
          const processNext = () => {
            if (processedCount + errorCount >= rows.length) {
              logger.log(`[migrate] Migração completa: ${processedCount} inseridos, ${errorCount} erros.`);
              resolve(processedCount);
              return;
            }
            
            const contact = rows[processedCount + errorCount];
            
            db.run(`
              INSERT INTO contacts(sender_id, display_name, updated_at)
              VALUES (?, ?, strftime('%s','now'))
            `, [contact.sender_id, contact.display_name], (insertErr) => {
              if (insertErr) {
                logger.error(`[migrate] Erro ao inserir contato para ${contact.sender_id}:`, insertErr);
                errorCount++;
              } else {
                processedCount++;
                if (processedCount % 50 === 0) {
                  logger.log(`[migrate] Processados ${processedCount} contatos históricos...`);
                }
              }
              
              setImmediate(processNext);
            });
          };
          
          processNext();
        });
      });
    },

    async migrateMediaWithMissingSenderId(logger = console) {
      return new Promise((resolve, reject) => {
        // Get records with missing sender_id
        db.all(`
          SELECT id, chat_id, group_id
          FROM media 
          WHERE sender_id IS NULL OR sender_id = ''
        `, [], (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          
          if (rows.length === 0) {
            logger.log('[migrate] Nenhum registro com sender_id faltante.');
            resolve(0);
            return;
          }
          
          logger.log(`[migrate] Iniciando migração de ${rows.length} IDs faltantes...`);
          
          let processedCount = 0;
          let errorCount = 0;
          
          const processNext = () => {
            if (processedCount + errorCount >= rows.length) {
              logger.log(`[migrate] Migração de IDs completa: ${processedCount} processados, ${errorCount} erros.`);
              resolve(processedCount);
              return;
            }
            
            const record = rows[processedCount + errorCount];
            
            // Use group_id if available, otherwise chat_id
            const effectiveId = record.group_id || record.chat_id;
            let displayName;
            
            if (effectiveId.includes('@g.us')) {
              displayName = `Grupo ${effectiveId.substring(0, 8)}...`;
            } else {
              displayName = `Usuário ${effectiveId.substring(0, 8)}...`;
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
              
              setImmediate(processNext);
            });
          };
          
          processNext();
        });
      });
    }
  };

  return maintenanceModel;
}

const tests = [
  {
    name: 'Get historical contacts statistics - empty database',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('maintenance-stats-empty');
      await createTestTables(db);
      const maintenanceModel = createMaintenanceModel(db);
      
      const stats = await maintenanceModel.getHistoricalContactsStats();
      
      assertEqual(stats.totalMedia, 0, 'Total media should be 0');
      assertEqual(stats.mediaWithSenderId, 0, 'Media with sender ID should be 0');
      assertEqual(stats.uniqueSenderIds, 0, 'Unique sender IDs should be 0');
      assertEqual(stats.existingContacts, 0, 'Existing contacts should be 0');
      assertEqual(stats.needsMigration, 0, 'Needs migration should be 0');
      
      await cleanup();
    }
  },

  {
    name: 'Get historical contacts statistics - with data',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('maintenance-stats-data');
      await createTestTables(db);
      const maintenanceModel = createMaintenanceModel(db);
      
      // Insert test media with various sender IDs
      await insertTestMedia(db, [
        { senderId: 'user1@c.us' },
        { senderId: 'user1@c.us' }, // Duplicate sender
        { senderId: 'user2@c.us' },
        { senderId: null }, // No sender ID
        { senderId: '' }    // Empty sender ID
      ]);
      
      // Insert some existing contacts
      await insertTestContacts(db, [
        { senderId: 'user1@c.us', displayName: 'User One' }
      ]);
      
      const stats = await maintenanceModel.getHistoricalContactsStats();
      
      assertEqual(stats.totalMedia, 5, 'Total media should be 5');
      assertEqual(stats.mediaWithSenderId, 3, 'Media with sender ID should be 3'); // user1 x2, user2 x1
      assertEqual(stats.uniqueSenderIds, 2, 'Unique sender IDs should be 2'); // user1, user2
      assertEqual(stats.existingContacts, 1, 'Existing contacts should be 1');
      assertEqual(stats.needsMigration, 1, 'Needs migration should be 1'); // user2 not in contacts
      
      await cleanup();
    }
  },

  {
    name: 'Migrate historical contacts - no contacts to migrate',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('maintenance-migrate-empty');
      await createTestTables(db);
      const maintenanceModel = createMaintenanceModel(db);
      
      // Insert media but all senders already have contacts
      await insertTestMedia(db, [
        { senderId: 'user1@c.us' }
      ]);
      
      await insertTestContacts(db, [
        { senderId: 'user1@c.us', displayName: 'User One' }
      ]);
      
      const migratedCount = await maintenanceModel.migrateHistoricalContacts();
      
      assertEqual(migratedCount, 0, 'Should migrate 0 contacts');
      
      // Verify contacts count unchanged
      const contactsCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM contacts', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      assertEqual(contactsCount, 1, 'Contacts count should remain 1');
      
      await cleanup();
    }
  },

  {
    name: 'Migrate historical contacts - with new contacts',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('maintenance-migrate-new');
      await createTestTables(db);
      const maintenanceModel = createMaintenanceModel(db);
      
      // Insert media with various senders
      await insertTestMedia(db, [
        { senderId: 'user1@c.us' },
        { senderId: 'user2@c.us' },
        { senderId: 'group1@g.us' }, // Group
        { senderId: 'user1@c.us' } // Duplicate
      ]);
      
      // One existing contact
      await insertTestContacts(db, [
        { senderId: 'user1@c.us', displayName: 'Existing User' }
      ]);
      
      const migratedCount = await maintenanceModel.migrateHistoricalContacts();
      
      assertEqual(migratedCount, 2, 'Should migrate 2 contacts'); // user2 and group1
      
      // Verify final contacts count
      const contactsCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM contacts', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      assertEqual(contactsCount, 3, 'Should have 3 total contacts');
      
      // Verify the migrated contacts have correct display names
      const newContacts = await new Promise((resolve, reject) => {
        db.all('SELECT sender_id, display_name FROM contacts WHERE sender_id != ?', ['user1@c.us'], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      assertLength(newContacts, 2, 'Should have 2 new contacts');
      
      const userContact = newContacts.find(c => c.sender_id === 'user2@c.us');
      assert(userContact !== undefined, 'Should have user2 contact');
      assert(userContact.display_name.startsWith('Usuário'), 'User contact should have user display name');
      
      const groupContact = newContacts.find(c => c.sender_id === 'group1@g.us');
      assert(groupContact !== undefined, 'Should have group1 contact');
      assert(groupContact.display_name.startsWith('Grupo'), 'Group contact should have group display name');
      
      await cleanup();
    }
  },

  {
    name: 'Migrate media with missing sender ID - no missing IDs',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('maintenance-missing-empty');
      await createTestTables(db);
      const maintenanceModel = createMaintenanceModel(db);
      
      // Insert media with all sender IDs present
      await insertTestMedia(db, [
        { senderId: 'user1@c.us' },
        { senderId: 'user2@c.us' }
      ]);
      
      const migratedCount = await maintenanceModel.migrateMediaWithMissingSenderId();
      
      assertEqual(migratedCount, 0, 'Should migrate 0 IDs');
      
      await cleanup();
    }
  },

  {
    name: 'Migrate media with missing sender ID - with missing IDs',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('maintenance-missing-ids');
      await createTestTables(db);
      const maintenanceModel = createMaintenanceModel(db);
      
      // Insert media with missing sender IDs
      await insertTestMedia(db, [
        { senderId: 'user1@c.us' },         // Has sender ID
        { senderId: null, chatId: 'chat1@c.us', groupId: null }, // Missing sender ID, use chat_id
        { senderId: '', chatId: 'chat2@c.us', groupId: 'group1@g.us' }, // Missing sender ID, use group_id
        { senderId: null, chatId: 'chat3@c.us', groupId: null }  // Missing sender ID, use chat_id
      ]);
      
      const migratedCount = await maintenanceModel.migrateMediaWithMissingSenderId();
      
      assertEqual(migratedCount, 3, 'Should migrate 3 IDs'); // 3 records with missing sender_id
      
      // Verify contacts were created
      const contactsCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM contacts', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      assertEqual(contactsCount, 3, 'Should have 3 contacts created');
      
      // Verify contact IDs and display names
      const contacts = await new Promise((resolve, reject) => {
        db.all('SELECT sender_id, display_name FROM contacts ORDER BY sender_id', (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      // Should have contacts for chat1@c.us, chat2@c.us (but used group1@g.us), chat3@c.us
      const expectedIds = ['chat1@c.us', 'group1@g.us', 'chat3@c.us'].sort();
      const actualIds = contacts.map(c => c.sender_id).sort();
      
      assertArrayEquals(actualIds, expectedIds, 'Should have correct sender IDs');
      
      // Verify display names are appropriate
      contacts.forEach(contact => {
        if (contact.sender_id.includes('@g.us')) {
          assert(contact.display_name.startsWith('Grupo'), 
                 `Group contact ${contact.sender_id} should have group display name`);
        } else {
          assert(contact.display_name.startsWith('Usuário'), 
                 `User contact ${contact.sender_id} should have user display name`);
        }
      });
      
      await cleanup();
    }
  },

  {
    name: 'Migration with custom logger',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('maintenance-custom-logger');
      await createTestTables(db);
      const maintenanceModel = createMaintenanceModel(db);
      
      // Insert media needing migration
      await insertTestMedia(db, [
        { senderId: 'user1@c.us' },
        { senderId: 'user2@c.us' }
      ]);
      
      // Custom logger to capture log messages
      const logMessages = [];
      const customLogger = {
        log: (msg) => logMessages.push({ type: 'log', message: msg }),
        error: (msg, err) => logMessages.push({ type: 'error', message: msg, error: err })
      };
      
      const migratedCount = await maintenanceModel.migrateHistoricalContacts(customLogger);
      
      assertEqual(migratedCount, 2, 'Should migrate 2 contacts');
      assert(logMessages.length > 0, 'Should have logged messages');
      
      const startMessage = logMessages.find(log => log.message.includes('Iniciando migração'));
      assert(startMessage !== undefined, 'Should have logged start message');
      
      const completeMessage = logMessages.find(log => log.message.includes('Migração completa'));
      assert(completeMessage !== undefined, 'Should have logged completion message');
      
      await cleanup();
    }
  }
];

async function main() {
  try {
    await runTestSuite('Maintenance Model Tests', tests);
  } catch (error) {
    console.error('Test suite failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { tests };