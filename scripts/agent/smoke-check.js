#!/usr/bin/env node

const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..', '..');
const entrypoints = [
  'index.js',
  'server.js',
  'src/web/server.js',
  'scripts/agent/context.js'
];

let failed = false;

for (const file of entrypoints) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: rootDir,
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`FAILED ${file}\n${result.stderr}\n`);
  } else {
    process.stdout.write(`OK ${file}\n`);
  }
}

const ecosystemCheck = spawnSync(process.execPath, ['-e', "require('./ecosystem.config.js'); console.log('OK ecosystem.config.js');"], {
  cwd: rootDir,
  encoding: 'utf8'
});

if (ecosystemCheck.status !== 0) {
  failed = true;
  process.stderr.write(`FAILED ecosystem.config.js\n${ecosystemCheck.stderr}\n`);
} else {
  process.stdout.write(ecosystemCheck.stdout);
}

process.exit(failed ? 1 : 0);
