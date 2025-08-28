#!/usr/bin/env node
/**
 * Teste simples para verificar se a migração funciona corretamente.
 * Cria alguns dados de teste e executa a migração.
 */

const path = require('path');
const fs = require('fs');

// Remove banco de teste se existir
const testDbPath = path.resolve(__dirname, '../test_media.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

// Sobrescreve o caminho do banco para teste
process.env.DB_PATH = testDbPath;

const sqlite3 = require('sqlite3').verbose();
const { migrateHistoricalContacts } = require('../database');

// Configura banco de teste
const testDb = new sqlite3.Database(testDbPath);

async function runTest() {
  try {
    console.log('=== Teste da Migração de Contatos Históricos ===');
    
    // Cria tabelas de teste
    await new Promise((resolve, reject) => {
      testDb.serialize(() => {
        // Cria tabela media de teste
        testDb.run(`
          CREATE TABLE media (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL,
            group_id TEXT,
            sender_id TEXT,
            file_path TEXT NOT NULL,
            mimetype TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            description TEXT,
            hash_visual TEXT,
            hash_md5 TEXT,
            nsfw INTEGER DEFAULT 0,
            count_random INTEGER DEFAULT 0
          )
        `);
        
        // Cria tabela contacts de teste  
        testDb.run(`
          CREATE TABLE contacts (
            sender_id TEXT PRIMARY KEY,
            display_name TEXT,
            updated_at INTEGER DEFAULT (strftime('%s','now'))
          )
        `);
        
        // Insere dados de teste
        testDb.run(`
          INSERT INTO media (chat_id, sender_id, file_path, mimetype, timestamp) VALUES
          ('test1', '5511999999999@c.us', 'test1.webp', 'image/webp', 1640995200),
          ('test2', '5511888888888@c.us', 'test2.webp', 'image/webp', 1640995300),
          ('test3', '5511777777777@c.us', 'test3.webp', 'image/webp', 1640995400),
          ('test4', NULL, 'test4.webp', 'image/webp', 1640995500),
          ('test5', '', 'test5.webp', 'image/webp', 1640995600)
        `);
        
        // Insere um contato existente para testar que não é duplicado
        testDb.run(`
          INSERT INTO contacts (sender_id, display_name) VALUES
          ('5511999999999@c.us', 'Usuario Existente')
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
    
    console.log('✅ Dados de teste criados');
    
    // Verifica estado inicial
    const initialMediaCount = await new Promise((resolve, reject) => {
      testDb.get('SELECT COUNT(*) as count FROM media WHERE sender_id IS NOT NULL AND sender_id != ""', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    const initialContactsCount = await new Promise((resolve, reject) => {
      testDb.get('SELECT COUNT(*) as count FROM contacts', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    console.log(`Estado inicial - Media com sender_id: ${initialMediaCount}, Contatos: ${initialContactsCount}`);
    
    // Executa migração
    console.log('Executando migração...');
    const migratedCount = await migrateHistoricalContacts();
    
    // Verifica resultado
    const finalContactsCount = await new Promise((resolve, reject) => {
      testDb.get('SELECT COUNT(*) as count FROM contacts', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    console.log(`Resultado - Contatos migrados: ${migratedCount}, Total contatos: ${finalContactsCount}`);
    
    // Verifica se os contatos foram criados corretamente
    const contacts = await new Promise((resolve, reject) => {
      testDb.all('SELECT sender_id, display_name FROM contacts ORDER BY sender_id', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('Contatos após migração:');
    contacts.forEach(contact => {
      console.log(`  - ${contact.sender_id}: "${contact.display_name}"`);
    });
    
    // Validações dinâmicas
    // Calcula quantos sender_ids em historical_contacts não existem em contacts antes da migração
    const preExistingContacts = await new Promise((resolve, reject) => {
      testDb.all('SELECT sender_id FROM contacts', (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(r => r.sender_id));
      });
    });
    const historicalContacts = await new Promise((resolve, reject) => {
      testDb.all('SELECT DISTINCT sender_id FROM historical_contacts', (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(r => r.sender_id));
      });
    });
    const expectedMigrated = historicalContacts.filter(sid => !preExistingContacts.includes(sid)).length;
    const expectedTotal = preExistingContacts.length + expectedMigrated;
    
    if (migratedCount === expectedMigrated && finalContactsCount === expectedTotal) {
      console.log('✅ Teste PASSOU - migração funcionou corretamente!');
    } else {
      console.error(`❌ Teste FALHOU - Esperado ${expectedMigrated} migrados e ${expectedTotal} total, obtido ${migratedCount} migrados e ${finalContactsCount} total`);
    }
    
  } catch (error) {
    console.error('❌ Erro no teste:', error);
  } finally {
    testDb.close();
    // Remove arquivo de teste
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  }
}

runTest();