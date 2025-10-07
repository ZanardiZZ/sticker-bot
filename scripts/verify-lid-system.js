#!/usr/bin/env node

/**
 * Script de verificação final do sistema LID
 * Verifica se todas as implementações estão funcionando corretamente
 */

require('dotenv').config();

console.log('🔍 === Verificação Final do Sistema LID ===\n');

/**
 * Verifica se todos os arquivos necessários existem
 */
function checkFiles() {
    const fs = require('fs');
    const path = require('path');
    
    console.log('📁 Verificando arquivos...');
    
    const requiredFiles = [
        'utils/jidUtils.js',
        'database/models/lidMapping.js',
        'scripts/migrate-to-lids.js',
        'tests/test-lid-functionality.js',
        'tests/test-lid-integration.js',
        'docs/LID_MIGRATION.md'
    ];
    
    let allExist = true;
    
    for (const file of requiredFiles) {
        const filePath = path.join(__dirname, '..', file);
        if (fs.existsSync(filePath)) {
            console.log(`  ✅ ${file}`);
        } else {
            console.log(`  ❌ ${file} - MISSING`);
            allExist = false;
        }
    }
    
    return allExist;
}

/**
 * Verifica se as dependências estão instaladas
 */
function checkDependencies() {
    console.log('\n📦 Verificando dependências...');
    
    try {
        require('@whiskeysockets/baileys');
        console.log('  ✅ @whiskeysockets/baileys');
    } catch (e) {
        console.log('  ❌ @whiskeysockets/baileys - Não instalado');
        return false;
    }
    
    try {
        const packageJson = require('../package.json');
        if (packageJson.dependencies['@whiskeysockets/baileys']) {
            console.log(`  ✅ Versão Baileys: ${packageJson.dependencies['@whiskeysockets/baileys']}`);
        }
    } catch (e) {
        console.log('  ⚠️  Não foi possível verificar versão do Baileys');
    }
    
    return true;
}

/**
 * Verifica se as tabelas de database existem
 */
async function checkDatabase() {
    console.log('\n🗄️  Verificando database...');
    
    try {
        const { db } = require('../database');
        
        // Verificar tabela lid_mapping
        const lidTable = await new Promise((resolve) => {
            db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='lid_mapping'", [], (err, row) => {
                resolve(!!row);
            });
        });
        
        if (lidTable) {
            console.log('  ✅ Tabela lid_mapping existe');
        } else {
            console.log('  ❌ Tabela lid_mapping não encontrada');
            return false;
        }
        
        // Verificar se colunas foram adicionadas na tabela contacts
        const contactsInfo = await new Promise((resolve) => {
            db.all("PRAGMA table_info(contacts)", [], (err, rows) => {
                resolve(rows || []);
            });
        });
        
        const hasLid = contactsInfo.some(col => col.name === 'lid');
        const hasPreferredId = contactsInfo.some(col => col.name === 'preferred_id');
        
        if (hasLid) {
            console.log('  ✅ Coluna lid na tabela contacts');
        } else {
            console.log('  ⚠️  Coluna lid não encontrada na tabela contacts');
        }
        
        if (hasPreferredId) {
            console.log('  ✅ Coluna preferred_id na tabela contacts');
        } else {
            console.log('  ⚠️  Coluna preferred_id não encontrada na tabela contacts');
        }
        
        return true;
        
    } catch (error) {
        console.log('  ❌ Erro ao verificar database:', error.message);
        return false;
    }
}

/**
 * Testa funcionalidades básicas
 */
async function testBasicFunctionality() {
    console.log('\n🧪 Testando funcionalidades básicas...');
    
    try {
        // Teste JID Utils
        const { isPnUser, isLidUser, normalizeJid } = require('../utils/jidUtils');
        
        if (isPnUser('5511999999999@s.whatsapp.net') && 
            isLidUser('123456@lid') && 
            normalizeJid('  TEST@domain  ') === 'test@domain') {
            console.log('  ✅ JID Utils funcionando');
        } else {
            console.log('  ❌ JID Utils com problemas');
            return false;
        }
        
        // Teste LID Mapping
        const { storeLidPnMapping, getPnForLid, deleteLidMapping } = require('../database');
        
        const testLid = 'verification123@lid';
        const testPn = '5511000000000@s.whatsapp.net';
        
        storeLidPnMapping(testLid, testPn);
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const result = await getPnForLid(testLid);
        
        if (result === testPn) {
            console.log('  ✅ LID Mapping funcionando');
            deleteLidMapping(testLid);
        } else {
            console.log('  ❌ LID Mapping com problemas');
            return false;
        }
        
        return true;
        
    } catch (error) {
        console.log('  ❌ Erro nos testes básicos:', error.message);
        return false;
    }
}

/**
 * Verifica configurações recomendadas
 */
function checkConfiguration() {
    console.log('\n⚙️  Verificando configurações...');
    
    const useBaileys = process.env.USE_BAILEYS === 'true';
    const baileysUrl = process.env.BAILEYS_WS_URL;
    const baileysToken = process.env.BAILEYS_CLIENT_TOKEN;
    
    if (useBaileys) {
        console.log('  ✅ USE_BAILEYS=true (recomendado para LIDs)');
        
        if (baileysUrl) {
            console.log(`  ✅ BAILEYS_WS_URL configurado: ${baileysUrl}`);
        } else {
            console.log('  ⚠️  BAILEYS_WS_URL não configurado (usará padrão)');
        }
        
        if (baileysToken) {
            console.log(`  ✅ BAILEYS_CLIENT_TOKEN configurado: ${baileysToken}`);
        } else {
            console.log('  ⚠️  BAILEYS_CLIENT_TOKEN não configurado (usará padrão)');
        }
    } else {
        console.log('  ⚠️  USE_BAILEYS=false (LIDs funcionarão parcialmente)');
    }
    
    return true;
}

/**
 * Exibe resumo de próximos passos
 */
function showNextSteps() {
    console.log('\n📋 Próximos Passos:');
    console.log('   1. Execute: npm start (ou USE_BAILEYS=true npm start)');
    console.log('   2. Monitore logs para: [LID] Novo mapeamento...');
    console.log('   3. Verifique se usuários são identificados corretamente');
    console.log('   4. Use scripts de teste quando necessário:');
    console.log('      - node tests/test-lid-functionality.js');
    console.log('      - node tests/test-lid-integration.js');
    console.log('      - node scripts/migrate-to-lids.js');
    console.log('\n📖 Documentação: docs/LID_MIGRATION.md');
}

/**
 * Função principal
 */
async function main() {
    let allChecksPass = true;
    
    // Verificar arquivos
    if (!checkFiles()) {
        allChecksPass = false;
    }
    
    // Verificar dependências
    if (!checkDependencies()) {
        allChecksPass = false;
    }
    
    // Verificar database
    if (!await checkDatabase()) {
        allChecksPass = false;
    }
    
    // Testar funcionalidades
    if (!await testBasicFunctionality()) {
        allChecksPass = false;
    }
    
    // Verificar configurações
    checkConfiguration();
    
    // Resultado final
    console.log('\n🎯 === Resultado Final ===');
    if (allChecksPass) {
        console.log('✅ Sistema LID está configurado e funcionando corretamente!');
        console.log('🚀 Pronto para usar em produção.');
    } else {
        console.log('❌ Alguns problemas foram encontrados.');
        console.log('⚠️  Corrija os problemas antes de usar em produção.');
    }
    
    showNextSteps();
    
    return allChecksPass;
}

// Executar verificação
if (require.main === module) {
    main().then((success) => {
        process.exit(success ? 0 : 1);
    }).catch((error) => {
        console.error('Erro durante verificação:', error);
        process.exit(1);
    });
}

module.exports = { main };
