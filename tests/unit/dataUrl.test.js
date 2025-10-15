#!/usr/bin/env node
/**
 * Unit tests for data URL parsing helper
 */

const { assert, assertEqual, runTestSuite } = require('../helpers/testUtils');
const { parseBase64DataUrl } = require('../../utils/dataUrl');

const tests = [
  {
    name: 'parses base64 data URL with simple mimetype',
    fn: async () => {
      const payload = Buffer.from('hello').toString('base64');
      const dataUrl = `data:image/png;base64,${payload}`;
      const result = parseBase64DataUrl(dataUrl);

      assertEqual(result.mimetype, 'image/png');
      assert(Buffer.isBuffer(result.buffer), 'buffer should be a Buffer');
      assertEqual(result.buffer.toString('utf8'), 'hello');
    }
  },
  {
    name: 'parses base64 data URL that includes parameters in mimetype',
    fn: async () => {
      const payload = Buffer.from('voice').toString('base64');
      const dataUrl = `data:audio/ogg; codecs=opus;base64,${payload}`;
      const result = parseBase64DataUrl(dataUrl);

      assertEqual(result.mimetype, 'audio/ogg; codecs=opus');
      assertEqual(result.buffer.toString('utf8'), 'voice');
    }
  },
  {
    name: 'trims and normalizes whitespace around base64 payload',
    fn: async () => {
      const payload = Buffer.from('spaced').toString('base64');
      const dataUrl = `  data:text/plain;base64,${payload.slice(0, 5)}\n${payload.slice(5)}  `;
      const result = parseBase64DataUrl(dataUrl);

      assertEqual(result.mimetype, 'text/plain');
      assertEqual(result.buffer.toString('utf8'), 'spaced');
    }
  },
  {
    name: 'throws for invalid data URL',
    fn: async () => {
      let didThrow = false;
      try {
        parseBase64DataUrl('invalid://url');
      } catch (err) {
        didThrow = true;
        assertEqual(err.message, 'invalid_data_url');
      }

      assert(didThrow, 'expected invalid data URL to throw');
    }
  }
];

if (require.main === module) {
  runTestSuite('Data URL Utils Tests', tests);
}

module.exports = { tests };
