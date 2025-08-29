#!/usr/bin/env node
/**
 * Socket Server for WhatsApp Bot
 * 
 * This server runs the WhatsApp client with socket.io middleware,
 * allowing the bot business logic to connect remotely and maintain
 * the WhatsApp connection even when the bot process is restarted.
 */

require('dotenv').config();

const { create, ev } = require('@open-wa/wa-automate');

// Configuration
const SOCKET_PORT = process.env.SOCKET_PORT || 3001;
const SOCKET_HOST = process.env.SOCKET_HOST || 'localhost';

/**
 * Start the WhatsApp client with socket.io middleware
 */
async function startSocketServer() {
  console.log('🔌 Iniciando servidor socket para WhatsApp...');
  
  try {
    // Create client with socket configuration
    const client = await create({
      sessionId: 'StickerBotSession',
      headless: true,
      qrTimeout: 0,
      authTimeout: 0,
      autoRefresh: true,
      socket: true,
      port: SOCKET_PORT,
      host: SOCKET_HOST,
      popup: false,
      restartOnCrash: () => {
        console.log('🔄 Cliente reiniciado devido a crash...');
      }
    });

    console.log(`✅ Servidor socket iniciado em ${SOCKET_HOST}:${SOCKET_PORT}`);
    console.log('🔗 WhatsApp cliente pronto para conexões socket');
    console.log('💡 Use "npm run bot" para conectar o bot via socket');
    
    // Listen for client events to provide status updates
    ev.on('qr.**', (qrcode, sessionId) => {
      console.log('📱 QR Code gerado - escaneie com WhatsApp');
    });
    
    ev.on('STARTUP.**', (data, sessionId) => {
      console.log('🚀 WhatsApp conectado e pronto');
    });
    
    ev.on('STATE.**', (state, sessionId) => {
      console.log(`📡 Estado da conexão: ${state}`);
    });

  } catch (error) {
    console.error('❌ Erro ao iniciar servidor socket:', error);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Parando servidor socket...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Servidor socket finalizado');
  process.exit(0);
});

// Start the server
startSocketServer();