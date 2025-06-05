const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { default: makeWASocket, useSingleFileAuthState } = require('@whiskeysockets/baileys');
require('dotenv').config();

const STICKER_FOLDER = '/mnt/nas/Media/Figurinhas';
const DB_PATH = './db.sqlite';

const { state, saveState } = useSingleFileAuthState('./auth_info.json');
const db = new sqlite3.Database(DB_PATH);

function initDB() {
  db.run(`CREATE TABLE IF NOT EXISTS stickers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT UNIQUE,
    description TEXT,
    enviado INTEGER DEFAULT 0
  )`);
}

function loadNextSticker(callback) {
  db.get(`SELECT * FROM stickers WHERE enviado = 0 ORDER BY RANDOM() LIMIT 1`, (err, row) => {
    if (err) return callback(err);
    if (row) return callback(null, row);

    // Se não houver stickers não enviados, reinicia todos
    db.run(`UPDATE stickers SET enviado = 0`, (err) => {
      if (err) return callback(err);
      loadNextSticker(callback);
    });
  });
}

async function sendSticker(sock, groupId, sticker) {
  const stickerPath = path.join(STICKER_FOLDER, sticker.filename);
  if (!fs.existsSync(stickerPath)) {
    console.error("❌ Arquivo não encontrado:", stickerPath);
    return;
  }

  const buffer = fs.readFileSync(stickerPath);
  await sock.sendMessage(groupId, {
    sticker: buffer,
    caption: sticker.description || ''
  });

  db.run(`UPDATE stickers SET enviado = 1 WHERE filename = ?`, [sticker.filename]);
  console.log(`✅ Figurinha enviada: ${sticker.filename}`);
}

async function main() {
  initDB();

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true
  });

  sock.ev.on('creds.update', saveState);
  sock.ev.on('connection.update', ({ connection }) => {
    if (connection === 'open') {
      loadNextSticker((err, sticker) => {
        if (err || !sticker) {
          console.error("Erro ao carregar figurinha:", err);
        } else {
          sendSticker(sock, process.env.GROUP_ID, sticker);
        }
      });
    }
  });
}

main();
