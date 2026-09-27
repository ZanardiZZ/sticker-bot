const path = require('path');
const Module = require('module');
const { assert, assertEqual, runTestSuite } = require('../helpers/testUtils');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CONNECTION_PATH = require.resolve('../../src/database/connection');
const REACTIONS_PATH = require.resolve('../../src/database/models/reactions');

async function withMockedDb(db, fn) {
  const originalConnection = require.cache[CONNECTION_PATH];
  const originalReactions = require.cache[REACTIONS_PATH];
  const connectionModule = new Module(CONNECTION_PATH);
  connectionModule.filename = CONNECTION_PATH;
  connectionModule.loaded = true;
  connectionModule.exports = { db };
  require.cache[CONNECTION_PATH] = connectionModule;
  delete require.cache[REACTIONS_PATH];
  try {
    await fn(require(REACTIONS_PATH));
  } finally {
    delete require.cache[REACTIONS_PATH];
    if (originalReactions) require.cache[REACTIONS_PATH] = originalReactions;
    if (originalConnection) require.cache[CONNECTION_PATH] = originalConnection;
    else delete require.cache[CONNECTION_PATH];
  }
}

const tests = [
  {
    name: 'quoted media context returns only safe same-chat metadata',
    fn: async () => {
      let query = '';
      let params = null;
      await withMockedDb({
        get(sql, values, callback) {
          query = sql;
          params = values;
          callback(null, {
            media_id: 42,
            mimetype: 'image/webp',
            description: 'Gato assustado',
            extracted_text: 'OI',
            visual_action: 'olha',
            emotion: 'pânico',
            ocr_text: 'OI',
            cultural_reference: 'meme',
            usage_intent: 'reação',
            context_signals: 'escritório'
          });
        }
      }, async ({ getQuotedMediaContext }) => {
        const result = await getQuotedMediaContext('quoted-1', 'group@g.us');
        assert(query.includes('l.chat_id = ?'), 'query must constrain chat');
        assert(query.includes('m.nsfw = 0'), 'query must exclude NSFW media');
        assertEqual(params[0], 'quoted-1');
        assertEqual(params[1], 'group@g.us');
        assertEqual(result.mediaId, 42);
        assertEqual(result.emotion, 'pânico');
        assertEqual(result.ocrText, 'OI');
      });
    }
  },
  {
    name: 'quoted media context fails closed on database errors and missing identifiers',
    fn: async () => {
      await withMockedDb({ get(_sql, _values, callback) { callback(new Error('db failure')); } }, async ({ getQuotedMediaContext }) => {
        assertEqual(await getQuotedMediaContext('quoted-1', 'group@g.us'), null);
        assertEqual(await getQuotedMediaContext('', 'group@g.us'), null);
        assertEqual(await getQuotedMediaContext('quoted-1', ''), null);
      });
    }
  }
  ,{
    name: 'quoted media context returns null when there is no message media link',
    fn: async () => {
      await withMockedDb({
        get(_sql, _values, callback) { callback(null, undefined); }
      }, async ({ getQuotedMediaContext }) => {
        assertEqual(await getQuotedMediaContext('missing-media-message', 'group@g.us'), null);
      });
    }
  },
  {
    name: 'quoted media context keeps the chat boundary for a different chat',
    fn: async () => {
      let params;
      await withMockedDb({
        get(_sql, values, callback) {
          params = values;
          callback(null, undefined);
        }
      }, async ({ getQuotedMediaContext }) => {
        assertEqual(await getQuotedMediaContext('same-message-id', 'other-group@g.us'), null);
        assertEqual(params[0], 'same-message-id');
        assertEqual(params[1], 'other-group@g.us');
      });
    }
  }

];

if (require.main === module) {
  runTestSuite('Quoted Media Context Tests', tests).then(result => process.exit(result.failed ? 1 : 0));
}

module.exports = { tests };
