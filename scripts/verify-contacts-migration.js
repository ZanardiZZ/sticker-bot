#!/usr/bin/env node
/**
 * Script para verificar se a migração de contatos está funcionando corretamente.
 * Mostra estatísticas dos rankings de usuários e detecta problemas.
 * 
 * Uso: node scripts/verify-contacts-migration.js
 */

const path = require('path');

// Carrega variáveis de ambiente se houver arquivo .env
try {
  require('dotenv').config();
} catch (e) {
  // Ignora se dotenv não estiver disponível
}

const { getTop5UsersByStickerCount, getHistoricalContactsStats, db } = require('../src/database/index.js');

async function verifyMigration() {
  try {
    console.log('=== Verificação da Migração de Contatos ===');
    console.log('');
    
    // Estatísticas gerais
    console.log('📊 Estatísticas do banco de dados:');
    const stats = await getHistoricalContactsStats();
    
    console.log(`  • Total de mídias com sender_id: ${stats.totalMediaWithSender}`);
    console.log(`  • Senders únicos em media: ${stats.uniqueSendersInMedia}`);
    console.log(`  • Contatos existentes: ${stats.existingContacts}`);
    console.log(`  • Contatos precisando migração: ${stats.sendersNeedingMigration}`);
    console.log('');
    
    // Status da migração
    if (stats.sendersNeedingMigration > 0) {
      console.log('⚠️  MIGRAÇÃO NECESSÁRIA');
      console.log(`   ${stats.sendersNeedingMigration} contatos históricos não estão sendo contabilizados no ranking.`);
      console.log('   Execute: node scripts/migrate-historical-contacts.js');
      console.log('');
    } else {
      console.log('✅ MIGRAÇÃO COMPLETA');
      console.log('   Todos os contatos históricos estão sendo contabilizados.');
      console.log('');
    }
    
    // Ranking geral
    console.log('🏆 Top 5 usuários (geral):');
    const topUsers = await getTop5UsersByStickerCount();
    
    if (topUsers.length === 0) {
      console.log('   Nenhum usuário encontrado.');
    } else {
      topUsers.forEach((user, index) => {
        const displayName = user.display_name || 'Nome não disponível';
        const senderId = user.sender_id.replace('@c.us', '').substring(0, 15) + '...';
        console.log(`   ${index + 1}º ${displayName} (${senderId}): ${user.sticker_count} stickers`);
      });
    }
    console.log('');
    
    // Detecta problemas comuns
    console.log('🔍 Diagnóstico:');
    
    // Problema: muitos usuários sem nome
    const usersWithoutName = topUsers.filter(user => !user.display_name || user.display_name.trim() === '').length;
    if (usersWithoutName > 0) {
      console.log(`   ℹ️  ${usersWithoutName} usuários no top 5 não têm nome de exibição.`);
      console.log('      Nomes serão preenchidos quando os usuários enviarem novas mensagens.');
    }
    
    // Problema: discrepância entre contatos e senders únicos
    const expectedContacts = stats.uniqueSendersInMedia;
    const actualContacts = stats.existingContacts;
    if (actualContacts < expectedContacts) {
      console.log(`   ⚠️  Possível problema: ${expectedContacts - actualContacts} senders únicos não têm contato.`);
    } else if (actualContacts === expectedContacts) {
      console.log('   ✅ Todos os senders únicos têm entrada na tabela de contatos.');
    }
    
    // Verifica se há mídias órfãs (sem sender_id)
    const orphanedMedia = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM media WHERE sender_id IS NULL OR sender_id = ""', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    if (orphanedMedia > 0) {
      console.log(`   ℹ️  ${orphanedMedia} mídias não têm sender_id (normais para imports antigos).`);
    }
    
    console.log('');
    console.log('Verificação concluída!');
    
  } catch (error) {
    console.error('❌ Erro durante verificação:', error);
    process.exit(1);
  } finally {
    // Fecha conexão com banco
    db.close((err) => {
      if (err) {
        console.error('Erro ao fechar banco:', err);
        process.exit(1);
      }
      process.exit(0);
    });
  }
}

// Executa verificação se script foi chamado diretamente
if (require.main === module) {
  verifyMigration();
}

module.exports = { verifyMigration };
