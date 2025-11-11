const path = require('path');
const fs = require('fs').promises;
const { isAiAvailable, generateConversationalReply } = require('./ai');
const { withTyping } = require('../utils/typingIndicator');
const { safeReply } = require('../utils/safeMessaging');
const { getLogCollector } = require('../utils/logCollector');

const ENABLED = (process.env.CONVERSATION_AGENT_ENABLED || '1').toLowerCase() !== '0' &&
  (process.env.CONVERSATION_AGENT_ENABLED || '1').toLowerCase() !== 'false';
const HISTORY_LIMIT = Math.max(Number(process.env.CONVERSATION_HISTORY_LIMIT) || 16, 8);
const COOLDOWN_MS = Number.isFinite(Number(process.env.CONVERSATION_COOLDOWN_MS))
  ? Number(process.env.CONVERSATION_COOLDOWN_MS)
  : 120000;
const MIN_MESSAGES_BEFORE_RESPONSE = Math.max(Number(process.env.CONVERSATION_MIN_MESSAGES) || 3, 1);
const MAX_REPLY_CHARS = Math.max(Number(process.env.CONVERSATION_MAX_RESPONSE_CHARS) || 360, 120);
const PERSONA_NAME = (process.env.CONVERSATION_PERSONA_NAME || 'Lia').trim();
const ALIASES = (process.env.CONVERSATION_ALIASES || PERSONA_NAME)
  .split(',')
  .map(alias => alias.trim().toLowerCase())
  .filter(Boolean);
const STORAGE_DIR = path.join(__dirname, '../data/conversations');
const LOG_PREFILL_LIMIT = Math.max(Number(process.env.CONVERSATION_LOG_PREFILL_LIMIT) || 12, 4);

function normalizeIdentifier(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

function expandIdentifier(value) {
  const token = normalizeIdentifier(value);
  if (!token) return [];

  const variants = new Set([token]);
  const [beforeAt, ...afterAtParts] = token.split('@');
  if (beforeAt) variants.add(beforeAt);

  if (beforeAt && beforeAt.includes(':')) {
    const [beforeColon] = beforeAt.split(':');
    if (beforeColon) {
      variants.add(beforeColon);
      if (afterAtParts.length) {
        variants.add(`${beforeColon}@${afterAtParts.join('@')}`);
      }
      if (/^\d+$/.test(beforeColon)) {
        variants.add(`${beforeColon}@s.whatsapp.net`);
      }
    }
  }

  if (!token.includes('@') && /^\d+$/.test(token)) {
    variants.add(`${token}@s.whatsapp.net`);
  }

  return Array.from(variants).filter(Boolean);
}

function addIdentifierVariants(targetSet, value) {
  const variants = expandIdentifier(value);
  variants.forEach(variant => {
    const normalized = normalizeIdentifier(variant);
    if (normalized) targetSet.add(normalized);
  });
}

function buildSelfIdentifierSet() {
  const sources = [
    process.env.CONVERSATION_SELF_JIDS,
    process.env.BOT_SELF_JIDS,
    process.env.BOT_JID,
    process.env.BOT_NUMBER
  ];
  const set = new Set();
  for (const source of sources) {
    if (!source) continue;
    const tokens = String(source)
      .split(/[,\s]+/)
      .map(normalizeIdentifier)
      .filter(Boolean);
    for (const token of tokens) {
      addIdentifierVariants(set, token);
    }
  }
  return set;
}

const SELF_IDENTIFIERS = buildSelfIdentifierSet();

let logCollectorInstance = null;

function getCollector() {
  if (!logCollectorInstance) {
    try {
      logCollectorInstance = getLogCollector();
    } catch (err) {
      console.warn('[ConversationAgent] Não foi possível obter log collector:', err?.message || err);
    }
  }
  return logCollectorInstance;
}

const stateCache = new Map();
let storageReady = false;

function defaultState() {
  return {
    history: [],
    lastReplyAt: 0,
    lastActivityAt: 0,
    messagesSinceLastReply: 0,
    _logsPrefilled: false
  };
}

async function ensureStorageDir() {
  if (storageReady) return;
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  storageReady = true;
}

function stateFilePath(chatId) {
  const safeId = String(chatId || 'unknown')
    .replace(/[^a-z0-9@._-]/gi, '_');
  return path.join(STORAGE_DIR, `${safeId}.json`);
}

async function loadStateFromDisk(chatId) {
  try {
    await ensureStorageDir();
    const file = stateFilePath(chatId);
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultState();
    parsed.history = Array.isArray(parsed.history) ? parsed.history : [];
    parsed.lastReplyAt = Number(parsed.lastReplyAt) || 0;
    parsed.lastActivityAt = Number(parsed.lastActivityAt) || 0;
    parsed.messagesSinceLastReply = Number(parsed.messagesSinceLastReply) || 0;
    parsed._logsPrefilled = false;
    return parsed;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[ConversationAgent] Falha ao carregar histórico:', err.message);
    }
    return defaultState();
  }
}

async function getState(chatId) {
  if (stateCache.has(chatId)) {
    return stateCache.get(chatId);
  }
  const state = await loadStateFromDisk(chatId);
  stateCache.set(chatId, state);
  return state;
}

async function persistState(chatId, state) {
  try {
    await ensureStorageDir();
    const file = stateFilePath(chatId);
    const payload = {
      history: state.history,
      lastReplyAt: state.lastReplyAt || 0,
      lastActivityAt: state.lastActivityAt || 0,
      messagesSinceLastReply: state.messagesSinceLastReply || 0
    };
    await fs.writeFile(file, JSON.stringify(payload));
  } catch (err) {
    console.warn('[ConversationAgent] Falha ao salvar histórico:', err.message);
  }
}

function pruneHistory(state) {
  if (!Array.isArray(state.history)) state.history = [];
  if (state.history.length > HISTORY_LIMIT) {
    state.history = state.history.slice(-HISTORY_LIMIT);
  }
}

function parseLoggedMessage(logMessage = '') {
  if (!logMessage.includes('[MSG]')) return null;
  const segments = logMessage.split('|').map(seg => seg.trim());
  if (segments.length < 3) return null;

  const typeSegment = (segments[1] || '').toLowerCase();
  if (typeSegment && typeSegment !== 'chat' && typeSegment !== 'conversation') return null;

  const fromSegment = segments.find(seg => seg.startsWith('De: '));
  const chatSegment = segments.find(seg => seg.startsWith('Chat: '));
  const bodySegment = segments.find(seg => /^".*"$/.test(seg));

  if (!chatSegment) return null;
  const chatId = chatSegment.replace('Chat: ', '').trim();
  let senderName = 'Integrante';
  let senderId = 'desconhecido';

  if (fromSegment) {
    const match = fromSegment.match(/^De:\s+(.+?)(?:\s+\(([^)]+)\))?$/);
    if (match) {
      senderName = match[1] ? match[1].trim() : senderName;
      senderId = match[2] ? match[2].trim() : senderId;
    }
  }

  let text = '';
  if (bodySegment) {
    text = bodySegment.slice(1, -1).trim();
  }

  return {
    chatId,
    senderId,
    senderName,
    text
  };
}

function prefillHistoryFromLogs(chatId, state, currentMessage) {
  if (!chatId || state._logsPrefilled) return;

  const collector = getCollector();
  if (!collector || typeof collector.getLogs !== 'function') {
    state._logsPrefilled = true;
    return;
  }

  try {
    const entries = collector.getLogs({ limit: 200 }).logs || [];
    if (!entries.length) {
      state._logsPrefilled = true;
      return;
    }

    const relevant = entries
      .filter(entry => entry?.message?.includes('[MSG]') && entry.message.includes(`Chat: ${chatId}`))
      .map(entry => {
        const parsed = parseLoggedMessage(entry.message);
        if (!parsed || parsed.chatId !== chatId) return null;
        return {
          role: 'user',
          senderId: parsed.senderId || 'desconhecido',
          senderName: parsed.senderName || 'Integrante',
          text: parsed.text,
          timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now() - 1000
        };
      })
      .filter(Boolean);

    if (!relevant.length) {
      state._logsPrefilled = true;
      return;
    }

    relevant.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    const snippet = currentMessage?.text ? currentMessage.text.slice(0, 120) : '';
    const senderId = currentMessage?.senderId;
    const existingHistory = state.history || [];

    for (const entry of relevant.slice(-LOG_PREFILL_LIMIT)) {
      if (!entry.text) continue;
      if (snippet && entry.text === snippet && (!senderId || senderId === entry.senderId)) continue;

      const alreadyPresent = existingHistory.some(hist => {
        if (!hist) return false;
        const sameSender = hist.senderId === entry.senderId;
        const sameText = hist.text === entry.text;
        const timeGap = Math.abs((hist.timestamp || 0) - (entry.timestamp || 0));
        return sameSender && sameText && timeGap < 2000;
      });
      if (alreadyPresent) continue;

      state.history.push(entry);
    }

    pruneHistory(state);
  } catch (err) {
    console.warn('[ConversationAgent] Falha ao pré-carregar histórico dos logs:', err?.message || err);
  } finally {
    state._logsPrefilled = true;
  }
}

function matchesIdentifierInSet(candidate, identifierSet) {
  if (!identifierSet || !candidate) return false;
  const normalized = normalizeIdentifier(candidate);
  if (!normalized) return false;
  if (identifierSet.has(normalized)) return true;
  const variants = expandIdentifier(normalized);
  return variants.some(variant => identifierSet.has(variant));
}

function matchesSelfIdentifier(candidate, extraIdentifiers) {
  if (!candidate) return false;
  if (matchesIdentifierInSet(candidate, SELF_IDENTIFIERS)) return true;
  if (!extraIdentifiers) return false;
  return matchesIdentifierInSet(candidate, extraIdentifiers);
}

function extractMentionedJids(rawMessage) {
  const accumulator = new Set();

  const add = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const normalized = normalizeIdentifier(value);
      if (normalized) accumulator.add(normalized);
    }
  };

  add(rawMessage?.mentionedJid);
  add(rawMessage?.mentions);
  add(rawMessage?.mentionedIds);
  add(rawMessage?.contextInfo?.mentionedJid);
  add(rawMessage?.contextInfo?.participants);
  add(rawMessage?.contextInfo?.participant);

  const messageNode = rawMessage?.message || rawMessage?.msg;
  if (messageNode) {
    const contexts = [
      messageNode?.extendedTextMessage?.contextInfo,
      messageNode?.conversationContextInfo,
      messageNode?.buttonsResponseMessage?.contextInfo,
      messageNode?.listResponseMessage?.contextInfo,
      messageNode?.interactiveResponseMessage?.contextInfo,
      messageNode?.templateButtonReplyMessage?.contextInfo
    ];
    contexts.forEach(ctx => {
      add(ctx?.mentionedJid);
      add(ctx?.participants);
      add(ctx?.participant);
    });
  }

  // Some adapters embed contextInfo directly under message.contextInfo
  add(messageNode?.contextInfo?.mentionedJid);
  add(messageNode?.contextInfo?.participants);
  add(messageNode?.contextInfo?.participant);

  return Array.from(accumulator);
}

function cleanText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function shouldIgnoreText(text, mentionDetected = false) {
  if (!text) return true;
  if (/^[#\/!]/.test(text)) return true;
  if (text.startsWith('@') && !mentionDetected) return true;
  if (/^https?:\/\//i.test(text)) return true;
  if (text.length < 2) return true;
  const alpha = text.replace(/[^\p{L}\p{N}]/gu, '');
  if (alpha.length === 0) return true;
  return false;
}

function detectAliasMention(text) {
  const lower = text.toLowerCase();
  return ALIASES.some(alias => alias && lower.includes(alias));
}

function buildSystemPrompt(groupName) {
  const template = process.env.CONVERSATION_SYSTEM_PROMPT;
  if (template) {
    return template
      .replace(/\{persona\}/gi, PERSONA_NAME)
      .replace(/\{grupo\}|\{group\}/gi, groupName || 'grupo');
  }

  return [
    `Aja como integrante real do grupo ${groupName || 'do WhatsApp'} e mantenha a conversa informal.`,
    `Internamente seu nome é ${PERSONA_NAME}, mas nunca mencione esse ou qualquer outro nome para se apresentar.`,
    'Fale sempre em português brasileiro, com tom casual e natural.',
    'Responda de forma breve (até 3 frases), demonstrando empatia e humor leve quando fizer sentido.',
    'Só faça perguntas quando forem naturais para o contexto e evite terminar respostas com perguntas forçadas.',
    'Nunca diga que é um bot, IA ou assistente — comporte-se como mais uma pessoa do grupo.',
    'Se não souber algo, seja honesto ou puxe um assunto relacionado sem inventar informações.'
  ].join(' ');
}

function buildAiMessages(state, { groupName }) {
  pruneHistory(state);
  const participants = new Set();
  const dialogue = state.history.map(entry => {
    if (entry.role !== 'assistant' && entry.senderName) participants.add(entry.senderName);
    if (entry.role === 'assistant') {
      return {
        role: 'assistant',
        content: entry.text
      };
    }
    const name = entry.senderName || 'Integrante';
    return {
      role: 'user',
      content: `${name}: ${entry.text}`
    };
  });

  const roster = participants.size ? `Participantes ativos: ${Array.from(participants).slice(-6).join(', ')}.` : '';
  return [
    { role: 'system', content: `${buildSystemPrompt(groupName)} ${roster}`.trim() },
    ...dialogue
  ];
}

function clampReplyLength(reply) {
  if (!reply) return reply;
  if (reply.length <= MAX_REPLY_CHARS) return reply.trim();
  const truncated = reply.slice(0, MAX_REPLY_CHARS + 1);
  const safeCut = truncated.replace(/\s+\S*$/, '').trim();
  return (safeCut || truncated.slice(0, MAX_REPLY_CHARS)).trim();
}

function sanitizeReplyText(reply) {
  if (!reply) return reply;
  let cleaned = reply.replace(/(?<!\S)(?:como|por ser) (?:uma?|) (?:ia|inteligência artificial|bot)[^.?!]*[.?!]?/gi, '').trim();
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned || reply.trim();
}

function computeShouldRespond(state, text, { mentionDetected }) {
  if (mentionDetected) {
    return true;
  }

  const now = Date.now();
  const sinceLastReply = now - (state.lastReplyAt || 0);

  if (state.messagesSinceLastReply < MIN_MESSAGES_BEFORE_RESPONSE) {
    return false;
  }
  if (state.lastReplyAt && sinceLastReply < COOLDOWN_MS) {
    return false;
  }

  let probability = 0.18;
  const lower = text.toLowerCase();

  if (/[?？]$/.test(text)) probability += 0.25;
  if (lower.includes('alguém sabe') || lower.includes('como faz') || lower.includes('o que')) probability += 0.15;
  if (lower.includes('vc') || lower.includes('você') || lower.includes('tu')) probability += 0.1;
  if (lower.includes('bot') || lower.includes('robô')) probability += 0.15;

  probability += Math.min(state.messagesSinceLastReply * 0.04, 0.25);
  if (sinceLastReply > 10 * 60 * 1000) probability += 0.1;
  if (text.length > 180) probability -= 0.05;

  probability = Math.max(0, Math.min(probability, 0.95));
  return Math.random() < probability;
}

function deriveSenderName(rawMessage, fallback) {
  return cleanText(
    rawMessage?.pushName ||
    rawMessage?.sender?.name ||
    rawMessage?.notifyName ||
    rawMessage?.chat?.name ||
    fallback ||
    'Integrante'
  ) || 'Integrante';
}

function deriveGroupName(rawMessage) {
  return cleanText(
    rawMessage?.chat?.name ||
    rawMessage?.chatName ||
    rawMessage?.chat?.subject ||
    rawMessage?.groupMetadata?.subject ||
    rawMessage?.groupName ||
    ''
  );
}

async function handleGroupChatMessage(client, message, context = {}) {
  try {
    if (!ENABLED) return false;
    if (!client || !message) return false;
    if (!isAiAvailable()) return false;

    const chatId = context.chatId || message.from;
    if (!chatId || !String(chatId).includes('@g.us')) return false;

    const text = cleanText(message.body || message.message || '');
    const senderId = context.senderId || message.author || message.sender?.id;
    const senderName = context.senderName || deriveSenderName(message, senderId || '');
    const groupName = context.groupName || deriveGroupName(message) || null;
    const contextSelfIdentifiers = new Set();
    if (Array.isArray(context.selfJids)) {
      context.selfJids.forEach(value => addIdentifierVariants(contextSelfIdentifiers, value));
    } else if (context.selfJids) {
      addIdentifierVariants(contextSelfIdentifiers, context.selfJids);
    }

    const mentionedJids = extractMentionedJids(message);
    const explicitMention = mentionedJids.some(jid => matchesSelfIdentifier(jid, contextSelfIdentifiers));
    const mentionDetected = detectAliasMention(text) || explicitMention;
    if (shouldIgnoreText(text, mentionDetected)) return false;

    const state = await getState(chatId);
    prefillHistoryFromLogs(chatId, state, { text, senderId, senderName });

    const messageTimestamp = message.timestamp ? message.timestamp * 1000 : Date.now();
    const normalizedSenderId = senderId || 'desconhecido';
    const lastEntry = state.history[state.history.length - 1];

    if (!lastEntry || lastEntry.senderId !== normalizedSenderId || lastEntry.text !== text) {
      state.history.push({
        role: 'user',
        senderId: normalizedSenderId,
        senderName,
        text,
        timestamp: messageTimestamp
      });
    }
    state.messagesSinceLastReply = (state.messagesSinceLastReply || 0) + 1;
    state.lastActivityAt = Date.now();
    pruneHistory(state);

    const shouldRespond = computeShouldRespond(state, text, { mentionDetected });
    if (!shouldRespond) {
      await persistState(chatId, state);
      return false;
    }

    const messages = buildAiMessages(state, { groupName });
    const reply = await generateConversationalReply({ messages });
    if (!reply) {
      await persistState(chatId, state);
      return false;
    }

    const sanitized = sanitizeReplyText(clampReplyLength(reply));
    if (!sanitized) {
      await persistState(chatId, state);
      return false;
    }

    await withTyping(client, chatId, async () => {
      if (typeof client.sendText === 'function') {
        await client.sendText(chatId, sanitized);
      } else if (typeof client.sendMessage === 'function') {
        await client.sendMessage(chatId, sanitized);
      } else {
        await safeReply(client, chatId, sanitized, message?.id);
      }
    });

    const now = Date.now();
    state.history.push({
      role: 'assistant',
      senderId: 'bot',
      senderName: PERSONA_NAME,
      text: sanitized,
      timestamp: now
    });
    state.lastReplyAt = now;
    state.messagesSinceLastReply = 0;
    state.lastActivityAt = now;
    pruneHistory(state);

    await persistState(chatId, state);
    return true;
  } catch (err) {
    console.error('[ConversationAgent] Erro ao processar mensagem de grupo:', err);
    return false;
  }
}

module.exports = {
  handleGroupChatMessage
};
