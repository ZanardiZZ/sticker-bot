/**
 * Socket Client Wrapper for WhatsApp Bot
 * 
 * This module provides a wrapper around open-wa's SocketClient
 * to connect to the socket server and provide the same interface
 * as the direct client connection.
 */

const { SocketClient } = require('@open-wa/wa-automate');

class WhatsAppSocketClient {
  constructor(host = 'localhost', port = 3001) {
    this.host = host;
    this.port = port;
    this.client = null;
    this.connected = false;
  }

  /**
   * Connect to the socket server
   * @returns {Promise<Object>} Connected WhatsApp client
   */
  async connect() {
    try {
      console.log(`🔌 Conectando ao servidor socket em ${this.host}:${this.port}...`);
      
      this.client = new SocketClient(`http://${this.host}:${this.port}`, 'StickerBotSession');
      
      // Wait for connection to be established
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout ao conectar com servidor socket'));
        }, 30000);

        this.client.onConnect(() => {
          clearTimeout(timeout);
          this.connected = true;
          console.log('✅ Conectado ao servidor socket');
          resolve();
        });

        this.client.onDisconnect(() => {
          this.connected = false;
          console.log('❌ Desconectado do servidor socket');
        });

        this.client.onError((error) => {
          clearTimeout(timeout);
          console.error('❌ Erro na conexão socket:', error);
          reject(error);
        });
      });

      return this.client;
    } catch (error) {
      console.error('❌ Falha ao conectar no servidor socket:', error);
      throw error;
    }
  }

  /**
   * Check if connected to socket server
   * @returns {boolean} Connection status
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Disconnect from socket server
   */
  disconnect() {
    if (this.client) {
      this.client.disconnect();
      this.connected = false;
      console.log('🔌 Desconectado do servidor socket');
    }
  }

  /**
   * Get the underlying client instance
   * @returns {Object} WhatsApp client instance
   */
  getClient() {
    return this.client;
  }
}

module.exports = {
  WhatsAppSocketClient
};