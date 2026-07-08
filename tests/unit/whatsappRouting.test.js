#!/usr/bin/env node
/**
 * Unit tests for whatsappRouting helpers
 */

const { assert, assertEqual } = require('../helpers/testUtils');
const {
  parseJidCsv,
  getAllowedGroupJids,
  getAllowedDmJids,
  isJidAllowed,
} = require('../../src/utils/whatsappRouting');

const tests = [
  {
    name: 'parseJidCsv trims values and removes duplicates',
    fn: async () => {
      const result = parseJidCsv(' 120363276605190820@g.us , 120363420825912004@g.us,120363276605190820@g.us ');
      assert(result instanceof Set, 'Should return a Set');
      assertEqual(result.size, 2, 'Should deduplicate JIDs');
      assert(result.has('120363276605190820@g.us'), 'Should contain GT group');
      assert(result.has('120363420825912004@g.us'), 'Should contain Test group');
    },
  },
  {
    name: 'getAllowedGroupJids always includes AUTO_SEND_GROUP_ID',
    fn: async () => {
      const previousAuto = process.env.AUTO_SEND_GROUP_ID;
      const previousAllowed = process.env.GROUP_CHAT_ALLOWED_IDS;

      process.env.AUTO_SEND_GROUP_ID = '120363276605190820@g.us';
      process.env.GROUP_CHAT_ALLOWED_IDS = '120363420825912004@g.us';

      const result = getAllowedGroupJids();
      assertEqual(result.size, 2, 'Should contain two allowed groups');
      assert(result.has('120363276605190820@g.us'), 'Should include auto-send group');
      assert(result.has('120363420825912004@g.us'), 'Should include explicit test group');

      if (previousAuto === undefined) delete process.env.AUTO_SEND_GROUP_ID; else process.env.AUTO_SEND_GROUP_ID = previousAuto;
      if (previousAllowed === undefined) delete process.env.GROUP_CHAT_ALLOWED_IDS; else process.env.GROUP_CHAT_ALLOWED_IDS = previousAllowed;
    },
  },
  {
    name: 'getAllowedDmJids returns empty set when no DM allowlist exists',
    fn: async () => {
      const previousAllowedDm = process.env.STICKER_BOT_ALLOWED_DM_IDS;
      delete process.env.STICKER_BOT_ALLOWED_DM_IDS;

      const result = getAllowedDmJids();
      assert(result instanceof Set, 'Should return a Set');
      assertEqual(result.size, 0, 'Should be empty by default');

      if (previousAllowedDm === undefined) delete process.env.STICKER_BOT_ALLOWED_DM_IDS;
      else process.env.STICKER_BOT_ALLOWED_DM_IDS = previousAllowedDm;
    },
  },
  {
    name: 'isJidAllowed matches normalized JIDs',
    fn: async () => {
      const allowed = new Set(['120363276605190820@g.us']);
      assert(isJidAllowed('120363276605190820@G.US', allowed), 'Should match normalized JID');
      assert(!isJidAllowed('120363420825912004@g.us', allowed), 'Should reject non-allowed JID');
    },
  },
];

async function main() {
  const { runTestSuite } = require('../helpers/testUtils');
  try {
    await runTestSuite('WhatsApp Routing Tests', tests);
  } catch (error) {
    console.error('Test suite failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { tests };
