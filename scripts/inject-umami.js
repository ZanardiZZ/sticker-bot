#!/usr/bin/env node
/**
 * Uso:
 *   node scripts/inject-umami.js <dir_public> <umami_origin> <website_id>
 * Exemplo:
 *   node scripts/inject-umami.js web/public https://analytics.zanardizz.uk 1ae7469e-7785-4f09-9956-8afdd8efa316
 */
const fs = require('fs');
const path = require('path');

function injectOrReplace(filePath, origin, websiteId) {
  const html = fs.readFileSync(filePath, 'utf8');
  const cleanOrigin = origin.replace(/\/+$/, '');
  const snippet = `\n  <script async defer src="${cleanOrigin}/script.js" data-website-id="${websiteId}"></script>\n`;

  // Remove snippets antigos do Umami (qualquer <script ... script.js ... data-website-id="..."></script>)
  const reOld = /<script[^>]*src=["'][^"']*script\.js["'][^>]*data-website-id=["'][^"']+["'][^>]*><\/script>\s*/gi;
  let updated = html.replace(reOld, '');

  // Injeta antes de </head>
  const idx = updated.lastIndexOf('</head>');
  if (idx === -1) {
    console.warn('[warn]', filePath, 'não tem </head>, pulando');
    return;
  }
  updated = updated.slice(0, idx) + snippet + updated.slice(idx);

  if (updated !== html) {
    fs.writeFileSync(filePath, updated, 'utf8');
    console.log('[ok]  Injetado/Atualizado:', filePath);
  } else {
    console.log('[skip]', filePath, '(sem mudanças)');
  }
}

function walk(dir, cb) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, cb);
    else if (entry.isFile() && entry.name.endsWith('.html')) cb(full);
  }
}

(async function main() {
  const [,, dirPublic, origin, websiteId] = process.argv;
  if (!dirPublic || !origin || !websiteId) {
    console.error('Uso: node scripts/inject-umami.js <dir_public> <umami_origin> <website_id>');
    process.exit(1);
  }
  const abs = path.resolve(process.cwd(), dirPublic);
  if (!fs.existsSync(abs)) {
    console.error('Diretório não encontrado:', abs);
    process.exit(1);
  }
  walk(abs, (file) => injectOrReplace(file, origin, websiteId));
})();