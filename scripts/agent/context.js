#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');
const packageJson = require(path.join(rootDir, 'package.json'));
const ecosystem = require(path.join(rootDir, 'ecosystem.config.js'));

const args = process.argv.slice(2);
const asJson = args.includes('--json');

function safeListDir(dirName) {
  const dirPath = path.join(rootDir, dirName);
  try {
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function listTests(subdir) {
  const testDir = path.join(rootDir, 'tests', subdir);
  try {
    return fs
      .readdirSync(testDir)
      .filter((file) => file.endsWith('.test.js'))
      .sort();
  } catch {
    return [];
  }
}

function findAgentDocs() {
  const candidatePaths = [
    '.github/agents',
    '.codex',
    'docs'
  ];

  return candidatePaths.flatMap((relativePath) => {
    const absolutePath = path.join(rootDir, relativePath);
    try {
      return fs
        .readdirSync(absolutePath)
        .filter((file) => file.endsWith('.md') || file.endsWith('.MD'))
        .sort()
        .map((file) => path.join(relativePath, file));
    } catch {
      return [];
    }
  });
}

const summary = {
  project: {
    name: packageJson.name,
    version: packageJson.version,
    node: fs.existsSync(path.join(rootDir, '.nvmrc'))
      ? fs.readFileSync(path.join(rootDir, '.nvmrc'), 'utf8').trim()
      : 'unspecified'
  },
  scripts: packageJson.scripts,
  pm2Apps: (ecosystem.apps || []).map((app) => ({
    name: app.name,
    script: app.script,
    instances: app.instances,
    maxMemoryRestart: app.max_memory_restart || null
  })),
  sourceRoots: ['src/bot', 'src/commands', 'src/services', 'src/utils', 'src/web', 'src/database'],
  keyFiles: [
    'index.js',
    'server.js',
    'src/web/server.js',
    'ecosystem.config.js',
    '.github/copilot-instructions.md',
    'docs/ARCHITECTURE_GUIDELINES.md',
    'docs/TESTING.md'
  ],
  tests: {
    unit: listTests('unit'),
    integration: listTests('integration')
  },
  docs: findAgentDocs(),
  scriptsDir: safeListDir('scripts')
};

if (asJson) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(0);
}

const lines = [
  `Project: ${summary.project.name}@${summary.project.version}`,
  `Node: ${summary.project.node}`,
  '',
  'Scripts:'
];

for (const [name, command] of Object.entries(summary.scripts)) {
  lines.push(`- ${name}: ${command}`);
}

lines.push('', 'PM2 Apps:');
for (const app of summary.pm2Apps) {
  lines.push(`- ${app.name}: ${app.script} (instances=${app.instances}, max_memory_restart=${app.maxMemoryRestart || 'n/a'})`);
}

lines.push('', 'Key Files:');
for (const file of summary.keyFiles) {
  lines.push(`- ${file}`);
}

lines.push('', `Unit Tests: ${summary.tests.unit.length}`, `Integration Tests: ${summary.tests.integration.length}`);
lines.push('', 'Agent Docs:');
for (const file of summary.docs) {
  lines.push(`- ${file}`);
}

lines.push('', 'Scripts Directory:');
for (const file of summary.scriptsDir) {
  lines.push(`- scripts/${file}`);
}

process.stdout.write(`${lines.join('\n')}\n`);
