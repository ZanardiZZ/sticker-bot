#!/usr/bin/env node
/**
 * Script para migrar contatos históricos da tabela media para contacts.
 * 
 * Este script processa todas as entradas históricas da tabela media que possuem sender_id
 * mas não possuem entrada correspondente na tabela contacts, criando essas entradas
 * para que os envios históricos sejam contabilizados no ranking de usuários.
 * 
 * Uso: node scripts/migrate-historical-contacts.js
 */

const path = require('path');

// Carrega variáveis de ambiente se houver arquivo .env
try {
  require('dotenv').config();
} catch (e) {
  // Ignora se dotenv não estiver disponível
}

// Importa a função de migração
const { migrateHistoricalContacts, getHistoricalContactsStats, db } = require('../database.js');

async function runMigration() {
  try {
    console.log('=== Migração de Contatos Históricos ===');
    console.log('Este script criará entradas na tabela contacts para todos os sender_ids');
    console.log('históricos que não possuem entrada correspondente.');
    console.log('');
    
    // Mostra estatísticas antes da migração
    console.log('Verificando estado atual das tabelas...');
    
    const stats = await getHistoricalContactsStats();
    
    console.log(`Media com sender_id: ${stats.totalMediaWithSender}`);
    console.log(`Senders únicos em media: ${stats.uniqueSendersInMedia}`);
    console.log(`Contatos existentes: ${stats.existingContacts}`);
    console.log(`Contatos que precisam migração: ${stats.sendersNeedingMigration}`);
    console.log('');
    
    if (stats.sendersNeedingMigration === 0) {
      console.log('ℹ️  Nenhuma migração necessária - todos os contatos já estão atualizados.');
      return;
    }
    
    // Executa migração
    console.log('Iniciando migração...');
    const migratedCount = await migrateHistoricalContacts();
    
    // Mostra estatísticas após a migração
    const statsAfter = await getHistoricalContactsStats();
    
    console.log('');
    console.log('=== Resultado da Migração ===');
    console.log(`Contatos migrados: ${migratedCount}`);
    console.log(`Total de contatos após migração: ${statsAfter.existingContacts}`);
    console.log('');
    
    if (migratedCount > 0) {
      console.log('✅ Migração concluída com sucesso!');
      console.log('Os envios históricos agora serão contabilizados no ranking de usuários.');
      console.log('Os display_names serão preenchidos automaticamente quando os usuários');
      console.log('enviarem novas mensagens.');
    } else {
      console.log('ℹ️  Nenhuma migração necessária - todos os contatos já estão atualizados.');
    }
    
  } catch (error) {
    console.error('❌ Erro durante a migração:', error);
    process.exit(1);
  } finally {
    // Fecha conexão com banco
    db.close((err) => {
      if (err) {
        console.error('Erro ao fechar banco:', err);
        process.exit(1);
      }
      console.log('Conexão com banco fechada.');
      process.exit(0);
    });
  }
}

// Executa migração se script foi chamado diretamente
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };