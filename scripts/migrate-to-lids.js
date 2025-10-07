#!/usr/bin/env node

/**
 * Script de migração para sistema LID (Local Identifier) do WhatsApp
 * Este script migra dados existentes para suportar o novo sistema LID
 */

require('dotenv').config();
const { db, initializeLidMappingTable, storeLidPnMapping } = require('../database');
const { normalizeJid, isPnUser, isLidUser } = require('../utils/jidUtils');

console.log('=== Migração para Sistema LID ===');

/**
 * Migra sender_ids existentes para formato normalizado
 */
async function migrateSenderIds() {
    console.log('[MIGRATE] Iniciando migração de sender_ids para LIDs...');
    
    try {
        // Obter todos os sender_ids únicos da tabela media
        const senders = await new Promise((resolve, reject) => {
            db.all(`
                SELECT DISTINCT sender_id 
                FROM media 
                WHERE sender_id IS NOT NULL
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        console.log(`[MIGRATE] Encontrados ${senders.length} sender_ids únicos`);
        
        let migrated = 0;
        let skipped = 0;
        
        for (const sender of senders) {
            const senderId = sender.sender_id;
            
            // Pular se já é LID
            if (isLidUser(senderId)) {
                skipped++;
                continue;
            }
            
            // Normalizar PN se necessário
            if (isPnUser(senderId)) {
                const normalized = normalizeJid(senderId);
                
                if (normalized !== senderId) {
                    // Atualizar para versão normalizada
                    await new Promise((resolve) => {
                        db.run(`
                            UPDATE media 
                            SET sender_id = ? 
                            WHERE sender_id = ?
                        `, [normalized, senderId], function(err) {
                            if (err) {
                                console.error(`[MIGRATE] Erro ao atualizar ${senderId}:`, err);
                            } else {
                                migrated++;
                                console.log(`[MIGRATE] Normalizado: ${senderId} → ${normalized}`);
                            }
                            resolve();
                        });
                    });
                }
            }
        }
        
        console.log(`[MIGRATE] Migração sender_ids concluída: ${migrated} atualizados, ${skipped} ignorados`);
        
    } catch (error) {
        console.error('[MIGRATE] Erro na migração de sender_ids:', error);
    }
}

/**
 * Adiciona colunas LID na tabela contacts se não existirem
 */
async function addLidMappingColumns() {
    console.log('[MIGRATE] Verificando estrutura da tabela contacts...');
    
    try {
        // Verificar se colunas já existem
        const tableInfo = await new Promise((resolve, reject) => {
            db.all("PRAGMA table_info(contacts)", [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        const hasLidColumn = tableInfo.some(col => col.name === 'lid');
        const hasPreferredIdColumn = tableInfo.some(col => col.name === 'preferred_id');
        
        if (!hasLidColumn) {
            await new Promise((resolve) => {
                db.run('ALTER TABLE contacts ADD COLUMN lid TEXT', [], function(err) {
                    if (err && !err.message.includes('duplicate column')) {
                        console.error('[MIGRATE] Erro ao adicionar coluna lid:', err);
                    } else {
                        console.log('[MIGRATE] Coluna lid adicionada à tabela contacts');
                    }
                    resolve();
                });
            });
        }
        
        if (!hasPreferredIdColumn) {
            await new Promise((resolve) => {
                db.run('ALTER TABLE contacts ADD COLUMN preferred_id TEXT', [], function(err) {
                    if (err && !err.message.includes('duplicate column')) {
                        console.error('[MIGRATE] Erro ao adicionar coluna preferred_id:', err);
                    } else {
                        console.log('[MIGRATE] Coluna preferred_id adicionada à tabela contacts');
                    }
                    resolve();
                });
            });
        }
        
        // Adicionar índices
        await new Promise((resolve) => {
            db.run('CREATE INDEX IF NOT EXISTS idx_contacts_lid ON contacts(lid)', [], () => resolve());
        });
        await new Promise((resolve) => {
            db.run('CREATE INDEX IF NOT EXISTS idx_contacts_preferred_id ON contacts(preferred_id)', [], () => resolve());
        });
        
        console.log('[MIGRATE] Estrutura da tabela contacts atualizada');
        
    } catch (error) {
        console.error('[MIGRATE] Erro ao atualizar estrutura da tabela contacts:', error);
    }
}

/**
 * Atualiza contatos existentes com preferred_id
 */
async function updateContactsWithPreferredIds() {
    console.log('[MIGRATE] Atualizando preferred_id nos contatos...');
    
    try {
        const contacts = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM contacts WHERE preferred_id IS NULL', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        let updated = 0;
        for (const contact of contacts) {
            // Por enquanto, usar o jid existente como preferred_id
            // Em runtime, isso será atualizado quando LIDs forem descobertos
            await new Promise((resolve) => {
                db.run(`
                    UPDATE contacts 
                    SET preferred_id = ? 
                    WHERE id = ?
                `, [normalizeJid(contact.jid), contact.id], function(err) {
                    if (err) {
                        console.error('[MIGRATE] Erro ao atualizar contato:', contact.id, err);
                    } else {
                        updated++;
                    }
                    resolve();
                });
            });
        }
        
        console.log(`[MIGRATE] ${updated} contatos atualizados com preferred_id`);
        
    } catch (error) {
        console.error('[MIGRATE] Erro ao atualizar contatos:', error);
    }
}

/**
 * Migra dados existentes na tabela dm_users
 */
async function migrateDmUsers() {
    console.log('[MIGRATE] Migrando tabela dm_users...');
    
    try {
        // Verificar se tabela dm_users existe
        const tables = await new Promise((resolve, reject) => {
            db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='dm_users'", [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        if (tables.length === 0) {
            console.log('[MIGRATE] Tabela dm_users não encontrada, pulando migração');
            return;
        }
        
        const dmUsers = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM dm_users', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        let updated = 0;
        for (const dmUser of dmUsers) {
            const normalizedUserId = normalizeJid(dmUser.user_id);
            
            if (normalizedUserId !== dmUser.user_id) {
                await new Promise((resolve) => {
                    db.run(`
                        UPDATE dm_users 
                        SET user_id = ? 
                        WHERE user_id = ?
                    `, [normalizedUserId, dmUser.user_id], function(err) {
                        if (err) {
                            console.error('[MIGRATE] Erro ao atualizar dm_user:', dmUser.user_id, err);
                        } else {
                            updated++;
                            console.log(`[MIGRATE] DM user normalizado: ${dmUser.user_id} → ${normalizedUserId}`);
                        }
                        resolve();
                    });
                });
            }
        }
        
        console.log(`[MIGRATE] ${updated} dm_users atualizados`);
        
    } catch (error) {
        console.error('[MIGRATE] Erro ao migrar dm_users:', error);
    }
}

/**
 * Testa se a migração LID mapping está funcionando
 */
async function testLidMapping() {
    console.log('[MIGRATE] Testando funcionalidade LID mapping...');
    
    try {
        // Teste com dados fictícios
        const testLid = '123456789@lid';
        const testPn = '5511999999999@s.whatsapp.net';
        
        // Armazenar mapeamento
        storeLidPnMapping(testLid, testPn);
        
        // Aguardar um pouco para garantir que foi armazenado
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Verificar se foi armazenado
        const mapping = await getPnForLid(testLid);
        
        if (mapping === testPn) {
            console.log('[MIGRATE] ✅ Teste LID mapping: sucesso');
            
            // Limpar dados de teste
            deleteLidMapping(testLid);
        } else {
            console.log(`[MIGRATE] ❌ Teste LID mapping: falhou - esperado ${testPn}, obtido ${mapping}`);
        }
        
    } catch (error) {
        console.error('[MIGRATE] Erro no teste LID mapping:', error);
    }
}

/**
 * Função principal de migração
 */
async function runMigration() {
    try {
        console.log('[MIGRATE] Iniciando migração completa...');
        
        // 1. Inicializar tabela LID mapping se não existir
        await initializeLidMappingTable(db);
        
        // 2. Migrar sender_ids para formato normalizado
        await migrateSenderIds();
        
        // 3. Adicionar colunas LID na tabela contacts
        await addLidMappingColumns();
        
        // 4. Atualizar contatos com preferred_id
        await updateContactsWithPreferredIds();
        
        // 5. Migrar dm_users
        await migrateDmUsers();
        
        // 6. Testar funcionalidade LID mapping
        await testLidMapping();
        
        console.log('[MIGRATE] ✅ Migração concluída com sucesso!');
        
    } catch (error) {
        console.error('[MIGRATE] ❌ Erro durante migração:', error);
        process.exit(1);
    }
}

// Executar migração se script for chamado diretamente
if (require.main === module) {
    runMigration().then(() => {
        console.log('[MIGRATE] Script finalizado');
        process.exit(0);
    }).catch((error) => {
        console.error('[MIGRATE] Script falhou:', error);
        process.exit(1);
    });
}

module.exports = {
    runMigration,
    migrateSenderIds,
    addLidMappingColumns,
    updateContactsWithPreferredIds,
    migrateDmUsers,
    testLidMapping
};
