#!/usr/bin/env node
/**
 * Ensures command routing stays consistent with validation/help lists.
 */

const fs = require('fs');
const path = require('path');
const { assert, assertEqual } = require('../helpers/testUtils');
const { VALID_COMMANDS, HELP_ENTRIES } = require('../../src/commands/validation');

const indexSource = fs.readFileSync(path.join(__dirname, '../../src/commands/index.js'), 'utf8');

function getSwitchCommands() {
  const regex = /case\s+'(#[^']+)'/g;
  const out = new Set();
  let match;
  while ((match = regex.exec(indexSource)) !== null) {
    out.add(match[1]);
  }
  return Array.from(out).sort();
}

function getHelpTokens() {
  const out = new Set();
  for (const entry of HELP_ENTRIES) {
    const cmd = String(entry.command || '');
    const matches = cmd.match(/#[^\s/]+/g) || [];
    for (const token of matches) out.add(token);
  }
  return Array.from(out).sort();
}

const tests = [
  {
    name: 'all routed commands exist in VALID_COMMANDS',
    fn: async () => {
      const routed = getSwitchCommands();
      const missingInValid = routed.filter(cmd => !VALID_COMMANDS.includes(cmd));
      assertEqual(missingInValid.length, 0, `Missing in VALID_COMMANDS: ${missingInValid.join(', ')}`);
    }
  },
  {
    name: 'all routed commands are represented in HELP_ENTRIES',
    fn: async () => {
      const routed = getSwitchCommands();
      const helpTokens = getHelpTokens();
      const missingInHelp = routed.filter(cmd => !helpTokens.includes(cmd));
      assertEqual(missingInHelp.length, 0, `Missing in HELP_ENTRIES: ${missingInHelp.join(', ')}`);
    }
  },
  {
    name: '#comandos is accepted as valid command token',
    fn: async () => {
      assert(VALID_COMMANDS.includes('#comandos'), '#comandos should be in VALID_COMMANDS');
    }
  }
];

module.exports = { tests };

if (require.main === module) {
  const { runTestSuite } = require('../helpers/testUtils');
  runTestSuite('Command Validation Coverage Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
