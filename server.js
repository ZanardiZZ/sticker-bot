const express = require('express');
const path = require('path');
const fs = require('fs');
const mime = require('mime-types');
const Database = require('better-sqlite3');

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STICKER_DIR = path.join(__dirname, 'stickers');




// Caminhos atualizados
//const STICKER_DIR = path.join(__dirname, 'stickers'); // local: /opt/sticker-bot/stickers
const DB_PATH = path.join(__dirname, 'data', 'figurinhas.sqlite3');

const app = express();
const port = 3000;

// Middleware para servir os arquivos estáticos da pasta local de figurinhas
app.use('/stickers', express.static(STICKER_DIR));

// Página principal com listagem de figurinhas
app.get('/', (req, res) => {
  const db = new Database(DB_PATH);
  const figurinhas = db.prepare(`SELECT * FROM figurinhas ORDER BY id DESC`).all();

  const html = `
    <html>
      <head>
        <title>Catálogo de Figurinhas</title>
        <style>
          body { font-family: sans-serif; padding: 20px; background: #f8f8f8; }
          .fig { display: inline-block; text-align: center; width: 160px; margin: 10px; padding: 10px; background: #fff; border: 1px solid #ddd; border-radius: 8px; }
          img { width: 120px; height: auto; border: 1px solid #ccc; border-radius: 4px; }
        </style>
      </head>
      <body>
        <h1>📦 Catálogo de Figurinhas</h1>
        ${figurinhas.map(f => `
          <div class="fig">
          <img src="/stickers/${f.file.endsWith('.webp') ? f.file : f.file + '.webp'}" alt="${f.descricao}" />
          <div style="margin-top: 6px; font-size: 14px;">${f.descricao}</div>
            ${f.nsfw ? '<div style="color:red; font-size:12px;">NSFW 🚫</div>' : ''}
          </div>
        `).join('')}
      </body>
    </html>
  `;

  res.send(html);
});

app.listen(port, () => {
  console.log(`🌐 Servidor rodando em http://localhost:${port}`);
});
