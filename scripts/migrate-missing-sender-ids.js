#!/usr/bin/env node
/**
 * Script para migrar mídias que não possuem sender_id mas possuem chat_id ou group_id.
 * Endereça o problema dos 642 mídias sem sender_id mencionado no issue.
 * 
 * Este script:
 * 1. Encontra mídias sem sender_id mas com chat_id ou group_id
 * 2. Cria entradas na tabela contacts usando estes IDs
 * 3. Para grupos, gera nomes apropriados
 * 4. Exclui envios do bot das contagens
 * 
 * Uso: node scripts/migrate-missing-sender-ids.js
 */

const path = require('path');

// Carrega variáveis de ambiente se houver arquivo .env
try {
  require('dotenv').config();
} catch (e) {
  // Ignora se dotenv não estiver disponível
}

const { migrateMediaWithMissingSenderId, getHistoricalContactsStats, db } = require('../src/database/index.js');

async function runMigration() {
  try {
    console.log('=== Migração de Mídias com Sender_ID Faltante ===');
    console.log('Este script processa mídias que não têm sender_id mas têm chat_id ou group_id.');
    console.log('Para resolver o problema dos 642 mídias relatado.');
    console.log('');
    
    // Verifica estado atual
    console.log('Verificando estado atual do banco...');
    
    // Query customizada para verificar mídias sem sender_id
    const missingStats = await new Promise((resolve, reject) => {
      const queries = [
        {
          name: 'total_media',
          sql: 'SELECT COUNT(*) as count FROM media'
        },
        {
          name: 'media_with_sender',
          sql: 'SELECT COUNT(*) as count FROM media WHERE sender_id IS NOT NULL AND sender_id != ""'
        },
        {
          name: 'media_missing_sender',
          sql: 'SELECT COUNT(*) as count FROM media WHERE (sender_id IS NULL OR sender_id = "")'
        },
        {
          name: 'media_missing_but_has_chat',
          sql: `SELECT COUNT(*) as count FROM media 
                WHERE (sender_id IS NULL OR sender_id = "")
                AND chat_id IS NOT NULL AND chat_id != ""`
        },
        {
          name: 'media_missing_but_has_group', 
          sql: `SELECT COUNT(*) as count FROM media
                WHERE (sender_id IS NULL OR sender_id = "")
                AND group_id IS NOT NULL AND group_id != ""`
        }
      ];
      
      const results = {};
      let completed = 0;
      
      queries.forEach(query => {
        db.get(query.sql, (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          results[query.name] = row.count;
          completed++;
          if (completed === queries.length) {
            resolve(results);
          }
        });
      });
    });
    
    console.log(`Total de mídias: ${missingStats.total_media}`);
    console.log(`Mídias com sender_id: ${missingStats.media_with_sender}`);
    console.log(`Mídias sem sender_id: ${missingStats.media_missing_sender}`);
    console.log(`  - Com chat_id disponível: ${missingStats.media_missing_but_has_chat}`);
    console.log(`  - Com group_id disponível: ${missingStats.media_missing_but_has_group}`);
    console.log('');
    
    const totalRecoverable = missingStats.media_missing_but_has_chat + missingStats.media_missing_but_has_group;
    
    if (totalRecoverable === 0) {
      console.log('ℹ️  Nenhuma mídia recuperável encontrada.');
      console.log('   Todas as mídias sem sender_id também não têm chat_id/group_id.');
      return;
    }
    
    console.log(`🎯 ${totalRecoverable} mídias podem ser recuperadas para o ranking!`);
    console.log('');
    
    // Executa migração
    console.log('Iniciando migração de IDs faltantes...');
    const migratedCount = await migrateMediaWithMissingSenderId();
    
    console.log('');
    console.log('=== Resultado da Migração ===');
    console.log(`Novos contatos/grupos criados: ${migratedCount}`);
    
    if (migratedCount > 0) {
      console.log('✅ Migração concluída com sucesso!');
      console.log('As mídias anteriormente sem sender_id agora serão incluídas no ranking.');
      console.log('');
      console.log('Próximos passos:');
      console.log('1. Nomes de usuários serão preenchidos quando eles enviarem novas mensagens');
      console.log('2. Nomes de grupos são gerados automaticamente');
      console.log('3. Execute os comandos de ranking para ver os resultados');
    } else {
      console.log('ℹ️  Nenhuma migração necessária - IDs já estão processados.');
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
      console.log('');
      console.log('Migração finalizada.');
      process.exit(0);
    });
  }
}

// Executa migração se script foi chamado diretamente
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
