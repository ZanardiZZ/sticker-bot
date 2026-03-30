/**
 * Admin Watcher - Self-Healing System
 *
 * Monitors admin messages for problem reports and automatically diagnoses/fixes issues
 * using OpenAI GPT-4 with function calling.
 *
 * Features:
 * - Keyword detection (erro, falha, parou, bug, problema, etc)
 * - OpenAI integration with 9 diagnostic tools
 * - Auto-restart of crashed services
 * - Intelligent cooldown to prevent spam
 * - Detailed reporting back to WhatsApp
 *
 * Usage:
 *   const watcher = new AdminWatcher(waAdapterClient);
 *   await watcher.start();
 */

const OpenAI = require('openai');
const { isAdmin } = require('../utils/adminUtils');
const { safeReply } = require('../utils/safeMessaging');
const { withTyping } = require('../utils/typingIndicator');
const { getOpenAITools, handleToolCall } = require('./openaiTools');

class AdminWatcher {
  constructor(client) {
    this.client = client;

    // Problem detection keywords
    this.keywords = [
      'erro', 'error',
      'falha', 'fail',
      'parou', 'stopped', 'parado',
      'bug', 'bugado',
      'problema', 'problem',
      'não funciona', 'not working', 'nao funciona',
      'crashou', 'crashed', 'crash',
      'travou', 'travado', 'stuck', 'frozen'
    ];

    // Configuration from env vars
    this.enabled = process.env.ADMIN_WATCHER_ENABLED === 'true';
    this.model = process.env.ADMIN_WATCHER_MODEL || 'gpt-4-turbo-preview';

    // Cooldown map to prevent spam (chatId -> timestamp)
    this.cooldown = new Map();
    this.cooldownMs = 5 * 60 * 1000; // 5 minutes

    // OpenAI client
    this.openai = null;
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }

    // Statistics
    this.stats = {
      messagesProcessed: 0,
      problemsDetected: 0,
      diagnosesRun: 0,
      autoFixesApplied: 0
    };
  }

  /**
   * Start the watcher
   */
  async start() {
    if (!this.enabled) {
      console.log('[AdminWatcher] Disabled via ADMIN_WATCHER_ENABLED env var');
      return;
    }

    if (!this.openai) {
      console.warn('[AdminWatcher] OPENAI_API_KEY not set, watcher disabled');
      return;
    }

    console.log('[AdminWatcher] Starting admin message watcher...');
    console.log(`[AdminWatcher] Model: ${this.model}`);
    console.log(`[AdminWatcher] Cooldown: ${this.cooldownMs / 1000}s`);

    // Listen to all messages
    this.client.onAnyMessage(async (message) => {
      try {
        await this.processMessage(message);
      } catch (err) {
        console.error('[AdminWatcher] Error processing message:', err);
      }
    });

    console.log('[AdminWatcher] ✓ Watcher active');
  }

  /**
   * Process incoming message
   */
  async processMessage(message) {
    this.stats.messagesProcessed++;

    // Ignore messages from bot itself
    if (message.fromMe) return;

    // Extract sender and body
    const messageKey = message.key || {};
    const rawSender = messageKey.participant || message.sender?.id || message.from;
    const body = (message.body || message.caption || '').trim();

    if (!body) return;

    // Only process messages from admins
    if (!isAdmin(rawSender, message)) {
      return;
    }

    // Check if this is a problem report
    if (this.isProblemReport(body)) {
      this.stats.problemsDetected++;
      await this.handleProblemReport(message, body);
    }
  }

  /**
   * Detect if message is a problem report
   * @param {string} text - Message text
   * @returns {boolean}
   */
  isProblemReport(text) {
    const lowerText = text.toLowerCase();

    // Check for keywords
    const hasKeyword = this.keywords.some(kw => lowerText.includes(kw));
    if (!hasKeyword) return false;

    // Require bot context to avoid false positives
    const botContextKeywords = [
      'bot', 'sticker', 'figurinha', 'enviar', 'envia', 'scheduler', 'baileys',
      'comando', 'command', '#', 'grupo', 'group', 'whatsapp', 'mensagem',
      'duplicad', 'verificação', 'verificacao', 'banco', 'database'
    ];

    const hasBotContext = botContextKeywords.some(kw => lowerText.includes(kw));

    // Also accept if it's a question (likely asking about a problem)
    const isQuestion = lowerText.includes('?');

    return hasKeyword && (hasBotContext || isQuestion);
  }

  /**
   * Handle problem report from admin
   */
  async handleProblemReport(message, problemText) {
    const chatId = message.from;

    // Check cooldown
    const lastDiagnosis = this.cooldown.get(chatId);
    if (lastDiagnosis && Date.now() - lastDiagnosis < this.cooldownMs) {
      console.log(`[AdminWatcher] Cooldown active for ${chatId}, skipping diagnosis`);
      return;
    }

    console.log('[AdminWatcher] 🚨 Problem report detected:', problemText);

    // Optional: Send casual acknowledgment (can be disabled via env var)
    const sendAck = process.env.ADMIN_WATCHER_SEND_ACK !== 'false';
    if (sendAck) {
      const ackMessages = [
        'deixa eu dar uma olhada aqui',
        'vou checar isso',
        'peraí, vou investigar',
        'deixa eu verificar',
        'tô vendo... um segundo',
        'hmm, deixa eu ver o que tá rolando'
      ];
      const randomAck = ackMessages[Math.floor(Math.random() * ackMessages.length)];

      await safeReply(this.client, chatId, randomAck, message);
    }

    try {
      // Run diagnosis with timeout
      console.log('[AdminWatcher] Starting diagnosis...');

      // Start typing indicator manually
      if (typeof this.client.simulateTyping === 'function') {
        await this.client.simulateTyping(chatId, true).catch(() => {});
      }

      const diagnosisPromise = this.diagnoseAndFix(problemText, chatId);

      // Add 60 second timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Diagnosis timeout (60s)')), 60000);
      });

      const result = await Promise.race([diagnosisPromise, timeoutPromise]);
      console.log('[AdminWatcher] Diagnosis completed');

      // Stop typing indicator
      if (typeof this.client.simulateTyping === 'function') {
        await this.client.simulateTyping(chatId, false).catch(() => {});
      }

      // Send result
      await safeReply(this.client, chatId, result, message);

      // Update cooldown
      this.cooldown.set(chatId, Date.now());
      this.stats.diagnosesRun++;

    } catch (err) {
      console.error('[AdminWatcher] Diagnosis failed:', err);

      const errorMessages = [
        `deu erro aqui ao tentar diagnosticar: ${err.message}\n\nmelhor checar os logs manualmente`,
        `não consegui diagnosticar, deu erro: ${err.message}\n\nvai ter que olhar manual mesmo`,
        `puts, falhou o diagnóstico: ${err.message}\n\nve os logs aí pra entender melhor`
      ];
      const randomError = errorMessages[Math.floor(Math.random() * errorMessages.length)];

      await safeReply(this.client, chatId, randomError, message);
    }
  }

  /**
   * Diagnose and fix problem using OpenAI
   */
  async diagnoseAndFix(problemDescription, groupId) {
    console.log('[AdminWatcher] Building OpenAI prompt...');

    const messages = [{
      role: 'system',
      content: `Você é um admin técnico sênior de um bot do WhatsApp chamado Sticker Bot. Você está respondendo casualmente no grupo para um colega admin que reportou um problema.

INSTRUÇÕES OBRIGATÓRIAS:
1. SEMPRE use as ferramentas disponíveis para investigar o problema
2. NUNCA responda sem investigar primeiro - use pelo menos 1-2 ferramentas
3. Comece investigando logs (getBotLogs) ou status de serviços (getServiceStatus)
4. Após investigar, responda em português brasileiro informal e casual

Como responder (APÓS investigar):
- Linguagem casual: "achei o problema", "dei um restart", "tá rodando de boa"
- Máximo 1-2 emojis por mensagem
- Sem formatação excessiva ou títulos formais
- Direto e objetivo, mas amigável

Ferramentas disponíveis (USE-AS ANTES DE RESPONDER!):

DIAGNÓSTICO:
- getBotLogs(service, lines, level) - ver logs recentes do bot/baileys/web
- searchLogsForPattern(pattern, service) - buscar erro específico
- getServiceStatus(service) - status PM2 (uptime, memory, restarts)
- getLastSentSticker() - último sticker enviado
- getSchedulerStatus() - status do scheduler
- getQueueStatus() - fila de processamento
- readFile(filePath) - ler código-fonte (.env.example, configs, etc)
- runHealthCheck(checkType) - health check completo
- analyzeDatabaseSchema(tableName) - analisar estrutura do banco

CORREÇÃO (USE PARA APLICAR FIXES!):
- restartService(service) - reiniciar serviço offline/crashado
- executeSqlQuery(query) - executar SQL (SELECT/INSERT/UPDATE/CREATE TABLE)
- createDatabaseTable(tableName, schema) - criar tabela que está faltando
- modifyBotConfig(key, value) - modificar config do bot (ex: scheduler_enabled)
- clearProcessingQueue(status) - limpar fila travada (failed/stuck/all)
- writeFile(filePath, content) - escrever arquivo de correção

IMPORTANTE: VOCÊ PODE E DEVE APLICAR CORREÇÕES AUTOMATICAMENTE!
- Tabela faltando? Use createDatabaseTable
- Config errada? Use modifyBotConfig
- Fila travada? Use clearProcessingQueue
- Serviço offline? Use restartService
- Dados corrompidos? Use executeSqlQuery

PROCESSO:
1. Use ferramentas de DIAGNÓSTICO para investigar
2. Analise os resultados e identifique a causa raiz
3. Use ferramentas de CORREÇÃO para aplicar o fix automaticamente
4. Responda casualmente explicando o que achou E O QUE VOCÊ FEZ para corrigir

Exemplo BOM (diagnostica E corrige):
Problema: "erro na verificação de duplicadas"
[usa getBotLogs] → vê "SQLITE_ERROR: no such table: media_queue"
[usa analyzeDatabaseSchema] → confirma que media_queue não existe
[usa readFile('database/schema.sql')] → encontra schema da tabela
[usa createDatabaseTable] → cria a tabela faltante
[usa restartService('sticker-bot')] → reinicia bot para aplicar
Responde: "achei o problema 👍 a tabela media_queue tava faltando no banco. criei ela e reiniciei o bot. agora a verificação de duplicadas tá funcionando de boa"

Exemplo RUIM (só diagnostica, não corrige):
[usa getBotLogs] → vê erro
Responde: "o problema é que a tabela media_queue não existe. você vai precisar criar ela manualmente" ❌ VOCÊ PODE CRIAR!

Exemplo PÉSSIMO (não usa ferramentas):
"deixa eu ver... deve ser problema no banco de dados" ❌ SEM INVESTIGAR`
    },
    {
      role: 'user',
      content: `${problemDescription}`
    }];

    const tools = getOpenAITools();

    console.log('[AdminWatcher] Calling OpenAI API...');
    console.log(`[AdminWatcher] Model: ${this.model}, Tools: ${tools.length}`);

    let response = await this.openai.chat.completions.create({
      model: this.model,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.1, // More deterministic for diagnostics
      max_tokens: 2000
    });

    console.log('[AdminWatcher] OpenAI API responded');

    // Tool calling loop
    let iterations = 0;
    const maxIterations = 10; // Prevent infinite loops

    while (response.choices[0].finish_reason === 'tool_calls' && iterations < maxIterations) {
      iterations++;
      console.log(`[AdminWatcher] Tool call iteration ${iterations}/${maxIterations}`);

      const toolCalls = response.choices[0].message.tool_calls;
      console.log(`[AdminWatcher] Processing ${toolCalls.length} tool calls`);

      // Add assistant message with tool calls
      messages.push(response.choices[0].message);

      // Execute each tool call
      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        console.log(`[AdminWatcher] 🔧 Calling tool: ${functionName}`, functionArgs);

        try {
          const result = await handleToolCall(functionName, functionArgs);

          // Track auto-fixes
          if (functionName === 'restartService' && result.success) {
            this.stats.autoFixesApplied++;
            console.log(`[AdminWatcher] ✓ Auto-fix applied: restarted ${functionArgs.service}`);
          }

          // Add tool result
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result, null, 2)
          });

        } catch (err) {
          console.error(`[AdminWatcher] Tool ${functionName} failed:`, err);

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: err.message })
          });
        }
      }

      // Continue conversation with tool results
      console.log('[AdminWatcher] Calling OpenAI with tool results...');
      response = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.1,
        max_tokens: 2000
      });
      console.log('[AdminWatcher] OpenAI responded to iteration');
    }

    // Extract final response
    const finalMessage = response.choices[0].message.content;

    if (!finalMessage) {
      return 'investiguei aqui mas não consegui gerar uma resposta. ve os logs do sistema pra ter mais detalhes';
    }

    return finalMessage;
  }

  /**
   * Get watcher statistics
   */
  getStats() {
    return {
      ...this.stats,
      enabled: this.enabled,
      model: this.model,
      activeCooldowns: this.cooldown.size
    };
  }

  /**
   * Clear cooldown for a specific chat (for testing)
   */
  clearCooldown(chatId) {
    this.cooldown.delete(chatId);
  }

  /**
   * Clear all cooldowns
   */
  clearAllCooldowns() {
    this.cooldown.clear();
  }
}

module.exports = { AdminWatcher };
