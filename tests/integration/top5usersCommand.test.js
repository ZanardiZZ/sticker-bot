#!/usr/bin/env node
/**
 * Integration test for top5users command handler
 */

const path = require('path');
const { createTestDatabase, createTestTables, insertTestMedia, insertTestContacts, assert, assertEqual, assertLength, runTestSuite } = require('../helpers/testUtils');

// Mock the database module
function createMockDatabase(db) {
  return {
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
    }
  };
}

// Mock the command handler with the actual logic
function createCommandHandler(mockDb) {
  return {
    async handleTop5UsersCommand(client, message, chatId) {
      const replies = [];
      const mockSafeReply = async (client, chatId, text, messageId) => {
        replies.push(text);
      };
      
      try {
        const topUsers = await mockDb.getTop5UsersByStickerCount();
        if (!topUsers || topUsers.length === 0) {
          await mockSafeReply(client, chatId, 'Nenhum usuário encontrado.', message.id);
          return replies;
        }

        let reply = 'Top 5 usuários que enviaram figurinhas:\n\n';

        for (let i = 0; i < topUsers.length; i++) {
          const user = topUsers[i];
          let userName = (user.display_name && user.display_name.trim()) || null;

          // Se é um grupo, usa o nome do grupo ou gera um nome baseado no ID
          if (user.is_group) {
            if (!userName && user.group_id) {
              userName = `Grupo ${user.group_id.replace('@g.us', '').substring(0, 10)}...`;
            }
            userName = userName || 'Grupo desconhecido';
          } else {
            // Para usuários individuais, tenta buscar informações do contato
            if (!userName && user.effective_sender) {
              try {
                const contact = await client.getContact(user.effective_sender);
                userName =
                  contact?.pushname ||
                  contact?.formattedName ||
                  contact?.notifyName ||
                  contact?.name ||
                  null;
              } catch {
                // ignore
              }
            }

            if (!userName) {
              userName = user.effective_sender ? String(user.effective_sender).split('@')[0] : 'Desconhecido';
            }
          }

          reply += `${i + 1}. ${userName} - ${user.sticker_count} figurinhas\n`;
        }

        await mockSafeReply(client, chatId, reply, message.id);
        return replies;
      } catch (err) {
        console.error('Erro ao buscar top 5 usuários:', err);
        await mockSafeReply(client, chatId, 'Erro ao buscar top 5 usuários.', message.id);
        return replies;
      }
    }
  };
}

const tests = [
  {
    name: 'Top5users command - users with display names',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('top5users-with-names');
      await createTestTables(db);
      const mockDb = createMockDatabase(db);
      const handler = createCommandHandler(mockDb);
      
      // Insert contacts with display names
      await insertTestContacts(db, [
        { senderId: 'user1@c.us', displayName: 'Alice' },
        { senderId: 'user2@c.us', displayName: 'Bob' },
        { senderId: 'user3@c.us', displayName: 'Charlie' }
      ]);
      
      // Insert media with different counts
      await insertTestMedia(db, [
        { senderId: 'user1@c.us', countRandom: 10 },
        { senderId: 'user1@c.us', countRandom: 5 },
        { senderId: 'user2@c.us', countRandom: 20 },
        { senderId: 'user3@c.us', countRandom: 3 }
      ]);
      
      // Mock client and message
      const mockClient = { getContact: async () => null };
      const mockMessage = { id: 'msg123' };
      
      const replies = await handler.handleTop5UsersCommand(mockClient, mockMessage, 'chat123');
      
      assertLength(replies, 1, 'Should send one reply');
      const reply = replies[0];
      
      assert(reply.includes('Top 5 usuários que enviaram figurinhas'), 'Should have header');
      assert(reply.includes('Alice - 2 figurinhas'), 'Should show Alice with 2 stickers');
      assert(reply.includes('Bob - 1 figurinhas') || reply.includes('Charlie - 1 figurinhas'), 'Should show Bob or Charlie with 1 sticker');
      assert(!reply.includes('undefined'), 'Should not contain undefined');
      assert(!reply.includes('Desconhecido'), 'Should not have unknown users when names exist');
      
      await cleanup();
    }
  },

  {
    name: 'Top5users command - users without display names (fallback to sender_id)',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('top5users-no-names');
      await createTestTables(db);
      const mockDb = createMockDatabase(db);
      const handler = createCommandHandler(mockDb);
      
      // Insert media without contacts
      await insertTestMedia(db, [
        { senderId: '5511999999999@c.us', countRandom: 10 },
        { senderId: '5511888888888@c.us', countRandom: 5 }
      ]);
      
      // Mock client and message
      const mockClient = { getContact: async () => null };
      const mockMessage = { id: 'msg123' };
      
      const replies = await handler.handleTop5UsersCommand(mockClient, mockMessage, 'chat123');
      
      assertLength(replies, 1, 'Should send one reply');
      const reply = replies[0];
      
      assert(reply.includes('Top 5 usuários que enviaram figurinhas'), 'Should have header');
      assert(reply.includes('1. 5511999999999 - 1 figurinhas'), 'Should show first user with phone number');
      assert(reply.includes('2. 5511888888888 - 1 figurinhas'), 'Should show second user with phone number');
      assert(!reply.includes('undefined'), 'Should not contain undefined');
      assert(!reply.includes('Desconhecido'), 'Should use sender_id instead of "Desconhecido"');
      
      await cleanup();
    }
  },

  {
    name: 'Top5users command - group stickers',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('top5users-groups');
      await createTestTables(db);
      const mockDb = createMockDatabase(db);
      const handler = createCommandHandler(mockDb);
      
      // Insert group contact
      await insertTestContacts(db, [
        { senderId: '123456789@g.us', displayName: 'My Test Group' }
      ]);
      
      // Insert media from group
      await insertTestMedia(db, [
        { senderId: '123456789@g.us', countRandom: 15 },
        { senderId: '123456789@g.us', countRandom: 8 }
      ]);
      
      // Mock client and message
      const mockClient = { getContact: async () => null };
      const mockMessage = { id: 'msg123' };
      
      const replies = await handler.handleTop5UsersCommand(mockClient, mockMessage, 'chat123');
      
      assertLength(replies, 1, 'Should send one reply');
      const reply = replies[0];
      
      assert(reply.includes('Top 5 usuários que enviaram figurinhas'), 'Should have header');
      assert(reply.includes('1. My Test Group - 2 figurinhas'), 'Should show group with display name');
      assert(!reply.includes('undefined'), 'Should not contain undefined');
      
      await cleanup();
    }
  },

  {
    name: 'Top5users command - group without display name (fallback)',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('top5users-groups-no-name');
      await createTestTables(db);
      const mockDb = createMockDatabase(db);
      const handler = createCommandHandler(mockDb);
      
      // Insert media from group without contact entry
      await insertTestMedia(db, [
        { senderId: '987654321@g.us', countRandom: 10 }
      ]);
      
      // Mock client and message
      const mockClient = { getContact: async () => null };
      const mockMessage = { id: 'msg123' };
      
      const replies = await handler.handleTop5UsersCommand(mockClient, mockMessage, 'chat123');
      
      assertLength(replies, 1, 'Should send one reply');
      const reply = replies[0];
      
      assert(reply.includes('Top 5 usuários que enviaram figurinhas'), 'Should have header');
      assert(reply.includes('1. Grupo 987654321'), 'Should show group with generated name from ID');
      assert(!reply.includes('undefined'), 'Should not contain undefined');
      
      await cleanup();
    }
  },

  {
    name: 'Top5users command - no users found',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('top5users-empty');
      await createTestTables(db);
      const mockDb = createMockDatabase(db);
      const handler = createCommandHandler(mockDb);
      
      // Mock client and message
      const mockClient = { getContact: async () => null };
      const mockMessage = { id: 'msg123' };
      
      const replies = await handler.handleTop5UsersCommand(mockClient, mockMessage, 'chat123');
      
      assertLength(replies, 1, 'Should send one reply');
      assertEqual(replies[0], 'Nenhum usuário encontrado.', 'Should show no users message');
      
      await cleanup();
    }
  },

  {
    name: 'Top5users command - mixed users and groups',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('top5users-mixed');
      await createTestTables(db);
      const mockDb = createMockDatabase(db);
      const handler = createCommandHandler(mockDb);
      
      // Insert mixed contacts
      await insertTestContacts(db, [
        { senderId: 'user1@c.us', displayName: 'Regular User' },
        { senderId: '123456789@g.us', displayName: 'Test Group' }
      ]);
      
      // Insert media from both
      await insertTestMedia(db, [
        { senderId: 'user1@c.us', countRandom: 10 },
        { senderId: 'user1@c.us', countRandom: 5 },
        { senderId: 'user1@c.us', countRandom: 3 },
        { senderId: '123456789@g.us', countRandom: 15 },
        { senderId: '123456789@g.us', countRandom: 8 },
        { senderId: 'unknown@c.us', countRandom: 1 }
      ]);
      
      // Mock client and message
      const mockClient = { getContact: async () => null };
      const mockMessage = { id: 'msg123' };
      
      const replies = await handler.handleTop5UsersCommand(mockClient, mockMessage, 'chat123');
      
      assertLength(replies, 1, 'Should send one reply');
      const reply = replies[0];
      
      assert(reply.includes('Top 5 usuários que enviaram figurinhas'), 'Should have header');
      assert(reply.includes('1. Regular User - 3 figurinhas'), 'Should show user with most stickers first');
      assert(reply.includes('2. Test Group - 2 figurinhas'), 'Should show group second');
      assert(reply.includes('3. unknown - 1 figurinhas'), 'Should show unknown user with sender_id prefix');
      assert(!reply.includes('undefined'), 'Should not contain undefined');
      
      await cleanup();
    }
  }
];

async function main() {
  try {
    await runTestSuite('Top5Users Command Integration Tests', tests);
  } catch (error) {
    console.error('Test suite failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { tests };
