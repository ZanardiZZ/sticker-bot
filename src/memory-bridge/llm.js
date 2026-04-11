const axios = require('axios');

function resolveMemoryLlmUrl() {
  const explicit = String(process.env.MEMORY_LLM_URL || '').trim();
  if (explicit) return explicit;

  const conversationBase = String(process.env.CONVERSATION_BASE_URL || process.env.OPENAI_BASE_URL || '').trim();
  if (!conversationBase) return 'http://192.168.20.24:8080/v1/completions';

  if (/\/chat\/completions$/i.test(conversationBase) || /\/completions$/i.test(conversationBase)) {
    return conversationBase;
  }

  return `${conversationBase.replace(/\/+$/, '')}/completions`;
}

const LLM_ENABLED = !['0', 'false', 'off', 'no'].includes(String(process.env.MEMORY_LLM_ENABLED || '1').trim().toLowerCase());
const LLM_URL = resolveMemoryLlmUrl();
const LLM_MODEL = String(process.env.MEMORY_LLM_MODEL || process.env.CONVERSATION_MODEL || 'qwen3.5:9b').trim();
const LLM_TIMEOUT_MS = Number(process.env.MEMORY_LLM_TIMEOUT_MS || 2500);
const LLM_API_KEY = String(process.env.MEMORY_LLM_API_KEY || process.env.CONVERSATION_API_KEY || process.env.OPENAI_API_KEY || 'not-required').trim();

function simpleTopic(text = '') {
  const source = String(text || '').toLowerCase();
  const map = [
    ['deploy', /deploy|rollback|release|pipeline|ci\/cd|build/],
    ['infra', /servidor|lxc|docker|kubernetes|cluster|rede|network/],
    ['sticker', /figurinha|sticker|pack|gif|midia|meme/],
    ['ia', /ia|llm|modelo|qwen|openai|prompt/],
    ['jogo', /half-life|black mesa|gordon|combine|headcrab|jogo/]
  ];

  for (const [topic, regex] of map) {
    if (regex.test(source)) return { topic, confidence: 0.6, source: 'heuristic' };
  }

  return { topic: 'geral', confidence: 0.4, source: 'heuristic' };
}

function extractJsonFromText(text = '') {
  const raw = String(text || '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end >= start) {
    return raw.slice(start, end + 1);
  }
  return raw;
}

async function callOpenAiStyle(text) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${LLM_API_KEY || 'not-required'}`
  };

  const isChatEndpoint = /\/chat\/completions$/i.test(LLM_URL);

  if (isChatEndpoint) {
    return axios.post(
      LLM_URL,
      {
        model: LLM_MODEL,
        temperature: 0.1,
        max_tokens: 120,
        messages: [
          {
            role: 'system',
            content:
              'Classifique o tópico principal da mensagem em UMA palavra curta em português. ' +
              'Responda estritamente JSON: {"topic":"...","confidence":0.0}'
          },
          { role: 'user', content: text }
        ]
      },
      { timeout: LLM_TIMEOUT_MS, headers }
    );
  }

  return axios.post(
    LLM_URL,
    {
      model: LLM_MODEL,
      temperature: 0.1,
      max_tokens: 120,
      prompt:
        'Classifique o tópico principal da mensagem em UMA palavra curta em português. ' +
        'Responda estritamente JSON: {"topic":"...","confidence":0.0}\n\n' +
        `Mensagem: ${text}`
    },
    { timeout: LLM_TIMEOUT_MS, headers }
  );
}

async function inferTopic(text = '', fallback = null) {
  const clean = String(text || '').trim();
  if (!clean) return fallback || simpleTopic(clean);

  if (!LLM_ENABLED || !LLM_URL || !LLM_MODEL) {
    return fallback || simpleTopic(clean);
  }

  try {
    const response = await callOpenAiStyle(clean);
    const raw = response?.data?.choices?.[0]?.message?.content || response?.data?.choices?.[0]?.text || '';

    const jsonText = extractJsonFromText(raw);
    const parsed = JSON.parse(jsonText);

    const topic = String(parsed?.topic || '').trim().slice(0, 40);
    const confidence = Number(parsed?.confidence);

    if (!topic) return fallback || simpleTopic(clean);

    return {
      topic,
      confidence: Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0.7,
      source: 'llm'
    };
  } catch {
    return fallback || simpleTopic(clean);
  }
}

module.exports = {
  inferTopic,
  llmConfig: {
    enabled: LLM_ENABLED,
    url: LLM_URL,
    model: LLM_MODEL,
    timeoutMs: LLM_TIMEOUT_MS,
    hasApiKey: !!LLM_API_KEY
  }
};
