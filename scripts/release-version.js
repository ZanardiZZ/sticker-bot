#!/usr/bin/env node
/**
 * Release Version Script
 *
 * Updates bot version and optionally sends notification to WhatsApp group.
 *
 * Usage:
 *   node scripts/release-version.js patch "Correção de bug X"
 *   node scripts/release-version.js minor "Nova funcionalidade Y"
 *   node scripts/release-version.js major "Mudanças breaking Z"
 *   node scripts/release-version.js --set 0.7.0 "Descrição da versão"
 *   node scripts/release-version.js --current  # Mostra versão atual
 *   node scripts/release-version.js --reset-notification  # Reseta flag de notificação
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { DB_PATH } = require('../src/paths');

const packagePath = path.join(__dirname, '..', 'package.json');

const db = new sqlite3.Database(DB_PATH);

function getCurrentVersion() {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM version_info WHERE is_current = 1 ORDER BY created_at DESC LIMIT 1',
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

function setVersion(major, minor, patch, description, incrementType) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('UPDATE version_info SET is_current = 0 WHERE is_current = 1', (err) => {
        if (err) return reject(err);

        const hiddenData = JSON.stringify({
          increment_type: incrementType,
          created_at: new Date().toISOString(),
          description: description
        });

        db.run(
          `INSERT INTO version_info (major, minor, patch, created_by, description, hidden_data, is_current)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [major, minor, patch, 'release-script', description, hiddenData, 1],
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });
    });
  });
}

function updatePackageJson(major, minor, patch) {
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageJson.version = `${major}.${minor}.${patch}`;
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
  return packageJson.version;
}

function resetNotificationFlag() {
  return new Promise((resolve, reject) => {
    db.run(
      `DELETE FROM bot_config WHERE key = 'last_notified_version'`,
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function initConfigTable() {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS bot_config (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER DEFAULT (strftime('%s','now'))
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Uso:
  node scripts/release-version.js <tipo> "<descrição>"

Tipos:
  patch   - Incrementa patch (0.6.0 -> 0.6.1) - Correções de bugs
  minor   - Incrementa minor (0.6.0 -> 0.7.0) - Novas funcionalidades
  major   - Incrementa major (0.6.0 -> 1.0.0) - Mudanças breaking

Opções:
  --set <versão> "<descrição>"  - Define versão específica
  --current                      - Mostra versão atual
  --reset-notification           - Reseta flag para reenviar notificação

Exemplos:
  node scripts/release-version.js patch "Fix: correção no envio de stickers"
  node scripts/release-version.js minor "Feat: sistema de reações"
  node scripts/release-version.js --set 0.7.0 "Nova versão com reações"
`);
    process.exit(0);
  }

  try {
    await initConfigTable();

    if (args.includes('--current')) {
      const current = await getCurrentVersion();
      if (current) {
        console.log(`Versão atual: ${current.major}.${current.minor}.${current.patch}`);
        console.log(`Descrição: ${current.description || 'N/A'}`);
      } else {
        console.log('Nenhuma versão encontrada no banco');
      }
      db.close();
      return;
    }

    if (args.includes('--reset-notification')) {
      await resetNotificationFlag();
      console.log('✅ Flag de notificação resetada. Próximo restart enviará notificação.');
      db.close();
      return;
    }

    const setIndex = args.indexOf('--set');
    if (setIndex !== -1) {
      const versionStr = args[setIndex + 1];
      const description = args[setIndex + 2] || 'Versão manual';

      if (!versionStr) {
        console.error('Erro: versão não especificada');
        process.exit(1);
      }

      const parts = versionStr.split('.').map(n => parseInt(n, 10));
      const [major, minor, patch = 0] = parts;

      if (isNaN(major) || isNaN(minor)) {
        console.error('Erro: formato de versão inválido. Use: X.Y ou X.Y.Z');
        process.exit(1);
      }

      await setVersion(major, minor, patch, description, 'manual');
      const newVersion = updatePackageJson(major, minor, patch);
      await resetNotificationFlag();

      console.log(`✅ Versão definida para ${newVersion}`);
      console.log(`📝 Descrição: ${description}`);
      console.log('🔔 Reinicie o bot para enviar notificação ao grupo');
      db.close();
      return;
    }

    // Increment version
    const type = args[0];
    const description = args[1] || `${type} version bump`;

    if (!['patch', 'minor', 'major'].includes(type)) {
      console.error(`Erro: tipo inválido "${type}". Use: patch, minor ou major`);
      process.exit(1);
    }

    const current = await getCurrentVersion();
    let newMajor, newMinor, newPatch;

    if (!current) {
      newMajor = 0;
      newMinor = 6;
      newPatch = 0;
    } else {
      newMajor = current.major;
      newMinor = current.minor;
      newPatch = current.patch;

      switch (type) {
        case 'patch':
          newPatch += 1;
          break;
        case 'minor':
          newMinor += 1;
          newPatch = 0;
          break;
        case 'major':
          newMajor += 1;
          newMinor = 0;
          newPatch = 0;
          break;
      }
    }

    await setVersion(newMajor, newMinor, newPatch, description, type);
    const newVersion = updatePackageJson(newMajor, newMinor, newPatch);
    await resetNotificationFlag();

    console.log(`\n✅ Versão atualizada: ${current ? `${current.major}.${current.minor}.${current.patch}` : 'N/A'} → ${newVersion}`);
    console.log(`📝 Descrição: ${description}`);
    console.log(`\n🔔 Reinicie o bot com "sudo -u dev pm2 restart Bot-Client" para enviar notificação`);

    db.close();
  } catch (error) {
    console.error('Erro:', error.message);
    db.close();
    process.exit(1);
  }
}

main();
