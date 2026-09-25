#!/usr/bin/env node

const { runTestSuite, assertEqual } = require('../helpers/testUtils');
const { createBaileysRpcStore } = require('../../src/server/baileysRpcStore');

const tests = [
  {
    name: 'Baileys RPC store exposes group names and participants',
    fn() {
      const store = createBaileysRpcStore({ maxMessagesPerChat: 5 });
      store.upsertGroups({
        '123@g.us': {
          id: '123@g.us',
          subject: 'Grupo Teste',
          participants: [{ id: '1@lid', admin: 'admin' }]
        }
      });
      const groups = store.getAllGroupsMetadata();
      assertEqual(groups.length, 1, 'should return one group');
      assertEqual(groups[0].subject, 'Grupo Teste', 'should preserve the group subject');
      assertEqual(groups[0].participants[0].id, '1@lid', 'should preserve participants');
      const chats = store.listChats();
      assertEqual(chats[0].name, 'Grupo Teste', 'listChats should expose the group name');
    }
  },
  {
    name: 'Baileys RPC store returns bounded chronological chat history',
    fn() {
      const store = createBaileysRpcStore({ maxMessagesPerChat: 3 });
      store.addMessages([
        { key: { id: 'm3', remoteJid: '123@g.us' }, messageTimestamp: 3, message: { conversation: 'three' } },
        { key: { id: 'm1', remoteJid: '123@g.us' }, messageTimestamp: 1, message: { conversation: 'one' } },
        { key: { id: 'm2', remoteJid: '123@g.us' }, messageTimestamp: 2, message: { conversation: 'two' } },
        { key: { id: 'm4', remoteJid: '123@g.us' }, messageTimestamp: 4, message: { conversation: 'four' } }
      ]);
      const history = store.getMessages('123@g.us', 2);
      assertEqual(history.length, 2, 'should honor requested limit');
      assertEqual(history[0].key.id, 'm3', 'should return chronological retained history');
      assertEqual(history[1].key.id, 'm4', 'should return the newest retained message last');
    }
  },
  {
    name: 'Baileys RPC store restores persisted chats, groups and messages',
    fn() {
      const first = createBaileysRpcStore({ maxMessagesPerChat: 5 });
      first.upsertGroups({ '789@g.us': { id: '789@g.us', subject: 'Persistido', participants: [] } });
      first.addMessages([{ key: { id: 'p1', remoteJid: '789@g.us' }, messageTimestamp: 12, message: { conversation: 'persist me' } }]);
      const second = createBaileysRpcStore({ maxMessagesPerChat: 5, initialState: first.exportState() });
      assertEqual(second.getAllGroupsMetadata()[0].subject, 'Persistido', 'should restore group metadata');
      assertEqual(second.getMessages('789@g.us', 5)[0].key.id, 'p1', 'should restore bounded history');
    }
  },
  {
    name: 'Baileys RPC store merges history sync chats and messages',
    fn() {
      const store = createBaileysRpcStore({ maxMessagesPerChat: 5 });
      store.ingestHistory({
        chats: [{ id: '456@g.us', name: 'Histórico' }],
        messages: [{ key: { id: 'h1', remoteJid: '456@g.us' }, messageTimestamp: 10, message: { conversation: 'hello' } }]
      });
      assertEqual(store.listChats()[0].name, 'Histórico', 'should retain history-sync chat names');
      assertEqual(store.getMessages('456@g.us', 5)[0].key.id, 'h1', 'should retain history-sync messages');
    }
  }
];

if (require.main === module) {
  runTestSuite('Baileys RPC Store Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tests };
