#!/usr/bin/env node
/**
 * Unit tests for Ban command handler
 */

const { assert, assertEqual } = require('../helpers/testUtils');

// Mock WhatsApp client for testing
class MockWhatsAppClient {
  constructor() {
    this.sentMessages = [];
    this.groupParticipantsUpdateCalls = [];
  }

  async sendText(chatId, text) {
    this.sentMessages.push({ chatId, text, type: 'text' });
  }

  async reply(chatId, message, replyId) {
    this.sentMessages.push({ chatId, message, replyId, type: 'reply' });
  }

  async groupParticipantsUpdate(groupId, participants, action) {
    this.groupParticipantsUpdateCalls.push({ groupId, participants, action });
  }

  reset() {
    this.sentMessages = [];
    this.groupParticipantsUpdateCalls = [];
  }
}

// Mock database functions
const mockDatabase = {
  resolveSenderId: async (client, senderId) => senderId
};

// Load handler
function loadBanHandler() {
  const resolve = request => {
    try {
      return require.resolve(request);
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  };

  const handlerPath = resolve('../../commands/handlers/ban');
  if (handlerPath) {
    delete require.cache[handlerPath];
  }

  const databaseModules = ['../../database', '../../database/index.js'];
  const modulePaths = Array.from(
    new Set(databaseModules.map(resolve).filter(Boolean))
  );

  const originals = modulePaths.map(path => ({ path, module: require.cache[path] }));

  modulePaths.forEach(path => {
    require.cache[path] = { exports: mockDatabase };
  });

  try {
    return require('../../commands/handlers/ban');
  } finally {
    modulePaths.forEach((path, index) => {
      const original = originals[index].module;
      if (original) {
        require.cache[path] = original;
      } else {
        delete require.cache[path];
      }
    });

    if (handlerPath) {
      delete require.cache[handlerPath];
    }
  }
}

const tests = [
  {
    name: 'Ban command works with admin and mentioned user in group',
    fn: async () => {
      const { handleBanCommand } = loadBanHandler();
      const client = new MockWhatsAppClient();
      
      const message = {
        body: '#ban @user',
        id: 'test-message-id',
        from: '123456789@g.us', // Group chat
        mentionedJid: ['5511999999999@c.us'], // Mentioned user
        sender: { isAdmin: true },
        key: {
          participant: '5511888888888@c.us' // Admin sender
        }
      };
      
      const chatId = '123456789@g.us';
      const context = { 
        isGroup: true, 
        groupId: '123456789@g.us'
      };
      
      const previousAdminNumber = process.env.ADMIN_NUMBER;
      process.env.ADMIN_NUMBER = '5511888888888@c.us';

      try {
        await handleBanCommand(client, message, chatId, [], context);

        // Check that groupParticipantsUpdate was called
        assertEqual(client.groupParticipantsUpdateCalls.length, 1, 'Should call groupParticipantsUpdate once');
        assertEqual(client.groupParticipantsUpdateCalls[0].groupId, '123456789@g.us', 'Should use correct group ID');
        assertEqual(client.groupParticipantsUpdateCalls[0].participants[0], '5511999999999@c.us', 'Should target mentioned user');
        assertEqual(client.groupParticipantsUpdateCalls[0].action, 'remove', 'Should use remove action');

        // Check success message
        assert(client.sentMessages.length > 0, 'Should send a confirmation message');
        const messageText = client.sentMessages[0].message || client.sentMessages[0].text;
        assert(messageText && messageText.includes('✅'), 'Should send success message');
      } finally {
        if (previousAdminNumber === undefined) {
          delete process.env.ADMIN_NUMBER;
        } else {
          process.env.ADMIN_NUMBER = previousAdminNumber;
        }
      }
    }
  },

  {
    name: 'Ban command resolves mention from text using group metadata fallback',
    fn: async () => {
      const { handleBanCommand } = loadBanHandler();
      const client = new MockWhatsAppClient();

      const message = {
        body: '#ban @20018943291402',
        id: 'test-message-id',
        from: '123456789@g.us',
        sender: { isAdmin: true },
        key: {
          participant: '5511888888888@c.us'
        },
        groupMetadata: {
          participants: [
            { id: '5511888888888@c.us', isAdmin: true },
            { id: '20018943291402@lid' }
          ]
        }
      };

      const chatId = '123456789@g.us';
      const context = {
        isGroup: true,
        groupId: '123456789@g.us',
        groupMetadata: message.groupMetadata
      };

      const previousAdminNumber = process.env.ADMIN_NUMBER;
      process.env.ADMIN_NUMBER = '5511888888888@c.us';

      try {
        await handleBanCommand(client, message, chatId, [], context);

        assertEqual(client.groupParticipantsUpdateCalls.length, 1, 'Should call groupParticipantsUpdate once');
        assertEqual(client.groupParticipantsUpdateCalls[0].participants[0], '20018943291402@lid', 'Should resolve LID from text mention');

        const messageText = client.sentMessages[0].message || client.sentMessages[0].text;
        assert(messageText && messageText.includes('✅'), 'Should send success message');
      } finally {
        if (previousAdminNumber === undefined) {
          delete process.env.ADMIN_NUMBER;
        } else {
          process.env.ADMIN_NUMBER = previousAdminNumber;
        }
      }
    }
  },
  
  {
    name: 'Ban command rejects non-admin users',
    fn: async () => {
      const { handleBanCommand } = loadBanHandler();
      const client = new MockWhatsAppClient();
      
      const message = {
        body: '#ban @user',
        id: 'test-message-id',
        from: '123456789@g.us',
        mentionedJid: ['5511999999999@c.us'],
        sender: { isAdmin: false },
        key: {
          participant: '5511777777777@c.us' // Non-admin sender
        }
      };
      
      const chatId = '123456789@g.us';
      const context = { 
        isGroup: true, 
        groupId: '123456789@g.us'
      };
      
      const previousAdminNumber = process.env.ADMIN_NUMBER;
      delete process.env.ADMIN_NUMBER;

      try {
        await handleBanCommand(client, message, chatId, [], context);

        // Check that groupParticipantsUpdate was NOT called
        assertEqual(client.groupParticipantsUpdateCalls.length, 0, 'Should not call groupParticipantsUpdate for non-admin');

        // Check error message
        assert(client.sentMessages.length > 0, 'Should send an error message');
        const messageText = client.sentMessages[0].message || client.sentMessages[0].text;
        assert(messageText && messageText.includes('administradores'), 'Should send admin-only message');
      } finally {
        if (previousAdminNumber === undefined) {
          delete process.env.ADMIN_NUMBER;
        } else {
          process.env.ADMIN_NUMBER = previousAdminNumber;
        }
      }
    }
  },
  
  {
    name: 'Ban command rejects when no user is mentioned',
    fn: async () => {
      const { handleBanCommand } = loadBanHandler();
      const client = new MockWhatsAppClient();
      
      const message = {
        body: '#ban',
        id: 'test-message-id',
        from: '123456789@g.us',
        mentionedJid: [], // No mentioned user
        sender: { isAdmin: true },
        key: {
          participant: '5511888888888@c.us'
        }
      };
      
      const chatId = '123456789@g.us';
      const context = { 
        isGroup: true, 
        groupId: '123456789@g.us'
      };
      
      const previousAdminNumber = process.env.ADMIN_NUMBER;
      process.env.ADMIN_NUMBER = '5511888888888@c.us';

      try {
        await handleBanCommand(client, message, chatId, [], context);

        // Check that groupParticipantsUpdate was NOT called
        assertEqual(client.groupParticipantsUpdateCalls.length, 0, 'Should not call groupParticipantsUpdate without mention');

        // Check error message
        assert(client.sentMessages.length > 0, 'Should send an error message');
        const messageText = client.sentMessages[0].message || client.sentMessages[0].text;
        assert(messageText && messageText.includes('mencionar'), 'Should ask for mention');
      } finally {
        if (previousAdminNumber === undefined) {
          delete process.env.ADMIN_NUMBER;
        } else {
          process.env.ADMIN_NUMBER = previousAdminNumber;
        }
      }
    }
  },
  
  {
    name: 'Ban command rejects in non-group chats',
    fn: async () => {
      const { handleBanCommand } = loadBanHandler();
      const client = new MockWhatsAppClient();
      
      const message = {
        body: '#ban @user',
        id: 'test-message-id',
        from: '5511888888888@c.us', // Private chat
        mentionedJid: ['5511999999999@c.us'],
        sender: { isAdmin: true },
        key: {
          participant: '5511888888888@c.us'
        }
      };
      
      const chatId = '5511888888888@c.us';
      const context = { 
        isGroup: false
      };
      
      await handleBanCommand(client, message, chatId, [], context);
      
      // Check that groupParticipantsUpdate was NOT called
      assertEqual(client.groupParticipantsUpdateCalls.length, 0, 'Should not call groupParticipantsUpdate in private chat');
      
      // Check error message
      assert(client.sentMessages.length > 0, 'Should send an error message');
      const messageText = client.sentMessages[0].message || client.sentMessages[0].text;
      assert(messageText && messageText.includes('grupos'), 'Should indicate group-only command');
    }
  },

  {
    name: 'extractMentionedJid extracts from message.mentionedJid',
    fn: async () => {
      const { extractMentionedJid } = loadBanHandler();
      
      const message = {
        mentionedJid: ['5511999999999@c.us', '5511888888888@c.us']
      };
      
      const result = extractMentionedJid(message);
      assertEqual(result, '5511999999999@c.us', 'Should extract first mentioned JID');
    }
  },
  
  {
    name: 'extractMentionedJid returns null when no mention',
    fn: async () => {
      const { extractMentionedJid } = loadBanHandler();

      const message = {
        body: '#ban'
      };

      const result = extractMentionedJid(message);
      assertEqual(result, null, 'Should return null when no mention');
    }
  },

  {
    name: 'extractMentionedJid handles contextInfo mentions from LID users',
    fn: async () => {
      const { extractMentionedJid } = loadBanHandler();

      const message = {
        body: '#ban @user',
        contextInfo: {
          mentionedJid: ['20018943291402@LID'],
          participant: '20018943291402@LID'
        },
        message: {
          extendedTextMessage: {
            contextInfo: {
              mentionedJid: ['20018943291402:12@LID']
            }
          }
        }
      };

      const result = extractMentionedJid(message);
      assertEqual(result, '20018943291402:12@lid', 'Should normalize and return first valid mentioned JID');
    }
  }
];

// Run tests if called directly
async function main() {
  const { runTestSuite } = require('../helpers/testUtils');
  try {
    await runTestSuite('Ban Command Tests', tests);
  } catch (error) {
    console.error('Test suite failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { tests, MockWhatsAppClient };
