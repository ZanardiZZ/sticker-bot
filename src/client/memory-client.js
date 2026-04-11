/**
 * Lia-Core Memory Client Bridge
 * Cliente para integrar o Sticker Bot com a API de memória
 * 
 * Uso: const memory = require('./memory-client');
 *       await memory.init();
 */

const axios = require('axios');

const DEFAULT_MEMORY_API_URL = '';
const CATEGORY_PREFIXES = {
  confirmed: 'confirmed:',
  softSignal: 'soft:',
  provisional: 'provisional:'
};
const GROUP_DYNAMIC_EVENT_TYPE = 'group_dynamic';
const USER_INTENT_EVENT_TYPE = 'user_intent_signal';
const INTENT_FACT_SOURCE = 'intent_profiler';

const INTENT_RULES = [
  {
    intent: 'adversarial_testing',
    weight: 3,
    pattern: /(ignore\s+as\s+instru[cç][aã]o(?:es)?\s+anteriores|jailbreak|prompt\s*injection|bypass|contornar\s+(?:regra|filtro|bloqueio)|quebra\s+o\s+bot|exploit|for[çc]ar\s+falha|vulnerabilidade|inje[cç][aã]o|do\s+anything\s+now|dan\b)/iu
  },
  {
    intent: 'playful_trolling',
    weight: 1.4,
    pattern: /(te peguei|pegadinha|trol(a|ar|ando)|zoeira|bait|kkkkk+\s+bot|haha+\s+bot)/iu
  },
  {
    intent: 'builder_collab',
    weight: 1.8,
    pattern: /(vamos\s+melhorar|ajudar\s+o\s+bot|teste\s+controlado|cen[aá]rio\s+de\s+teste|issue|bug\s+report|pull\s+request|refactor|observabilidade|telemetria)/iu
  }
];

let cachedAiHelpers = null;

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeFactText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitClauses(text) {
  const rawClauses = String(text || '')
    .split(/[\n\r]+|[.;!?]+|\s+mas\s+|\s+porém\s+|\s+só que\s+/iu)
    .map(chunk => normalizeFactText(chunk))
    .filter(Boolean);

  const subclauses = [];
  for (const clause of rawClauses) {
    const commaParts = clause
      .split(/\s*,\s*/u)
      .map(part => normalizeFactText(part))
      .filter(Boolean);

    for (const commaPart of commaParts) {
      const andParts = commaPart
        .split(/\s+e\s+(?=(?:eu\b|hoje\b|agora\b|meu\b|minha\b|moro\b|vivo\b|trabalho\b|atuo\b|mex[o]?\b|sou\b|tenho\b|gosto\b|adoro\b|amo\b|curto\b|prefiro\b|não gosto\b|odeio\b|detesto\b|faço\b|curso\b|estudo\b|namoro\b|estou namorando\b|torço\b))/iu)
        .map(part => normalizeFactText(part))
        .filter(Boolean);

      subclauses.push(...andParts);
    }
  }

  return subclauses;
}

function cleanCapturedValue(value) {
  return normalizeFactText(value)
    .replace(/^(que|de|do|da|dos|das)\s+/iu, '')
    .replace(/\s+(hoje|agora|ultimamente)$/iu, '')
    .trim();
}

function extractHeuristicFacts(messageText = '') {
  const text = normalizeFactText(messageText);
  if (!text || text.length < 4) {
    return [];
  }

  const clauses = splitClauses(text);
  const collected = [];

  const patterns = [
    {
      category: 'identity',
      confidence: 0.95,
      regex: /(?:meu nome é|eu me chamo|pode me chamar de)\s+([\p{L}][\p{L}\s'-]{1,40})/iu,
      format: (value) => `nome é ${value}`
    },
    {
      category: 'age',
      confidence: 0.9,
      regex: /(?:tenho|tô com|estou com)\s+(\d{1,3})\s+anos/iu,
      format: (value) => `tem ${value} anos`
    },
    {
      category: 'location',
      confidence: 0.82,
      regex: /(?:moro|vivo|cresci|nasci)\s+em\s+([^,]+)$/iu,
      format: (value) => `mora em ${value}`
    },
    {
      category: 'profession',
      confidence: 0.82,
      regex: /(?:trabalho com|atuo com|mex[o]? com)\s+([^,]+)$/iu,
      format: (value) => `trabalha com ${value}`
    },
    {
      category: 'profession',
      confidence: 0.8,
      regex: /(?:trabalho como|atuo como|sou)\s+(?:um|uma)?\s*([^,]+)$/iu,
      guard: (value) => value.split(/\s+/).length <= 6,
      format: (value) => `é ${value}`
    },
    {
      category: 'interest',
      confidence: 0.78,
      regex: /(?:gosto de|adoro|amo|curto|sou fã de)\s+([^,]+)$/iu,
      format: (value) => `gosta de ${value}`
    },
    {
      category: 'preference',
      confidence: 0.74,
      regex: /(?:prefiro)\s+([^,]+)$/iu,
      format: (value) => `prefere ${value}`
    },
    {
      category: 'dislike',
      confidence: 0.74,
      regex: /(?:não gosto de|odeio|detesto)\s+([^,]+)$/iu,
      format: (value) => `não gosta de ${value}`
    },
    {
      category: 'education',
      confidence: 0.8,
      regex: /(?:faço faculdade de|curso|estudo)\s+([^,]+)$/iu,
      format: (value) => `estuda ${value}`
    },
    {
      category: 'relationship',
      confidence: 0.76,
      regex: /(?:sou casad[oa]|sou noiv[oa]|namoro|estou namorando|sou solteir[oa])/iu,
      format: (value) => value
    },
    {
      category: 'family',
      confidence: 0.72,
      regex: /(?:tenho)\s+(\d+)\s+filh[oa]s?/iu,
      format: (value) => `tem ${value} filhos`
    },
    {
      category: 'pets',
      confidence: 0.72,
      regex: /(?:tenho)\s+(?:um|uma|dois|duas|\d+)\s+([^,]+)$/iu,
      guard: (value) => /cachorr|gat|pet|coelh|papagai|calops|hamster|tartarug/iu.test(value),
      format: (value) => `tem ${value}`
    },
    {
      category: 'sports',
      confidence: 0.76,
      regex: /(?:torço pro|torço para o|sou torcedor do|sou torcedora do)\s+([^,]+)$/iu,
      format: (value) => `torce para ${value}`
    },
    {
      category: 'technology',
      confidence: 0.76,
      regex: /(?:programo em|desenvolvo em|uso no trabalho)\s+([^,]+)$/iu,
      format: (value) => `usa ${value}`
    },
    {
      category: 'birthday',
      confidence: 0.78,
      regex: /(?:meu aniversário é|faço aniversário em)\s+([^,]+)$/iu,
      format: (value) => `faz aniversário em ${value}`
    }
  ];

  for (const clause of clauses) {
    for (const pattern of patterns) {
      const match = clause.match(pattern.regex);
      if (!match) continue;
      const captured = cleanCapturedValue(match[1] || match[0]);
      if (!captured) continue;
      if (typeof pattern.guard === 'function' && !pattern.guard(captured)) continue;
      collected.push({
        fact: normalizeFactText(pattern.format(captured)),
        category: pattern.category,
        confidence: pattern.confidence,
        source: 'whatsapp_bot_heuristic'
      });
    }
  }

  return collected;
}

function dedupeFacts(facts = []) {
  const unique = new Map();
  for (const fact of facts) {
    const normalizedFact = normalizeFactText(fact?.fact);
    if (!normalizedFact) continue;
    const key = normalizedFact.toLowerCase();
    const existing = unique.get(key);
    if (!existing || Number(fact.confidence || 0) > Number(existing.confidence || 0)) {
      unique.set(key, {
        fact: normalizedFact,
        category: fact.category || 'general',
        confidence: Number.isFinite(Number(fact.confidence)) ? Number(fact.confidence) : 0.7,
        source: fact.source || 'whatsapp_bot'
      });
    }
  }
  return Array.from(unique.values());
}

function classifyMemoryTier(entry = {}) {
  if (entry.memoryType) return entry.memoryType;
  if (entry.layer === 'explicit') return 'confirmed';
  if (entry.layer === 'inferred') return 'softSignal';
  if (entry.layer === 'speculative') return 'provisional';
  const confidence = Number(entry.confidence || 0);
  if (confidence >= 0.8) return 'confirmed';
  if (confidence >= 0.6) return 'softSignal';
  return 'provisional';
}

function encodeFactCategory(memoryType, category = 'general') {
  const prefix = CATEGORY_PREFIXES[memoryType] || CATEGORY_PREFIXES.confirmed;
  return `${prefix}${category}`;
}

function decodeFactCategory(category = '') {
  const normalized = String(category || '').trim();
  for (const [memoryType, prefix] of Object.entries(CATEGORY_PREFIXES)) {
    if (normalized.startsWith(prefix)) {
      return {
        memoryType,
        category: normalized.slice(prefix.length) || 'general'
      };
    }
  }
  return {
    memoryType: 'confirmed',
    category: normalized || 'general'
  };
}

function buildMemoryItem(entry = {}) {
  const fact = normalizeFactText(entry.fact);
  if (!fact) return null;
  const memoryType = classifyMemoryTier(entry);
  return {
    fact,
    category: entry.category || 'general',
    confidence: Number.isFinite(Number(entry.confidence)) ? Number(entry.confidence) : 0.7,
    source: entry.source || 'whatsapp_bot',
    memoryType,
    evidenceCount: Number.isFinite(Number(entry.evidenceCount)) ? Number(entry.evidenceCount) : 1
  };
}

function dedupeMemoryItems(items = []) {
  const unique = new Map();
  for (const item of items) {
    const normalizedFact = normalizeFactText(item?.fact);
    if (!normalizedFact) continue;
    const key = `${classifyMemoryTier(item)}|${normalizedFact.toLowerCase()}`;
    const existing = unique.get(key);
    if (!existing || Number(item.confidence || 0) > Number(existing.confidence || 0)) {
      unique.set(key, {
        ...item,
        fact: normalizedFact,
        memoryType: classifyMemoryTier(item),
        confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 0.7,
        evidenceCount: Number.isFinite(Number(item.evidenceCount)) ? Number(item.evidenceCount) : 1
      });
    }
  }
  return Array.from(unique.values());
}

function parseStoredFactEntry(entry = {}) {
  const decoded = decodeFactCategory(entry.category);
  return {
    fact: normalizeFactText(entry.fact || entry.content || entry.text),
    category: decoded.category,
    confidence: Number.isFinite(Number(entry.confidence)) ? Number(entry.confidence) : 0.7,
    source: entry.source || 'whatsapp_bot',
    memoryType: decoded.memoryType,
    evidenceCount: Number.isFinite(Number(entry.evidenceCount || entry.evidence_count))
      ? Number(entry.evidenceCount || entry.evidence_count)
      : 1
  };
}

function hydrateLayeredUser(user = {}, factsPayload = []) {
  const storedFacts = Array.isArray(factsPayload?.facts)
    ? factsPayload.facts
    : Array.isArray(factsPayload)
      ? factsPayload
      : [];
  const parsedFacts = storedFacts
    .map(parseStoredFactEntry)
    .filter((entry) => entry.fact);

  const confirmedFacts = parsedFacts.filter((entry) => entry.memoryType === 'confirmed');
  const softSignals = parsedFacts.filter((entry) => entry.memoryType === 'softSignal');
  const provisionalMemories = parsedFacts.filter((entry) => entry.memoryType === 'provisional');

  return {
    ...user,
    recentFacts: Array.isArray(user?.recentFacts) && user.recentFacts.length
      ? user.recentFacts
      : confirmedFacts.slice(0, 6),
    confirmedFacts,
    softSignals,
    provisionalMemories
  };
}

function extractKeywords(text = '') {
  const stopwords = new Set([
    'que', 'pra', 'para', 'com', 'sem', 'mas', 'porque', 'como', 'isso', 'essa', 'esse', 'vou',
    'está', 'tá', 'uma', 'uns', 'umas', 'dos', 'das', 'por', 'ele', 'ela', 'eles', 'elas',
    'você', 'vocês', 'isso', 'aqui', 'ali', 'ainda', 'depois', 'antes', 'sobre', 'grupo',
    'bot', 'lia', 'hoje', 'ontem', 'amanhã', 'também', 'muito', 'mais', 'menos', 'tem', 'sou',
    'ser', 'estar', 'falar', 'falando', 'fala', 'kkkk', 'kkkkk', 'rs', 'rss', 'sim', 'não'
  ]);
  return String(text || '')
    .toLowerCase()
    .normalize('NFKC')
    .match(/[\p{L}\p{N}]{3,}/gu) || []
    .filter((token) => !stopwords.has(token));
}

function deriveActiveTopics(texts = [], limit = 5) {
  const counter = new Map();
  for (const text of texts) {
    const seen = new Set();
    for (const keyword of extractKeywords(text)) {
      if (seen.has(keyword)) continue;
      seen.add(keyword);
      counter.set(keyword, (counter.get(keyword) || 0) + 1);
    }
  }

  return Array.from(counter.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([topic, count]) => ({ topic, mentions: count }));
}

function extractHeuristicGroupDynamics(messageText = '', recentMessages = []) {
  const text = normalizeFactText(messageText);
  if (!text) return [];

  const dynamics = [];
  const expertiseMatch = text.match(/([\p{L}\s'-]{2,40})\s+(?:sempre fala de|manja de|entende de|é o rei do|é a rainha da)\s+([^,!.?]+)/iu);
  if (expertiseMatch) {
    const person = normalizeFactText(expertiseMatch[1]);
    const topic = cleanCapturedValue(expertiseMatch[2]);
    if (person && topic) {
      dynamics.push({
        type: 'role',
        description: `${person} é associado a ${topic} no grupo`,
        participants: [person],
        topic,
        confidence: countJokeMentions({ name: topic }, recentMessages) >= 1 ? 0.82 : 0.68
      });
    }
  }

  const affinityMatch = text.match(/eu e ([\p{L}\s'-]{2,40})\s+(?:sempre|vivemos|só)\s+([^,!.?]+)/iu);
  if (affinityMatch) {
    const person = normalizeFactText(affinityMatch[1]);
    const activity = cleanCapturedValue(affinityMatch[2]);
    if (person && activity) {
      dynamics.push({
        type: 'affinity',
        description: `Há afinidade recorrente entre o remetente e ${person}: ${activity}`,
        participants: [person],
        topic: activity,
        confidence: 0.67
      });
    }
  }

  return dynamics;
}

function collectGroupDynamics(eventsPayload) {
  const events = Array.isArray(eventsPayload?.events)
    ? eventsPayload.events
    : Array.isArray(eventsPayload)
      ? eventsPayload
      : [];

  return events
    .filter((event) => event?.type === GROUP_DYNAMIC_EVENT_TYPE)
    .map((event) => ({
      description: normalizeFactText(event?.description || event?.content || ''),
      participants: Array.isArray(event?.participants) ? event.participants : [],
      topic: normalizeFactText(event?.topic || '')
    }))
    .filter((entry) => entry.description);
}

function scoreIntentSignals(messageText = '') {
  const text = normalizeFactText(messageText);
  const scores = {
    adversarial_testing: 0,
    playful_trolling: 0,
    builder_collab: 0,
    normal_use: 0.25
  };

  if (!text) return scores;

  for (const rule of INTENT_RULES) {
    if (rule.pattern.test(text)) {
      scores[rule.intent] = (scores[rule.intent] || 0) + rule.weight;
    }
  }

  if (text.length > 2 && !Object.values(scores).some((value, idx) => idx < 3 && value > 0)) {
    scores.normal_use += 0.8;
  }

  return scores;
}

function pickTopIntent(scores = {}) {
  const entries = Object.entries(scores || {});
  if (!entries.length) {
    return { topIntent: 'normal_use', confidence: 0.5, scores: { normal_use: 1 } };
  }

  entries.sort((a, b) => b[1] - a[1]);
  const [topIntent, topScore] = entries[0];
  const total = entries.reduce((acc, [, value]) => acc + Math.max(Number(value) || 0, 0), 0);
  const confidence = total > 0 ? Math.min(Math.max(topScore / total, 0), 1) : 0.5;

  return {
    topIntent,
    confidence,
    scores: Object.fromEntries(entries)
  };
}

function buildUserIntentProfile(eventsPayload, userIds = []) {
  const events = Array.isArray(eventsPayload?.events)
    ? eventsPayload.events
    : Array.isArray(eventsPayload)
      ? eventsPayload
      : [];

  const targetUsers = Array.isArray(userIds) ? userIds.filter(Boolean) : [];
  const profiles = {};

  for (const userId of targetUsers) {
    const baseScores = {
      adversarial_testing: 0,
      playful_trolling: 0,
      builder_collab: 0,
      normal_use: 0.4
    };

    const relevantEvents = events.filter((event) => String(event?.userId || '') === String(userId));

    for (const event of relevantEvents) {
      if (event?.type === USER_INTENT_EVENT_TYPE && typeof event?.topic === 'string' && baseScores[event.topic] !== undefined) {
        const eventConfidence = Number(event?.confidence);
        const weight = Number.isFinite(eventConfidence) ? Math.max(eventConfidence, 0.3) : 0.7;
        baseScores[event.topic] += weight;
      }

      const content = normalizeFactText(event?.content || event?.description || event?.message || '');
      const scored = scoreIntentSignals(content);
      for (const [intent, value] of Object.entries(scored)) {
        baseScores[intent] = (baseScores[intent] || 0) + value;
      }
    }

    const picked = pickTopIntent(baseScores);
    profiles[userId] = {
      ...picked,
      evidenceCount: relevantEvents.length,
      toneHint: picked.topIntent === 'adversarial_testing'
        ? 'defensive_strict'
        : picked.topIntent === 'playful_trolling'
          ? 'playful_controlled'
          : picked.topIntent === 'builder_collab'
            ? 'collaborative_technical'
            : 'neutral_friendly'
    };
  }

  return profiles;
}

function normalizeIntentLabel(intent = 'normal_use') {
  switch (intent) {
    case 'adversarial_testing':
      return 'teste adversarial';
    case 'playful_trolling':
      return 'zoeira leve';
    case 'builder_collab':
      return 'colaboração técnica';
    default:
      return 'uso normal';
  }
}

function normalizeJokeText(value) {
  return normalizeFactText(value)
    .replace(/^["'“”‘’]+|["'“”‘’]+$/gu, '')
    .trim();
}

function extractHeuristicRunningJoke(messageText = '') {
  const text = normalizeFactText(messageText);
  if (!text || text.length < 8) {
    return null;
  }

  const patterns = [
    {
      regex: /(?:agora o|agora a|a partir de hoje o|a partir de hoje a)\s+(.+?)\s+(?:é|virou)\s+(?:o|a)?\s*["'“”]?([^"'“”!?.,]+)["'“”]?/iu,
      build: (match) => ({
        name: normalizeJokeText(match[2]),
        origin: normalizeJokeText(match[1]),
        context: normalizeJokeText(match[0]),
        confidence: 0.82
      })
    },
    {
      regex: /(?:vamos chamar|pode chamar|chamem|todo mundo chama)\s+(?:o|a)?\s*(.+?)\s+de\s+["'“”]?([^"'“”!?.,]+)["'“”]?/iu,
      build: (match) => ({
        name: normalizeJokeText(match[2]),
        origin: normalizeJokeText(match[1]),
        context: normalizeJokeText(match[0]),
        confidence: 0.84
      })
    },
    {
      regex: /(?:apelido (?:dele|dela|do|da)\s+.+?\s+(?:é|virou)|o apelido (?:dele|dela|do|da)\s+.+?\s+(?:é|virou))\s+["'“”]?([^"'“”!?.,]+)["'“”]?/iu,
      build: (match) => ({
        name: normalizeJokeText(match[1]),
        origin: '',
        context: normalizeJokeText(match[0]),
        confidence: 0.8
      })
    }
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (!match) continue;
    const candidate = pattern.build(match);
    if (!candidate.name || candidate.name.split(/\s+/u).length > 5) {
      continue;
    }
    return candidate;
  }

  return null;
}

function collectRecentMessageTexts(eventsPayload) {
  const events = Array.isArray(eventsPayload?.events)
    ? eventsPayload.events
    : Array.isArray(eventsPayload)
      ? eventsPayload
      : [];

  return events
    .map((event) => normalizeFactText(event?.content || event?.description || event?.message || ''))
    .filter(Boolean);
}

function countJokeMentions(candidate, texts = []) {
  if (!candidate?.name) return 0;
  const target = normalizeJokeText(candidate.name).toLowerCase();
  return texts.reduce((total, text) => {
    const normalizedText = normalizeFactText(text).toLowerCase();
    return total + (normalizedText.includes(target) ? 1 : 0);
  }, 0);
}

function getAiHelpers() {
  if (cachedAiHelpers !== null) {
    return cachedAiHelpers;
  }

  try {
    cachedAiHelpers = require('../services/ai');
  } catch (error) {
    cachedAiHelpers = {};
  }

  return cachedAiHelpers;
}

function buildMemoryPromptFromContext(memoryContext = {}, senderId = null) {
  const context = memoryContext && typeof memoryContext === 'object' ? memoryContext : {};
  const sections = [];
  const user = senderId && context.users ? context.users[senderId] : null;
  const recentFacts = Array.isArray(user?.recentFacts) ? user.recentFacts : [];
  const confirmedFacts = Array.isArray(user?.confirmedFacts) ? user.confirmedFacts : [];
  const softSignals = Array.isArray(user?.softSignals) ? user.softSignals : [];
  const provisionalMemories = Array.isArray(user?.provisionalMemories) ? user.provisionalMemories : [];
  const runningJokes = Array.isArray(context.runningJokes) ? context.runningJokes : [];
  const activeTopics = Array.isArray(context.activeTopics) ? context.activeTopics : [];
  const groupDynamics = Array.isArray(context.groupDynamics) ? context.groupDynamics : [];
  const intentProfile = senderId && context.userIntentProfiles ? context.userIntentProfiles[senderId] : null;

  const preferredConfirmedFacts = confirmedFacts.length ? confirmedFacts : recentFacts;

  if (preferredConfirmedFacts.length) {
    const facts = preferredConfirmedFacts
      .map((item) => item?.fact || item?.content || item?.text)
      .filter(Boolean)
      .slice(0, 5);
    if (facts.length) {
      sections.push(`Memórias confirmadas do usuário atual: ${facts.join('; ')}.`);
    }
  }

  if (softSignals.length) {
    const signals = softSignals
      .map((item) => item?.fact || item?.content || item?.text)
      .filter(Boolean)
      .slice(0, 4);
    if (signals.length) {
      sections.push(`Sinais recorrentes do usuário atual, use como contexto e não como certeza absoluta: ${signals.join('; ')}.`);
    }
  }

  if (provisionalMemories.length) {
    const signals = provisionalMemories
      .map((item) => item?.fact || item?.content || item?.text)
      .filter(Boolean)
      .slice(0, 3);
    if (signals.length) {
      sections.push(`Pistas fracas do usuário atual, só use se combinar com a conversa: ${signals.join('; ')}.`);
    }
  }

  if (runningJokes.length) {
    const jokes = runningJokes
      .map((item) => item?.name || item?.title || item?.context)
      .filter(Boolean)
      .slice(0, 5);
    if (jokes.length) {
      sections.push(`Piadas internas do grupo: ${jokes.join('; ')}.`);
    }
  }

  if (activeTopics.length) {
    const topics = activeTopics
      .map((item) => (typeof item === 'string' ? item : item?.topic || item?.name))
      .filter(Boolean)
      .slice(0, 5);
    if (topics.length) {
      sections.push(`Tópicos ativos recentes: ${topics.join('; ')}.`);
    }
  }

  if (groupDynamics.length) {
    const dynamics = groupDynamics
      .map((item) => item?.description || item?.topic)
      .filter(Boolean)
      .slice(0, 4);
    if (dynamics.length) {
      sections.push(`Dinâmica social recente do grupo: ${dynamics.join('; ')}.`);
    }
  }

  if (intentProfile?.topIntent) {
    const confidencePct = Math.round(Math.min(Math.max(Number(intentProfile.confidence) || 0, 0), 1) * 100);
    sections.push(`Perfil de intenção do usuário atual: ${normalizeIntentLabel(intentProfile.topIntent)} (${confidencePct}%).`);
  }

  return sections.join(' ');
}

class MemoryClient {
  constructor() {
    this.baseUrl = this.resolveBaseUrl();
    this.initialized = false;
    this.lastHealthcheck = null;
    this.timeoutMs = parsePositiveNumber(process.env.MEMORY_TIMEOUT_MS, 3000);
    this.retryCount = Math.max(parsePositiveNumber(process.env.MEMORY_RETRY_COUNT, 1) - 1, 0);
  }

  resolveBaseUrl() {
    return String(process.env.MEMORY_API_URL || DEFAULT_MEMORY_API_URL).trim();
  }

  isEnabled() {
    const raw = process.env.MEMORY_ENABLED;
    const hasBaseUrl = !!this.resolveBaseUrl();
    if (raw === undefined) return hasBaseUrl;
    return hasBaseUrl && !['0', 'false', 'off', 'no'].includes(String(raw).trim().toLowerCase());
  }

  isReady() {
    return this.initialized && this.isEnabled();
  }

  init() {
    this.baseUrl = this.resolveBaseUrl();
    this.timeoutMs = parsePositiveNumber(process.env.MEMORY_TIMEOUT_MS, 3000);
    this.retryCount = Math.max(parsePositiveNumber(process.env.MEMORY_RETRY_COUNT, 1) - 1, 0);
    this.initialized = true;
    if (!this.baseUrl) {
      console.log('[MemoryClient] Integração desabilitada sem MEMORY_API_URL configurada');
      return this;
    }
    if (!this.isEnabled()) {
      console.log('[MemoryClient] Integração desabilitada via MEMORY_ENABLED');
      return this;
    }
    console.log('[MemoryClient] 🧠 Bridge configurado em:', this.baseUrl);
    return this;
  }

  // ============================================
  // UTILITÁRIOS
  // ============================================
  
  async request(method, endpoint, data = null) {
    if (!this.isEnabled()) return null;

    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      method,
      url,
      timeout: this.timeoutMs
    };
    if (data) config.data = data;

    let attempt = 0;
    const maxAttempts = this.retryCount + 1;

    while (attempt < maxAttempts) {
      try {
        const response = await axios(config);
        return response.data;
      } catch (err) {
        attempt += 1;
        const status = err?.response?.status ? ` status=${err.response.status}` : '';
        const finalAttempt = attempt >= maxAttempts;
        console.error(
          `[MemoryClient] Erro em ${method} ${endpoint}${status}: ${err.message}`
          + (finalAttempt ? '' : ` (retry ${attempt}/${this.retryCount})`)
        );
        if (finalAttempt) {
          return null;
        }
      }
    }
  }

  async healthcheck() {
    if (!this.isEnabled()) {
      this.lastHealthcheck = { ok: false, disabled: true };
      return this.lastHealthcheck;
    }

    const response = await this.getUser('healthcheck');
    const ok = !!response && typeof response === 'object' && Object.prototype.hasOwnProperty.call(response, 'exists');
    this.lastHealthcheck = {
      ok,
      url: this.baseUrl,
      checkedAt: new Date().toISOString()
    };
    return this.lastHealthcheck;
  }

  // ============================================
  // USUÁRIOS
  // ============================================

  async getUser(userId) {
    return this.request('GET', `/api/user/${userId}`);
  }

  async saveUser(userId, data) {
    return this.request('POST', `/api/user/${userId}`, data);
  }

  async addFact(userId, fact, category = 'general', confidence = 0.8, source = 'whatsapp_bot') {
    return this.request('POST', `/api/user/${userId}/fact`, {
      fact,
      category,
      confidence,
      source
    });
  }

  async getFacts(userId, options = {}) {
    const { category, limit = 20 } = options;
    let url = `/api/user/${userId}/facts?limit=${limit}`;
    if (category) url += `&category=${category}`;
    return this.request('GET', url);
  }

  // ============================================
  // GRUPOS
  // ============================================

  async getGroup(groupId) {
    return this.request('GET', `/api/group/${groupId}`);
  }

  async saveGroup(groupId, data) {
    return this.request('POST', `/api/group/${groupId}`, data);
  }

  async addRunningJoke(groupId, name, origin, context) {
    return this.request('POST', `/api/group/${groupId}/joke`, {
      name,
      origin,
      context
    });
  }

  // ============================================
  // EVENTOS
  // ============================================

  async logEvent(eventData) {
    return this.request('POST', '/api/event', {
      ...eventData,
      timestamp: new Date().toISOString()
    });
  }

  async getEvents(groupId, options = {}) {
    const { type, limit = 20 } = options;
    let url = `/api/events?groupId=${groupId}&limit=${limit}`;
    if (type) url += `&type=${type}`;
    return this.request('GET', url);
  }

  // ============================================
  // INSIGHTS (Contexto Enriquecido)
  // ============================================

  async getInsights(groupId, userIds = []) {
    const userIdsParam = userIds.join(',');
    return this.request('GET', `/api/insights/${groupId}?userIds=${userIdsParam}`);
  }

  // ============================================
  // MÉTODOS DE ALTO NÍVEL (Para o Bot)
  // ============================================

  /**
   * Extrai fatos importantes de uma mensagem e salva no perfil do usuário
   */
  async learnFromMessage(userId, messageText, groupId = null) {
    const cleanedText = normalizeFactText(messageText);
    const heuristicFacts = extractHeuristicFacts(cleanedText);
    let aiFacts = [];
    let recentMessages = [];
    let runningJoke = null;
    let groupDynamics = [];

    let recentEvents = null;
    if (groupId) {
      recentEvents = await this.getEvents(groupId, { limit: 25 });
      recentMessages = collectRecentMessageTexts(recentEvents);
    }

    const { extractMemoryFactsFromText, extractRunningJokeFromText } = getAiHelpers();
    if (typeof extractMemoryFactsFromText === 'function' && cleanedText.length >= 12) {
      aiFacts = await extractMemoryFactsFromText({
        text: cleanedText,
        recentMessages,
        maxFacts: 5
      });
      aiFacts = aiFacts.map((fact) => buildMemoryItem({
        fact: fact.fact,
        category: fact.category || 'general',
        confidence: Number.isFinite(Number(fact.confidence)) ? Number(fact.confidence) : 0.72,
        source: 'whatsapp_bot_ai',
        layer: fact.layer,
        memoryType: fact.memoryType,
        evidenceCount: fact.evidenceCount
      })).filter(Boolean);
    }

    const heuristicMemory = heuristicFacts.map((fact) => buildMemoryItem({
      ...fact,
      memoryType: 'confirmed'
    })).filter(Boolean);

    const memoryItems = dedupeMemoryItems([...heuristicMemory, ...aiFacts]);
    for (const factEntry of memoryItems) {
      await this.addFact(
        userId,
        factEntry.fact,
        encodeFactCategory(factEntry.memoryType, factEntry.category),
        factEntry.confidence,
        factEntry.source
      );
    }

    const intentSignal = pickTopIntent(scoreIntentSignals(cleanedText));
    if (intentSignal.topIntent && intentSignal.topIntent !== 'normal_use' && intentSignal.confidence >= 0.45) {
      await this.addFact(
        userId,
        `perfil de intenção observado: ${normalizeIntentLabel(intentSignal.topIntent)}`,
        encodeFactCategory('softSignal', `intent/${intentSignal.topIntent}`),
        intentSignal.confidence,
        INTENT_FACT_SOURCE
      );

      if (groupId) {
        await this.logEvent({
          type: USER_INTENT_EVENT_TYPE,
          groupId,
          userId,
          topic: intentSignal.topIntent,
          confidence: intentSignal.confidence,
          content: cleanedText.slice(0, 180)
        });
      }
    }

    if (groupId) {
      const heuristicJoke = extractHeuristicRunningJoke(cleanedText);
      const heuristicMentions = countJokeMentions(heuristicJoke, recentMessages);
      if (heuristicJoke && heuristicMentions >= 1) {
        runningJoke = heuristicJoke;
      } else {
        if (typeof extractRunningJokeFromText === 'function' && recentMessages.length >= 2) {
          const aiJoke = await extractRunningJokeFromText({
            text: cleanedText,
            recentMessages,
            maxFacts: 1
          });
          const aiMentions = countJokeMentions(aiJoke, recentMessages);
          if (aiJoke && (aiMentions >= 1 || aiJoke.confidence >= 0.9)) {
            runningJoke = {
              ...aiJoke,
              confidence: aiJoke.confidence
            };
          }
        }
      }

      groupDynamics = extractHeuristicGroupDynamics(cleanedText, recentMessages);
      for (const dynamic of groupDynamics) {
        if ((dynamic.confidence || 0) < 0.7) continue;
        await this.logEvent({
          type: GROUP_DYNAMIC_EVENT_TYPE,
          groupId,
          userId,
          description: dynamic.description,
          participants: dynamic.participants,
          topic: dynamic.topic,
          confidence: dynamic.confidence
        });
      }

      if (runningJoke) {
        await this.addRunningJoke(
          groupId,
          runningJoke.name,
          runningJoke.origin || userId,
          runningJoke.context
        );
      }
    }

    // Log da interação
    await this.logEvent({
      type: 'message',
      groupId,
      userId,
      content: messageText.substring(0, 200), // limitar
      factsExtracted: memoryItems.length,
      runningJokeDetected: !!runningJoke,
      groupDynamicsDetected: groupDynamics.length,
      inferredIntent: intentSignal.topIntent,
      inferredIntentConfidence: intentSignal.confidence
    });

    return memoryItems.map((entry) => ({
      fact: entry.fact,
      category: entry.category,
      memoryType: entry.memoryType
    }));
  }

  /**
   * Monta contexto para resposta do bot
   */
  async buildContext(groupId, userIds = [], options = {}) {
    const insights = await this.getInsights(groupId, userIds);
    const events = groupId ? await this.getEvents(groupId, { limit: 40 }) : null;

    if (!insights || !insights.users) {
      return {
        users: {},
        group: null,
        runningJokes: [],
        activeTopics: [],
        groupDynamics: [],
        userIntentProfiles: {},
        memoryPrompt: '',
        memoryPromptsByUser: {}
      };
    }

    const layeredUsers = {};
    for (const userId of userIds) {
      const baseUser = insights.users?.[userId] || {};
      const factsPayload = userId ? await this.getFacts(userId, { limit: 40 }) : { facts: [] };
      layeredUsers[userId] = hydrateLayeredUser(baseUser, factsPayload);
    }

    for (const [userId, user] of Object.entries(insights.users || {})) {
      if (!layeredUsers[userId]) {
        layeredUsers[userId] = hydrateLayeredUser(user, []);
      }
    }

    const recentMessageTexts = collectRecentMessageTexts(events);
    const derivedTopics = deriveActiveTopics(recentMessageTexts);
    const existingTopics = Array.isArray(insights.group?.activeTopics) ? insights.group.activeTopics : [];

    const selectedUserIds = Array.isArray(userIds) ? userIds.filter(Boolean) : [];
    const userIntentProfiles = buildUserIntentProfile(events, selectedUserIds);

    const contextPayload = {
      users: layeredUsers,
      group: insights.group,
      runningJokes: insights.group?.runningJokes || [],
      activeTopics: existingTopics.length ? existingTopics : derivedTopics,
      groupDynamics: collectGroupDynamics(events),
      userIntentProfiles
    };

    const preferredSenderId = String(options?.senderId || '').trim() || selectedUserIds[0] || null;

    const memoryPromptsByUser = {};
    for (const uid of selectedUserIds) {
      memoryPromptsByUser[uid] = buildMemoryPromptFromContext(contextPayload, uid);
    }

    contextPayload.memoryPromptsByUser = memoryPromptsByUser;
    contextPayload.memoryPrompt = preferredSenderId
      ? (memoryPromptsByUser[preferredSenderId] || buildMemoryPromptFromContext(contextPayload, preferredSenderId))
      : buildMemoryPromptFromContext(contextPayload, null);

    return contextPayload;
  }

  /**
   * Rápido: obtém ou cria perfil de usuário
   */
  async ensureUser(userId, defaultData = {}) {
    let user = await this.getUser(userId);
    if (!user || !user.exists) {
      user = await this.saveUser(userId, {
        userId,
        ...defaultData,
        firstSeen: new Date().toISOString()
      });
    }
    return user;
  }

  /**
   * Rápido: obtém ou cria perfil de grupo
   */
  async ensureGroup(groupId, defaultData = {}) {
    let group = await this.getGroup(groupId);
    if (!group || !group.exists) {
      group = await this.saveGroup(groupId, {
        groupId,
        ...defaultData,
        firstSeen: new Date().toISOString()
      });
    }
    return group;
  }
}

// Exportar singleton
const memoryClient = new MemoryClient();

module.exports = memoryClient;
