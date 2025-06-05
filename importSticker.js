const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const STICKER_FOLDER = '/mnt/nas/Media/Figurinhas';
const DB_PATH = './db.sqlite';

const db = new sqlite3.Database(DB_PATH);

function generateCode(id) {
  return `#FIG${String(id).padStart(5, '0')}`;
}

function importStickers() {
  const files = fs.readdirSync(STICKER_FOLDER).filter(f => f.toLowerCase().endsWith('.webp'));
  console.log(`📁 Total de arquivos encontrados: ${files.length}`);

  let inserted = 0;
  let tried = 0;

  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS stickers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE,
      description TEXT,
      enviado INTEGER DEFAULT 0,
      codigo TEXT UNIQUE
    )`);

    files.forEach((file, index) => {
      const code = generateCode(index + 1);
      tried++;

      db.run(
        `INSERT OR IGNORE INTO stickers (filename, description, enviado, codigo)
         VALUES (?, ?, 0, ?)`,
        [file, null, code],
        function (err) {
          if (err) {
            console.error(`❌ Erro ao inserir ${file}:`, err.message);
          } else if (this.changes > 0) {
            inserted++;
          }

          if (tried === files.length) {
            console.log(`✅ Importação finalizada. ${inserted} novas figurinhas adicionadas.`);
          }
        }
      );
    });
  });
}

importStickers();
