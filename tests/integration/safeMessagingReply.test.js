/**
 * Test for safeReply functionality - ensuring client.reply is used for groups/individual chats
 * and fallback to simulated reply format works correctly
 */

const { safeReply } = require('../../utils/safeMessaging');

// Mock client for testing different scenarios
class MockWhatsAppClient {
  constructor(options = {}) {
    this.calls = [];
    this.replyWorks = options.replyWorks !== false; // Default to working
    this.sendTextWorks = options.sendTextWorks !== false; // Default to working
  }

  async reply(chatId, message, replyId) {
    const call = { method: 'reply', chatId, message, replyId };
    this.calls.push(call);
    
    if (!this.replyWorks) {
      throw new Error('Mock reply failure');
    }
    
    return Promise.resolve();
  }

  async sendText(chatId, message) {
    const call = { method: 'sendText', chatId, message };
    this.calls.push(call);
    
    if (!this.sendTextWorks) {
      throw new Error('Mock sendText failure');
    }
    
    return Promise.resolve();
  }
}

async function testReplyForGroups() {
  console.log('\n=== Testing client.reply for groups (@g.us) ===');
  
  const client = new MockWhatsAppClient();
  const chatId = '123456789@g.us'; // Group chat
  const responseMessage = 'Test response';
  const originalMessage = { id: 'msg_123', body: 'Original message' };
  
  const result = await safeReply(client, chatId, responseMessage, originalMessage);
  
  console.log('Calls made:', client.calls);
  
  if (result && client.calls.length === 1 && client.calls[0].method === 'reply') {
    console.log('✅ SUCCESS: Used client.reply for group chat');
    return true;
  } else {
    console.error('❌ FAIL: Did not use client.reply for group chat');
    return false;
  }
}

async function testReplyForIndividualChats() {
  console.log('\n=== Testing client.reply for individual chats (@c.us) ===');
  
  const client = new MockWhatsAppClient();
  const chatId = '5511999999999@c.us'; // Individual chat
  const responseMessage = 'Test response';
  const originalMessage = { id: 'msg_456', body: 'Hello there' };
  
  const result = await safeReply(client, chatId, responseMessage, originalMessage);
  
  console.log('Calls made:', client.calls);
  
  if (result && client.calls.length === 1 && client.calls[0].method === 'reply') {
    console.log('✅ SUCCESS: Used client.reply for individual chat');
    return true;
  } else {
    console.error('❌ FAIL: Did not use client.reply for individual chat');
    return false;
  }
}

async function testFallbackToSimulatedReply() {
  console.log('\n=== Testing fallback to simulated reply format ===');
  
  const client = new MockWhatsAppClient({ replyWorks: false }); // Reply fails
  const chatId = '123456789@g.us'; // Group chat
  const responseMessage = 'My response';
  const originalMessage = { id: 'msg_789', body: 'What is your name?' };
  
  const result = await safeReply(client, chatId, responseMessage, originalMessage);
  
  console.log('Calls made:', client.calls);
  
  if (result && client.calls.length === 2) {
    const replyCall = client.calls[0];
    const sendTextCall = client.calls[1];
    
    if (replyCall.method === 'reply' && sendTextCall.method === 'sendText') {
      const expectedMessage = `Respondendo à sua mensagem: "${originalMessage.body}"\nMinha resposta: ${responseMessage}`;
      
      if (sendTextCall.message === expectedMessage) {
        console.log('✅ SUCCESS: Fallback to simulated reply with correct format');
        console.log('Simulated message:', sendTextCall.message);
        return true;
      } else {
        console.error('❌ FAIL: Simulated reply format incorrect');
        console.error('Expected:', expectedMessage);
        console.error('Got:', sendTextCall.message);
        return false;
      }
    }
  }
  
  console.error('❌ FAIL: Fallback behavior incorrect');
  return false;
}

async function testBackwardCompatibilityWithMessageId() {
  console.log('\n=== Testing backward compatibility (old signature with message ID) ===');
  
  const client = new MockWhatsAppClient();
  const chatId = '5511999999999@c.us';
  const responseMessage = 'Response text';
  const messageId = 'msg_old_format';
  
  // Call with old signature: safeReply(client, chatId, message, replyToId)
  const result = await safeReply(client, chatId, responseMessage, messageId);
  
  console.log('Calls made:', client.calls);
  
  if (result && client.calls.length === 1 && client.calls[0].method === 'reply') {
    console.log('✅ SUCCESS: Backward compatibility maintained');
    return true;
  } else {
    console.error('❌ FAIL: Backward compatibility broken');
    return false;
  }
}

async function testNonReplyableChat() {
  console.log('\n=== Testing non-replyable chat (not @c.us, @g.us, or @lid) ===');
  
  const client = new MockWhatsAppClient();
  const chatId = 'broadcast_12345'; // Not a regular chat
  const responseMessage = 'Broadcast response';
  const originalMessage = { id: 'msg_broadcast', body: 'Broadcast message' };
  
  const result = await safeReply(client, chatId, responseMessage, originalMessage);
  
  console.log('Calls made:', client.calls);
  
  if (result && client.calls.length === 1 && client.calls[0].method === 'sendText') {
    const sentMessage = client.calls[0].message;
    const expectedMessage = `Respondendo à sua mensagem: "${originalMessage.body}"\nMinha resposta: ${responseMessage}`;
    
    if (sentMessage === expectedMessage) {
      console.log('✅ SUCCESS: Non-replyable chat uses simulated reply format');
      return true;
    } else {
      console.error('❌ FAIL: Non-replyable chat format incorrect');
      return false;
    }
  } else {
    console.error('❌ FAIL: Non-replyable chat behavior incorrect');
    return false;
  }
}

async function testReplyForNewsletterChats() {
  console.log('\n=== Testing client.reply for newsletter chats (@lid) ===');
  
  const client = new MockWhatsAppClient();
  const chatId = '1234567890123456@lid'; // Newsletter chat
  const responseMessage = 'Newsletter response';
  const originalMessage = { id: 'msg_newsletter', body: 'Newsletter message' };
  
  const result = await safeReply(client, chatId, responseMessage, originalMessage);
  
  console.log('Calls made:', client.calls);
  
  if (result && client.calls.length === 1 && client.calls[0].method === 'reply') {
    console.log('✅ SUCCESS: Used client.reply for newsletter chat (@lid)');
    return true;
  } else {
    console.error('❌ FAIL: Did not use client.reply for newsletter chat (@lid)');
    return false;
  }
}

async function runAllSafeReplyTests() {
  console.log('🧪 SafeReply Functionality Tests');
  
  try {
    const test1 = await testReplyForGroups();
    const test2 = await testReplyForIndividualChats();
    const test3 = await testReplyForNewsletterChats();
    const test4 = await testFallbackToSimulatedReply();
    const test5 = await testBackwardCompatibilityWithMessageId();
    const test6 = await testNonReplyableChat();
    
    console.log('\n=== FINAL RESULTS ===');
    
    const allPassed = test1 && test2 && test3 && test4 && test5 && test6;
    
    if (allPassed) {
      console.log('✅ ALL SAFERELY TESTS PASSED');
      console.log('✅ client.reply works for @c.us, @g.us, and @lid');
      console.log('✅ Fallback to simulated reply format works');
      console.log('✅ Backward compatibility maintained');
    } else {
      console.error('❌ SOME SAFEREPLY TESTS FAILED');
      console.error('❌ SafeReply functionality needs attention');
    }
    
    return allPassed;
    
  } catch (error) {
    console.error('SafeReply test execution failed:', error);
    return false;
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllSafeReplyTests();
}

module.exports = { runAllSafeReplyTests };