#!/usr/bin/env node
/**
 * Unit tests for contacts model
 */

const path = require('path');
const { createTestDatabase, createTestTables, insertTestMedia, insertTestContacts, assert, assertEqual, assertLength, runTestSuite } = require('../helpers/testUtils');

// Mock the contacts model
function createContactsModel(db) {
  const contactsModel = {
    getTop5UsersByStickerCount() {
      return new Promise((resolve) => {
        db.all(
          `SELECT 
             c.display_name,
             m.sender_id as effective_sender,
             CASE WHEN m.sender_id LIKE '%@g.us' THEN 1 ELSE 0 END as is_group,
             CASE WHEN m.sender_id LIKE '%@g.us' THEN m.sender_id ELSE NULL END as group_id,
             COUNT(m.id) as sticker_count,
             SUM(m.count_random) as total_usos
           FROM media m
           LEFT JOIN contacts c ON m.sender_id = c.sender_id
           WHERE m.sender_id IS NOT NULL
           GROUP BY m.sender_id
           ORDER BY sticker_count DESC
           LIMIT 5`,
          (err, rows) => {
            resolve(err ? [] : rows);
          }
        );
      });
    },

    upsertContact(senderId, displayName) {
      return new Promise((resolve, reject) => {
        if (!senderId) {
          resolve();
          return;
        }
        
        db.run(
          `INSERT OR REPLACE INTO contacts (sender_id, display_name, updated_at)
           VALUES (?, ?, strftime('%s','now'))`,
          [senderId, displayName],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    },

    getContactBySenderId(senderId) {
      return new Promise((resolve) => {
        db.get(
          'SELECT * FROM contacts WHERE sender_id = ?',
          [senderId],
          (err, row) => {
            resolve(err ? null : (row || null));
          }
        );
      });
    },

    getAllContacts() {
      return new Promise((resolve) => {
        db.all(
          'SELECT * FROM contacts ORDER BY display_name',
          (err, rows) => {
            resolve(err ? [] : rows);
          }
        );
      });
    },

    updateContactDisplayName(senderId, newDisplayName) {
      return new Promise((resolve, reject) => {
        db.run(
          'UPDATE contacts SET display_name = ?, updated_at = strftime(\'%s\',\'now\') WHERE sender_id = ?',
          [newDisplayName, senderId],
          function(err) {
            if (err) reject(err);
            else resolve(this.changes);
          }
        );
      });
    },

    deleteContact(senderId) {
      return new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM contacts WHERE sender_id = ?',
          [senderId],
          function(err) {
            if (err) reject(err);
            else resolve(this.changes);
          }
        );
      });
    },

    getContactsCount() {
      return new Promise((resolve) => {
        db.get(
          'SELECT COUNT(*) as count FROM contacts',
          (err, row) => {
            resolve(err ? 0 : row.count);
          }
        );
      });
    },

    searchContacts(searchTerm) {
      return new Promise((resolve) => {
        db.all(
          'SELECT * FROM contacts WHERE display_name LIKE ? OR sender_id LIKE ? ORDER BY display_name',
          [`%${searchTerm}%`, `%${searchTerm}%`],
          (err, rows) => {
            resolve(err ? [] : rows);
          }
        );
      });
    }
  };

  return contactsModel;
}

const tests = [
  {
    name: 'Upsert contact - insert new',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('contacts-upsert-new');
      await createTestTables(db);
      const contactsModel = createContactsModel(db);
      
      // Insert new contact
      await contactsModel.upsertContact('test@c.us', 'Test User');
      
      // Verify contact was inserted
      const contact = await contactsModel.getContactBySenderId('test@c.us');
      assert(contact !== null, 'Contact should exist');
      assertEqual(contact.sender_id, 'test@c.us', 'Sender ID should match');
      assertEqual(contact.display_name, 'Test User', 'Display name should match');
      assert(typeof contact.updated_at === 'number', 'Updated at should be a number');
      
      await cleanup();
    }
  },

  {
    name: 'Upsert contact - update existing',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('contacts-upsert-update');
      await createTestTables(db);
      const contactsModel = createContactsModel(db);
      
      // Insert initial contact
      await insertTestContacts(db, [{ senderId: 'test@c.us', displayName: 'Original Name' }]);
      
      // Update existing contact
      await contactsModel.upsertContact('test@c.us', 'Updated Name');
      
      // Verify contact was updated
      const contact = await contactsModel.getContactBySenderId('test@c.us');
      assert(contact !== null, 'Contact should still exist');
      assertEqual(contact.sender_id, 'test@c.us', 'Sender ID should match');
      assertEqual(contact.display_name, 'Updated Name', 'Display name should be updated');
      
      // Verify no duplicate was created
      const count = await contactsModel.getContactsCount();
      assertEqual(count, 1, 'Should still have only one contact');
      
      await cleanup();
    }
  },

  {
    name: 'Upsert contact - handle null sender ID',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('contacts-upsert-null');
      await createTestTables(db);
      const contactsModel = createContactsModel(db);
      
      // Should not throw error with null sender ID
      await contactsModel.upsertContact(null, 'Test User');
      await contactsModel.upsertContact('', 'Test User');
      await contactsModel.upsertContact(undefined, 'Test User');
      
      // Verify no contacts were created
      const count = await contactsModel.getContactsCount();
      assertEqual(count, 0, 'Should have no contacts');
      
      await cleanup();
    }
  },

  {
    name: 'Get contact by sender ID',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('contacts-get-by-id');
      await createTestTables(db);
      const contactsModel = createContactsModel(db);
      
      // Insert test contacts
      await insertTestContacts(db, [
        { senderId: 'user1@c.us', displayName: 'User One' },
        { senderId: 'user2@c.us', displayName: 'User Two' }
      ]);
      
      // Test existing contact
      const contact1 = await contactsModel.getContactBySenderId('user1@c.us');
      assert(contact1 !== null, 'Should find existing contact');
      assertEqual(contact1.display_name, 'User One', 'Display name should match');
      
      // Test non-existent contact
      const nonExistent = await contactsModel.getContactBySenderId('nonexistent@c.us');
      assert(nonExistent === null, 'Should return null for non-existent contact');
      
      await cleanup();
    }
  },

  {
    name: 'Get all contacts',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('contacts-get-all');
      await createTestTables(db);
      const contactsModel = createContactsModel(db);
      
      // Initially no contacts
      let contacts = await contactsModel.getAllContacts();
      assertLength(contacts, 0, 'Should initially have no contacts');
      
      // Insert test contacts
      await insertTestContacts(db, [
        { senderId: 'user1@c.us', displayName: 'Charlie' },
        { senderId: 'user2@c.us', displayName: 'Alice' },
        { senderId: 'user3@c.us', displayName: 'Bob' }
      ]);
      
      // Get all contacts
      contacts = await contactsModel.getAllContacts();
      assertLength(contacts, 3, 'Should have 3 contacts');
      
      // Verify ordering (should be alphabetical by display name)
      assertEqual(contacts[0].display_name, 'Alice', 'First contact should be Alice');
      assertEqual(contacts[1].display_name, 'Bob', 'Second contact should be Bob');
      assertEqual(contacts[2].display_name, 'Charlie', 'Third contact should be Charlie');
      
      await cleanup();
    }
  },

  {
    name: 'Update contact display name',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('contacts-update-name');
      await createTestTables(db);
      const contactsModel = createContactsModel(db);
      
      // Insert test contact
      await insertTestContacts(db, [{ senderId: 'user@c.us', displayName: 'Original Name' }]);
      
      // Update display name
      const changes = await contactsModel.updateContactDisplayName('user@c.us', 'New Name');
      assertEqual(changes, 1, 'Should update one record');
      
      // Verify update
      const contact = await contactsModel.getContactBySenderId('user@c.us');
      assertEqual(contact.display_name, 'New Name', 'Display name should be updated');
      
      // Test updating non-existent contact
      const noChanges = await contactsModel.updateContactDisplayName('nonexistent@c.us', 'New Name');
      assertEqual(noChanges, 0, 'Should not update non-existent contact');
      
      await cleanup();
    }
  },

  {
    name: 'Delete contact',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('contacts-delete');
      await createTestTables(db);
      const contactsModel = createContactsModel(db);
      
      // Insert test contacts
      await insertTestContacts(db, [
        { senderId: 'user1@c.us', displayName: 'User One' },
        { senderId: 'user2@c.us', displayName: 'User Two' }
      ]);
      
      // Delete one contact
      const changes = await contactsModel.deleteContact('user1@c.us');
      assertEqual(changes, 1, 'Should delete one record');
      
      // Verify deletion
      const deletedContact = await contactsModel.getContactBySenderId('user1@c.us');
      assert(deletedContact === null, 'Contact should be deleted');
      
      const remainingContact = await contactsModel.getContactBySenderId('user2@c.us');
      assert(remainingContact !== null, 'Other contact should remain');
      
      // Verify count
      const count = await contactsModel.getContactsCount();
      assertEqual(count, 1, 'Should have 1 contact remaining');
      
      await cleanup();
    }
  },

  {
    name: 'Search contacts',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('contacts-search');
      await createTestTables(db);
      const contactsModel = createContactsModel(db);
      
      // Insert test contacts
      await insertTestContacts(db, [
        { senderId: 'alice@c.us', displayName: 'Alice Smith' },
        { senderId: 'bob@c.us', displayName: 'Bob Johnson' },
        { senderId: 'charlie@c.us', displayName: 'Charlie Brown' },
        { senderId: 'david@email.com', displayName: 'David Wilson' }
      ]);
      
      // Search by display name
      let results = await contactsModel.searchContacts('Alice');
      assertLength(results, 1, 'Should find 1 contact with Alice');
      assertEqual(results[0].display_name, 'Alice Smith', 'Should find Alice Smith');
      
      // Search by partial display name
      results = await contactsModel.searchContacts('Bro');
      assertLength(results, 1, 'Should find 1 contact with "Bro"');
      assertEqual(results[0].display_name, 'Charlie Brown', 'Should find Charlie Brown');
      
      // Search by sender ID
      results = await contactsModel.searchContacts('bob@c.us');
      assertLength(results, 1, 'Should find 1 contact with bob@c.us');
      assertEqual(results[0].display_name, 'Bob Johnson', 'Should find Bob Johnson');
      
      // Search by partial sender ID
      results = await contactsModel.searchContacts('@c.us');
      assertLength(results, 3, 'Should find 3 contacts with @c.us');
      
      // Search with no results
      results = await contactsModel.searchContacts('nonexistent');
      assertLength(results, 0, 'Should find no contacts for nonexistent term');
      
      await cleanup();
    }
  },

  {
    name: 'Get top 5 users by sticker count',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('contacts-top5');
      await createTestTables(db);
      const contactsModel = createContactsModel(db);
      
      // Insert contacts
      await insertTestContacts(db, [
        { senderId: 'user1@c.us', displayName: 'User One' },
        { senderId: 'user2@c.us', displayName: 'User Two' },
        { senderId: 'user3@c.us', displayName: 'User Three' }
      ]);
      
      // Insert media with different counts
      await insertTestMedia(db, [
        { senderId: 'user1@c.us', countRandom: 10 }, // 1 sticker, 10 uses
        { senderId: 'user1@c.us', countRandom: 5 },  // 2 stickers total, 15 uses
        { senderId: 'user2@c.us', countRandom: 20 }, // 1 sticker, 20 uses  
        { senderId: 'user3@c.us', countRandom: 3 },  // 1 sticker, 3 uses
        { senderId: 'unknown@c.us', countRandom: 1 } // No contact record
      ]);
      
      const top5 = await contactsModel.getTop5UsersByStickerCount();
      
      assert(top5.length > 0, 'Should return users');
      assert(top5.length <= 5, 'Should return max 5 users');
      
      // Should be ordered by sticker count (sticker_count) DESC
      // user1 should be first (2 stickers)
      const user1 = top5.find(u => u.display_name === 'User One');
      assert(user1 !== undefined, 'Should include User One');
      assertEqual(user1.sticker_count, 2, 'User One should have 2 stickers');
      assertEqual(user1.total_usos, 15, 'User One should have 15 total uses');
      assertEqual(user1.effective_sender, 'user1@c.us', 'User One should have correct sender_id');
      assertEqual(user1.is_group, 0, 'User One should not be a group');
      
      // user2 and user3 should have 1 sticker each
      const user2 = top5.find(u => u.display_name === 'User Two');
      assert(user2 !== undefined, 'Should include User Two');
      assertEqual(user2.sticker_count, 1, 'User Two should have 1 sticker');
      assertEqual(user2.total_usos, 20, 'User Two should have 20 total uses');
      
      // Unknown user should have null display_name but valid effective_sender
      const unknownUser = top5.find(u => u.display_name === null);
      assert(unknownUser !== undefined, 'Should include unknown user with null display_name');
      assertEqual(unknownUser.effective_sender, 'unknown@c.us', 'Unknown user should have correct sender_id');
      
      await cleanup();
    }
  }
];

async function main() {
  try {
    await runTestSuite('Contacts Model Tests', tests);
  } catch (error) {
    console.error('Test suite failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { tests };