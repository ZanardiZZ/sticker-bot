const fs = require('fs');
const path = require('path');
const { assert, assertEqual, runTestSuite } = require('../helpers/testUtils');

const projectRoot = path.resolve(__dirname, '..', '..');
const clientPath = path.join(projectRoot, 'src/client/memory-client.js');
const axiosPath = require.resolve('axios', { paths: [projectRoot] });
const originalEnv = {
  MEMORY_ENABLED: process.env.MEMORY_ENABLED,
  MEMORY_API_URL: process.env.MEMORY_API_URL,
  MEMORY_SEMANTIC_SEARCH_TIMEOUT_MS: process.env.MEMORY_SEMANTIC_SEARCH_TIMEOUT_MS,
  MEMORY_SEMANTIC_SEARCH_LIMIT: process.env.MEMORY_SEMANTIC_SEARCH_LIMIT
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const tests = [
  {
    name: 'OpenViking semantic memories reach user and group prompt context',
    fn: async () => {
      process.env.MEMORY_ENABLED = '1';
      process.env.MEMORY_API_URL = 'http://memory.semantic.test';
      process.env.MEMORY_SEMANTIC_SEARCH_TIMEOUT_MS = '600';
      process.env.MEMORY_SEMANTIC_SEARCH_LIMIT = '4';
      const calls = [];
      const memoryDir = path.join(projectRoot, 'storage/data/memory');
      const userFile = path.join(memoryDir, 'semantic-test-user.json');
      const groupFile = path.join(memoryDir, 'group_semantic-test-group.json');
      const originalUserFile = fs.existsSync(userFile) ? fs.readFileSync(userFile) : null;
      const originalGroupFile = fs.existsSync(groupFile) ? fs.readFileSync(groupFile) : null;
      fs.writeFileSync(userFile, JSON.stringify({ userId: 'semantic-test-user', facts: [], jokes: [], events: [], openvikingSessions: ['session-user-test'] }));
      fs.writeFileSync(groupFile, JSON.stringify({ userId: 'group:semantic-test-group', facts: [], jokes: [], events: [], openvikingSessions: ['session-group-test'] }));
      const originalAxios = require.cache[axiosPath];
      const originalClient = require.cache[require.resolve(clientPath)];
      require.cache[axiosPath] = {
        id: axiosPath,
        filename: axiosPath,
        loaded: true,
        exports: async config => {
          calls.push(config);
          if (config.url.includes('/api/v1/search/find')) {
            const group = String(config.headers['X-OpenViking-User']).startsWith('group_');
            return { data: { result: { memories: [
              { uri: group ? 'viking://group/memories/joke-cafe.md' : 'viking://user/memories/preferences/cafe.md', abstract: group ? 'A piada interna sobre café no grupo' : 'Daniel gosta de café', score: 0.93 },
              { uri: 'viking://user/memories/.overview.md', abstract: 'Índice que não deve entrar no prompt', score: 1 }
            ] } } };
          }
          if (config.url.includes('/api/events')) return { data: { events: [] } };
          return { data: {} };
        }
      };
      delete require.cache[require.resolve(clientPath)];
      try {
        const memory = require(clientPath);
        memory.init();
        const context = await memory.buildContext('semantic-test-group', ['semantic-test-user'], {
          senderId: 'semantic-test-user',
          query: 'café'
        });
        const userSemantic = context.users['semantic-test-user'].semanticMemories;
        assertEqual(userSemantic.length, 1, 'one concrete user memory should be recovered');
        assertEqual(context.semanticMemories.length, 1, 'one concrete group memory should be recovered');
        assert(context.memoryPrompt.includes('Daniel gosta de café'), 'user semantic memory should reach prompt');
        assert(context.memoryPrompt.includes('piada interna sobre café'), 'group semantic memory should reach prompt');
        assert(calls.some(call => call.headers['X-OpenViking-User'] === 'group_semantic-test-group'), 'group identity must be sanitized for OpenViking');
      } finally {
        delete require.cache[require.resolve(clientPath)];
        if (originalClient) require.cache[require.resolve(clientPath)] = originalClient;
        if (originalAxios) require.cache[axiosPath] = originalAxios;
        else delete require.cache[axiosPath];
        if (originalUserFile) fs.writeFileSync(userFile, originalUserFile);
        else if (fs.existsSync(userFile)) fs.unlinkSync(userFile);
        if (originalGroupFile) fs.writeFileSync(groupFile, originalGroupFile);
        else if (fs.existsSync(groupFile)) fs.unlinkSync(groupFile);
        restoreEnv();
      }
    }
  }
];

if (require.main === module) {
  runTestSuite('OpenViking Semantic Recall Tests', tests).then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { tests };
