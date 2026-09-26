#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');

const sourceSha = process.env.RELEASE_SOURCE_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const version = require('../package.json').version;
const marker = `<!-- release-source: ${sourceSha} -->`;
const changelogPath = 'CHANGELOG.md';
const oldContent = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '# Changelog\n\n';

if (oldContent.includes(marker)) {
  console.log(`Changelog já contém ${sourceSha}`);
  process.exit(0);
}

let previous = '';
try {
  previous = execFileSync('git', ['log', '--format=%H', '--grep=^docs(changelog):', '-1', `${sourceSha}^`], { encoding: 'utf8' }).trim();
} catch (_) {
  previous = '';
}

const range = previous ? `${previous}..${sourceSha}` : sourceSha;
const raw = execFileSync('git', ['log', '--reverse', '--format=%s%x1f%an%x1e', range], { encoding: 'utf8' });
const automated = /^(docs\(changelog\):|chore: bump version to )/i;
const records = raw.split('\x1e').map(entry => entry.trim()).filter(Boolean).map(entry => {
  const [subject, author = ''] = entry.split('\x1f');
  return { subject: subject.trim(), author: author.trim() };
}).filter(({ subject }) => !automated.test(subject));

if (records.length === 0) {
  console.log('Nenhuma mudança nova para o changelog');
  process.exit(0);
}

const labels = {
  feat: 'Novidades', fix: 'Correções', perf: 'Desempenho', refactor: 'Refatorações',
  docs: 'Documentação', test: 'Testes', build: 'Build', ci: 'CI', style: 'Estilo',
  chore: 'Tarefas', outros: 'Outros',
};
const order = Object.keys(labels);
const buckets = Object.fromEntries(order.map(key => [key, []]));
for (const record of records) {
  const match = /^(feat|fix|perf|refactor|docs|test|build|ci|style|chore)(?:\([^)]*\))?!?:\s*(.+)$/i.exec(record.subject);
  const type = match ? match[1].toLowerCase() : 'outros';
  const text = match ? match[2] : record.subject;
  buckets[type].push(text);
}

const date = new Date().toISOString().slice(0, 10);
let section = `## [${version}] - ${date}\n${marker}\n`;
for (const key of order) {
  if (!buckets[key].length) continue;
  section += `\n### ${labels[key]}\n`;
  for (const text of buckets[key]) section += `- ${text}\n`;
}
section += '\n';

const body = oldContent.replace(/^# Changelog\s*/, '');
fs.writeFileSync(changelogPath, `# Changelog\n\n${section}${body}`, 'utf8');
console.log(`Changelog ${version} gerado para ${sourceSha}`);
