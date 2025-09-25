// scripts/check-db-schema.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../media.db');
const requiredTables = [
  'bot_config',
  'media',
  'contacts',
  'group_users',
  // Adicione outras tabelas essenciais aqui se necessário
];

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao abrir o banco:', err.message);
    process.exit(1);
  }
});

db.all(`SELECT name FROM sqlite_master WHERE type='table'`, (err, rows) => {
  if (err) {
    console.error('Erro ao consultar tabelas:', err.message);
    process.exit(1);
  }
  const tables = rows.map(r => r.name);
  console.log('Tabelas encontradas:', tables);
  let ok = true;
  for (const t of requiredTables) {
    if (!tables.includes(t)) {
      console.error(`❌ Tabela ausente: ${t}`);
      ok = false;
    } else {
      console.log(`✅ Tabela presente: ${t}`);
    }
  }
  if (ok) {
    console.log('\nBanco de dados media.db está OK!');
  } else {
    console.log('\nBanco de dados media.db está INCOMPLETO!');
  }
  db.close();
});
