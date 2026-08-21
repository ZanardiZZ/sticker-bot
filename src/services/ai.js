require('dotenv').config();
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { resolveFfmpegPath } = require('../utils/ffmpeg');
const ffmpegPath = resolveFfmpegPath();
const { TEMP_DIR } = require('../paths');
const { conversationMetrics } = require('./conversationMetrics');

function createOpenAIClient({ apiKey, baseURL, timeoutMs = 0 }) {
  if (!apiKey) return null;
  const options = { apiKey };
  const backfillTimeout = Number(process.env.BACKFILL_OPENAI_TIMEOUT_MS || 0);
  const configuredTimeout = Number(timeoutMs || 0);
  const effectiveTimeout = backfillTimeout > 0 ? backfillTimeout : configuredTimeout;
  if (Number.isFinite(effectiveTimeout) && effectiveTimeout > 0) options.timeout = effectiveTimeout;
  if (baseURL) options.baseURL = baseURL;
  return new OpenAI(options);
}

const multimodalApiKey = process.env.OPENAI_MULTIMODAL_API_KEY || process.env.LEMONADE_UPSCALE_API_KEY || process.env.OPENAI_API_KEY;
const multimodalBaseURL = process.env.OPENAI_MULTIMODAL_BASE_URL || '';
let openai = createOpenAIClient({
  apiKey: multimodalApiKey,
  baseURL: multimodalBaseURL,
  timeoutMs: Number(process.env.MULTIMODAL_AI_TIMEOUT_MS || 90000)
});

if (!openai) {
  console.warn('[AI] OPENAI_API_KEY not configured. Multimodal AI features will be disabled.');
}

const conversationApiKey = process.env.CONVERSATION_API_KEY || process.env.OPENAI_API_KEY;
const conversationBaseURL = process.env.CONVERSATION_BASE_URL || process.env.OPENAI_BASE_URL || '';
let conversationAi = createOpenAIClient({
  apiKey: conversationApiKey,
  baseURL: conversationBaseURL
});

if (!conversationAi) {
  console.warn('[AI] Conversational client not configured (CONVERSATION_API_KEY/OPENAI_API_KEY missing).');
}

const conversationFallbackApiKey = process.env.CONVERSATION_FALLBACK_API_KEY || process.env.OPENAI_API_KEY;
const conversationFallbackBaseURL = process.env.CONVERSATION_FALLBACK_BASE_URL || process.env.OPENAI_FALLBACK_BASE_URL || process.env.OPENAI_MULTIMODAL_BASE_URL || '';
let conversationFallbackAi = createOpenAIClient({
  apiKey: conversationFallbackApiKey,
  baseURL: conversationFallbackBaseURL
});

if (!conversationFallbackAi) {
  console.warn('[AI] Conversation fallback client not configured (CONVERSATION_FALLBACK_API_KEY/OPENAI_API_KEY missing).');
}

const {
  APIConnectionError,
  APIConnectionTimeoutError,
  RateLimitError,
  InternalServerError,
  APIError
} = OpenAI;

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

const DEFAULT_MAX_RETRIES = parsePositiveNumber(process.env.OPENAI_MAX_RETRIES, 2);
const DEFAULT_RETRY_DELAY_MS = parsePositiveNumber(process.env.OPENAI_RETRY_DELAY_MS, 1000);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function shouldRetryOpenAiError(error) {
  if (!error) return false;

  if (
    error instanceof APIConnectionError ||
    error instanceof APIConnectionTimeoutError ||
    error instanceof RateLimitError ||
    error instanceof InternalServerError
  ) {
    return true;
  }

  if (error instanceof APIError) {
    const status = Number(error.status);
    if ([408, 409, 425, 429, 500, 502, 503, 504].includes(status)) {
      return true;
    }
  }

  const statusCode = Number(error?.status || error?.response?.status);
  if ([408, 409, 425, 429, 500, 502, 503, 504].includes(statusCode)) {
    return true;
  }

  const networkCodes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED'];
  if (networkCodes.includes(error?.code)) {
    return true;
  }

  const name = String(error?.name || '').toLowerCase();
  if (name.includes('timeout') || name.includes('connection')) {
    return true;
  }

  return false;
}

async function executeWithAiRetry(action, {
  actionLabel = 'OpenAI request',
  maxRetries = DEFAULT_MAX_RETRIES,
  baseDelayMs = DEFAULT_RETRY_DELAY_MS,
  metricStage = null
} = {}) {
  let attempt = 0;

  while (true) {
    const finishMetric = metricStage ? conversationMetrics.start(metricStage) : null;
    try {
      const result = await action();
      if (finishMetric) finishMetric('success', { attempt: attempt + 1 });
      return result;
    } catch (error) {
      const isRetryable = shouldRetryOpenAiError(error) && attempt < maxRetries;
      if (finishMetric) {
        const status = inferReasonCodeFromError(error) === 'timeout' ? 'timeout' : 'error';
        finishMetric(status, { attempt: attempt + 1, retryable: isRetryable });
      }
      if (!isRetryable) throw error;

      attempt += 1;
      const backoffMs = baseDelayMs * attempt;
      console.warn(
        `[AI] ${actionLabel} falhou (tentativa ${attempt}/${maxRetries}): ${error?.message || error}`
      );
      await sleep(backoffMs);
    }
  }
}

function buildFallbackAnnotation(type = 'imagem') {
  const baseDescription = type === 'gif'
    ? 'Análise automática indisponível para o GIF no momento.'
    : 'Análise automática indisponível para a imagem no momento.';

  return {
    description: baseDescription,
    text: '',
    tags: ['#ia-indisponivel', '#fallback', '#sticker', '#analise', '#temporario']
  };
}

/**
 * Chama a OpenAI com prompt textual customizado, retorna descrição e tags.
 * @param {string} prompt Texto do prompt a enviar.
 * @returns {Promise<{description: string|null, tags: string[]|null}>}
 */

async function normalizeAudioBufferToWav(buffer) {
  if (!ffmpegPath) throw new Error('FFmpeg não disponível para normalizar áudio');
  const id = crypto.randomBytes(8).toString('hex');
  const input = path.join(TEMP_DIR, 'gemma-audio-' + id + '.input');
  const output = path.join(TEMP_DIR, 'gemma-audio-' + id + '.wav');
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  fs.writeFileSync(input, buffer);
  try {
    await new Promise((resolve, reject) => {
      const timeoutMs = Number(process.env.GEMMA_AUDIO_NORMALIZE_TIMEOUT_MS || 30000);
      const child = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav', output], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Timeout ao normalizar áudio para WAV'));
      }, timeoutMs);
      child.stderr.on('data', chunk => { stderr += chunk.toString(); });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => {
        clearTimeout(timer);
        if (code === 0 && fs.existsSync(output)) resolve();
        else reject(new Error('FFmpeg não conseguiu normalizar áudio (' + code + '): ' + stderr.slice(0, 240)));
      });
    });
    return fs.readFileSync(output);
  } finally {
    for (const file of [input, output]) {
      try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
    }
  }
}

const audioApiKey = process.env.GEMMA_AUDIO_API_KEY || process.env.OPENAI_API_KEY || 'not-required';
const audioBaseURL = process.env.GEMMA_AUDIO_BASE_URL || process.env.OPENAI_MULTIMODAL_BASE_URL || '';
const audioAi = createOpenAIClient({ apiKey: audioApiKey, baseURL: audioBaseURL });

async function transcribeAudioBuffer(buffer, { language = process.env.AUDIO_TRANSCRIPTION_LANGUAGE || 'pt' } = {}) {
  try {
    if (!audioAi) {
      console.warn('[AI] Cliente Gemma de áudio não configurado');
      return 'Áudio não transcrito - Gemma não configurado.';
    }
    if (!buffer || buffer.length < 16) return 'Áudio não transcrito - arquivo inválido.';
    const wav = await normalizeAudioBufferToWav(buffer);
    const model = process.env.AUDIO_TRANSCRIPTION_MODEL || process.env.GEMMA_NSFW_MODEL || process.env.OPENAI_MULTIMODAL_MODEL;
    if (!model) return 'Áudio não transcrito - modelo Gemma não configurado.';
    const response = await executeWithAiRetry(
      () => audioAi.chat.completions.create({
        model,
        temperature: 0,
        max_tokens: Number(process.env.AUDIO_TRANSCRIPTION_MAX_TOKENS || 512),
        chat_template_kwargs: { enable_thinking: false },
        messages: [
          {
            role: 'system',
            content: 'Você é um transcritor de áudio. Transcreva fielmente tudo que for falado. O idioma esperado é ' + language + '. Não resuma, não explique e não invente conteúdo. Responda somente com a transcrição em texto puro.'
          },
          {
            role: 'user',
            content: [
              { type: 'input_audio', input_audio: { data: wav.toString('base64'), format: 'wav' } },
              { type: 'text', text: 'Transcreva este áudio exatamente.' }
            ]
          }
        ]
      }),
      { actionLabel: 'transcrição de áudio com Gemma' }
    );
    const text = String(response?.choices?.[0]?.message?.content || response?.choices?.[0]?.message?.reasoning_content || '').trim();
    return text || 'Áudio sem conteúdo transcrito.';
  } catch (error) {
    console.warn('[AI] Erro ao transcrever áudio com Gemma:', error.message);
    return 'Áudio não transcrito - erro no Gemma.';
  }
}

async function transcribeAudioFile(filePath, options = {}) {
  if (!fs.existsSync(filePath)) return 'Áudio não transcrito - arquivo não encontrado.';
  return transcribeAudioBuffer(fs.readFileSync(filePath), options);
}
async function getTagsFromTextPrompt(prompt) {
  try {
    if (!openai) {
      console.warn('[AI] OpenAI not configured, skipping tag generation');
      return { description: null, tags: null };
    }
    
    const response = await executeWithAiRetry(
      () => openai.chat.completions.create({
        model: process.env.OPENAI_MULTIMODAL_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 200,
      }),
      { actionLabel: 'geração de tags por texto' }
    );

    const text = response.choices[0].message.content.trim();

    // Espera tags separados por vírgula: "tag1, tag2, tag3 ..."

    if (!text) return { description: null, tags: null };

    // Quebra por vírgula e limpa espaços
    const tags = text.split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    return { description: null, tags: tags.length ? tags : null };
  } catch (error) {
    console.error('Erro em getTagsFromTextPrompt:', error);
    return { description: null, tags: null };
  }
}

/**
 * Recebe um buffer de imagem e gera o prompt e chama OpenAI para descrição e tags.
 * @param {Buffer} buffer Buffer da imagem.
 * @returns {Promise<{description: string|null, tags: string[]|null}>}
 */
async function getAiAnnotations(buffer) {
  try {
    if (!openai) {
      console.warn('[AI] OpenAI not configured, skipping annotation generation');
      return { description: null, tags: null };
    }
    
    const sharp = require('sharp');
    const DESC_MAX = 200;
    const VISION_MODEL = process.env.OPENAI_MULTIMODAL_MODEL || 'gpt-4o-mini';

    const imgBuffer = await sharp(buffer)
      .resize(512, 512, { fit: 'inside' })
      .png()
      .toBuffer();
    const b64 = imgBuffer.toString('base64');

    function cleanJsonBlock(text) {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start === -1 || end === -1) return text;
      return text.substring(start, end + 1);
    }

    function pickHashtags(text, count = 5) {
      const words = text.match(/\b\w+\b/g) || [];
      const uniqueWords = [...new Set(words.map(w => w.toLowerCase()))];
      const hashtags = uniqueWords.slice(0, count).map(w => `#${w}`);
      return hashtags.length ? hashtags : ['#imagem'];
    }

    const messages = [
      { role: 'system', content:
        `Você é um assistente de análise de imagens. Para cada imagem, siga SEMPRE:
1) Descreva a imagem de forma concisa (≤${DESC_MAX} chars), mencionando explicitamente o nome de toda pessoa/personagem/celebridade reconhecível. Se o nome não for conhecido, escreva "nome desconhecido". Inclua também o filme/série/anime/jogo ou contexto da obra quando aplicável.
2) Identifique e extraia TODO o texto visível na imagem (caso exista). Se não houver texto, retorne "".
3) Gere CINCO hashtags únicas e relevantes (começando com #), incluindo hashtags para os nomes e obras sempre que conhecidos.
Responda ESTRITAMENTE em JSON: {"description":"...","text":"...","tags":["#...",...],"metadata":{"visual_action":"...","emotion":"...","ocr_text":"...","cultural_reference":"...","usage_intent":"...","context_signals":"..."}}. A description deve continuar curta; metadata é interno. Não invente nomes, obras ou referências sem evidência visual.`
      },
      { role: 'user', content: [
          { type: 'text', text: `Descreva a imagem (≤${DESC_MAX} chars), identifique TODO o texto presente (caso exista) e gere CINCO hashtags. Certifique-se de manter na descrição e nas hashtags os nomes de pessoas/personagens reconhecíveis e o contexto de obras quando existir.` },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } }
        ]
      }
    ];

    const resp = await executeWithAiRetry(
      () => openai.chat.completions.create({
        model: VISION_MODEL,
        max_tokens: process.env.BACKFILL_MODE === '1' ? Number(process.env.BACKFILL_MAX_TOKENS || 512) : 512,
        temperature: process.env.BACKFILL_MODE === '1' ? Number(process.env.BACKFILL_TEMPERATURE || 0.2) : 0.4,
        chat_template_kwargs: { enable_thinking: false },
        messages
      }),
      { actionLabel: 'anotação de imagem' }
    );

    const raw = resp.choices[0].message.content;
    try {
      const parsed = JSON.parse(cleanJsonBlock(raw));
      let description = String(parsed.description || '').trim();
      let text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
      let tags = Array.isArray(parsed.tags) ? parsed.tags.map(t => t.trim()) : [];
      if (tags.length < 5) {
        // Completa com hashtags geradas via pickHashtags para totalizar 5
        const extraTags = pickHashtags(description, 5 - tags.length);
        tags = tags.concat(extraTags).slice(0, 5);
      } else if (tags.length > 5) {
        tags = tags.slice(0, 5);
      }
      if (tags.length === 0) tags = ['#imagem'];
      return {
        description: description.slice(0, DESC_MAX) || 'Sem descrição.',
        text,
        tags,
        metadata: parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : {}
      };
    } catch {
      // The VLM can truncate a JSON response while OCR/metadata is large.
      // Never persist the raw JSON/fence as the public description or derive
      // hashtags from JSON keys (which produced #json/#description).
      const source = String(raw || '');
      const descriptionMatch = source.match(/"description"\s*:\s*"((?:\\.|[^"\\])*)/su);
      let description = '';
      if (descriptionMatch) {
        try { description = JSON.parse('"' + descriptionMatch[1] + '"').trim(); } catch {}
      }
      if (!description) {
        description = source
          .replace(/\x60{3}(?:json)?/giu, '')
          .replace(/^[\s\{]+/u, '')
          .replace(/(?:"(?:description|text|tags|metadata)"\s*:?).*$/su, '')
          .replace(/#[^\s#]+/gu, '')
          .trim();
      }
      description = description.slice(0, DESC_MAX);
      const tagsMatch = source.match(/"tags"\s*:\s*\[([\s\S]*?)(?:\]|$)/u);
      const tags = tagsMatch
        ? [...tagsMatch[1].matchAll(/"((?:\\.|[^"\\])*)"/gu)].map(m => { try { return JSON.parse('"' + m[1] + '"').trim(); } catch { return ''; } }).filter(Boolean).slice(0, 5)
        : [];
      if (!description) {
        const fallback = buildFallbackAnnotation('gif');
        return { ...fallback, text: '', tags: tags.length ? tags : fallback.tags };
      }
      return { description, text: '', tags: tags.length ? tags : pickHashtags(description, 5) };
    }
  } catch (err) {
    console.error('❌ Erro na IA (imagem):', err);
    return buildFallbackAnnotation('imagem');
  }
}

/**
 * Analyzes a GIF frame with GIF/meme-specific prompts to avoid video terminology
 */
async function getAiAnnotationsForGif(buffer) {
  try {
    if (!openai) {
      console.warn('[AI] OpenAI not configured, skipping GIF annotation generation');
      return { description: null, tags: null };
    }
    
    const sharp = require('sharp');
    const DESC_MAX = 200;
    const VISION_MODEL = process.env.OPENAI_MULTIMODAL_MODEL || 'gpt-4o-mini';

    const imgBuffer = await sharp(buffer)
      .resize(512, 512, { fit: 'inside' })
      .png()
      .toBuffer();
    const b64 = imgBuffer.toString('base64');

    function cleanJsonBlock(text) {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start === -1 || end === -1) return text;
      return text.substring(start, end + 1);
    }

    function pickHashtags(text, count = 5) {
      const words = text.match(/\b\w+\b/g) || [];
      const uniqueWords = [...new Set(words.map(w => w.toLowerCase()))];
      const hashtags = uniqueWords.slice(0, count).map(w => `#${w}`);
      return hashtags.length ? hashtags : ['#gif'];
    }

    const messages = [
      { role: 'system', content:
        `Você é um assistente de análise de GIFs/memes. Para cada frame, sempre:
1) Descreva o frame de forma concisa (≤${DESC_MAX} chars).
2) Identifique e extraia TODO o texto visível no frame (caso exista). Se não houver texto, retorne "".
3) Gere CINCO hashtags únicas e relevantes (começando com #).
IMPORTANTE: Isto é um frame de um GIF/meme, NÃO um vídeo. Use termos como "cena", "imagem", "frame", "meme" ao invés de "vídeo", "filmagem" ou "gravação".
Responda ESTRITAMENTE em JSON: {"description":"...","text":"...","tags":["#...",...],"metadata":{"visual_action":"...","emotion":"...","cultural_reference":"...","usage_intent":"..."}}. A description deve continuar curta; metadata é interno.`
      },
      { role: 'user', content: [
          { type: 'text', text: `Analise este frame de GIF/meme (≤${DESC_MAX} chars), identifique TODO o texto presente (caso exista) e gere CINCO hashtags. Foque na ação, expressão ou situação mostrada.` },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } }
        ]
      }
    ];

    const resp = await executeWithAiRetry(
      () => openai.chat.completions.create({
        model: VISION_MODEL,
        max_tokens: 512,
        temperature: 0.4,
        chat_template_kwargs: { enable_thinking: false },
        messages
      }),
      { actionLabel: 'anotação de GIF' }
    );

    const raw = resp.choices[0].message.content;
    try {
      const parsed = JSON.parse(cleanJsonBlock(raw));
      let description = String(parsed.description || '').trim();
      let text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
      let tags = Array.isArray(parsed.tags) ? parsed.tags.map(t => t.trim()) : [];
      if (tags.length < 5) {
        // Completa com hashtags geradas via pickHashtags para totalizar 5
        const extraTags = pickHashtags(description, 5 - tags.length);
        tags = tags.concat(extraTags).slice(0, 5);
      } else if (tags.length > 5) {
        tags = tags.slice(0, 5);
      }
      if (tags.length === 0) tags = ['#gif'];
      if (!description) {
        const fallback = buildFallbackAnnotation('gif');
        return { ...fallback, text, tags: tags.length ? tags : fallback.tags };
      }
      return {
        description: description.slice(0, DESC_MAX),
        text,
        tags
      };
    } catch {
      // The VLM can truncate a JSON response while OCR/metadata is large.
      // Never persist the raw JSON/fence as the public description or derive
      // hashtags from JSON keys (which produced #json/#description).
      const source = String(raw || '');
      const descriptionMatch = source.match(/"description"\s*:\s*"((?:\\.|[^"\\])*)/su);
      let description = '';
      if (descriptionMatch) {
        try { description = JSON.parse('"' + descriptionMatch[1] + '"').trim(); } catch {}
      }
      if (!description) {
        description = source
          .replace(/\x60{3}(?:json)?/giu, '')
          .replace(/^[\s\{]+/u, '')
          .replace(/(?:"(?:description|text|tags|metadata)"\s*:?).*$/su, '')
          .replace(/#[^\s#]+/gu, '')
          .trim();
      }
      description = description.slice(0, DESC_MAX) || 'Sem descrição.';
      const tagsMatch = source.match(/"tags"\s*:\s*\[([\s\S]*?)(?:\]|$)/u);
      const tags = tagsMatch
        ? [...tagsMatch[1].matchAll(/"((?:\\.|[^"\\])*)"/gu)].map(m => { try { return JSON.parse('"' + m[1] + '"').trim(); } catch { return ''; } }).filter(Boolean).slice(0, 5)
        : pickHashtags(description, 5);
      return { description, text: '', tags: tags.length ? tags : pickHashtags(description, 5) };
    }
  } catch (err) {
    console.error('❌ Erro na IA (GIF frame):', err);
    return buildFallbackAnnotation('gif');
  }
}

async function getAiAnnotationsFromPrompt(prompt) {
  try {
    if (!openai) {
      console.warn('[AI] OpenAI not configured, skipping prompt annotation generation');
      return { description: null, tags: null };
    }
    
    const response = await executeWithAiRetry(
      () => openai.chat.completions.create({
        model: process.env.OPENAI_MULTIMODAL_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 200,
      }),
      { actionLabel: 'anotação a partir de prompt' }
    );

    const text = response.choices[0].message.content.trim();
    // Extrai JSON do texto (espera que a resposta contenha JSON entre chaves {...})
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { description: null, tags: null };

    const data = JSON.parse(jsonMatch[0]);

    if (
      typeof data.description !== 'string' ||
      !Array.isArray(data.tags)
    ) {
      return { description: null, tags: null };
    }

    return {
      description: data.description.trim(),
      tags: data.tags.map(tag => tag.trim()),
    };
  } catch (error) {
    console.error('Erro em getAiAnnotationsFromPrompt:', error);
    return { description: null, tags: null };
  }
}

/**
 * Indicates whether the OpenAI client is configured and ready.
 * @returns {boolean}
 */
function isAiAvailable() {
  return !!openai;
}

function getDefaultConversationSystemPrompt() {
  return [
    'Você é Lia, participante de grupo no WhatsApp.',
    'Responda em português brasileiro, natural e direto.',
    'Sem metadados, sem rótulos (System/Assistant), sem pensar em voz alta.'
  ].join(' ');
}

function normalizeConversationMessages(messages, { forceNoThink = false } = {}) {
  const safe = Array.isArray(messages) ? messages : [];
  const body = [];
  let systemContent = '';

  for (const entry of safe) {
    const role = String(entry?.role || '').toLowerCase();
    const content = String(entry?.content || '').trim();
    if (!content) continue;

    if (role === 'system') {
      // Consolidate all system messages into a single first system message.
      // llama.cpp chat templates can fail with HTTP 500 if system appears later.
      systemContent = systemContent ? `${systemContent}
${content}` : content;
      continue;
    }

    if (role === 'assistant' || role === 'user') {
      body.push({ role, content });
      continue;
    }

    // Unknown role fallback: treat as user content to keep context usable.
    body.push({ role: 'user', content });
  }

  if (forceNoThink) {
    for (let i = body.length - 1; i >= 0; i -= 1) {
      if (body[i].role !== 'user') continue;
      const content = String(body[i].content || '').trim();
      if (!content || content.startsWith('/no_think')) continue;
      body[i] = { ...body[i], content: `/no_think ${content}` };
      break;
    }
  }

  return [
    { role: 'system', content: systemContent || getDefaultConversationSystemPrompt() },
    ...body
  ];
}

function inferReasonCodeFromError(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const message = String(error?.message || '').toLowerCase();
  if (status >= 500) return 'provider_500';
  if (status === 429) return 'rate_limit';
  if (status >= 400) return 'provider_4xx';
  if (message.includes('system message must be at the beginning')) return 'provider_template_order';
  if (message.includes('timeout') || message.includes('timed out')) return 'timeout';
  return 'provider_error';
}

function sanitizeConversationalOutput(rawText) {
  let text = String(rawText || '').trim();
  if (!text) return '';

  text = text
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, ' ')
    .replace(/<\/?think\b[^>]*>/gi, ' ')
    .replace(/^\s*(?:assistant|assistente|system|sistema)\s*:\s*/i, '')
    .trim();

  const respostaMatch = text.match(/(?:^|\n)\s*resposta\s*:\s*([\s\S]*)$/i);
  if (respostaMatch && respostaMatch[1]) {
    text = String(respostaMatch[1]).trim();
  }

  const leakPatterns = [
    /você é lia, participante de grupo no whatsapp\.?/i,
    /lia,\s*a\s+participant\s+in\s+a\s+whatsapp\s+group\.?/i,
    /responda em português brasileiro, natural e direto\.?/i,
    /no metadata, no labels/i,
    /sem metadados, sem rótulos/i,
    /^\s*pergunta\s*:/i,
    /^\s*question\s*:/i,
    /^\s*resposta\s*:/i,
    /^\s*answer\s*:/i,
    /^\s*\*+\s*\*\*\s*(?:role|input|output|style|task|constraints?|question|goal|determine|analysis|steps?)\s*:/i,
    /^\s*\*\*\s*(?:role|input|output|style|task|constraints?|question|goal|determine|analysis|steps?)\s*:/i,
    /^\s*\d+\.\s*\*\*\s*(?:determine|analyze|apply|respond)\b/i
  ];

  const filtered = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      const normalized = line.replace(/^[-*•]\s*/, '').trim();
      if (!normalized) return false;
      return !leakPatterns.some((re) => re.test(normalized));
    });

  return filtered.join('\n').trim();
}

function isValidConversationalOutput(text) {
  const value = String(text || '').trim();
  if (!value) return false;

  const leakSignals = [
    /\b(?:system|sistema|assistant|assistente)\s*:/i,
    /<think\b/i,
    /no metadata, no labels/i,
    /sem metadados, sem rótulos/i,
    /você é lia, participante de grupo no whatsapp/i,
    /lia,\s*a\s+participant\s+in\s+a\s+whatsapp\s+group/i,
    /\*\*\s*(?:role|input|output|style|task|constraints?|question|goal|determine|analysis|steps?)\s*:/i,
    /^\s*\d+\.\s*\*\*\s*(?:determine|analyze|apply|respond)\b/im
  ];
  if (leakSignals.some((re) => re.test(value))) return false;

  const shortValid = /^[-+]?\d+(?:[.,]\d+)?(?:\s*[.!?])?$/u.test(value)
    || /^(?:sim|não|nao|ok|certo|beleza|perfeito|valeu)\b[.!?]*$/iu.test(value);

  return shortValid || value.length >= 3;
}

function hasAbruptConversationalEnding(text = '') {
  const value = String(text || '').trim();
  if (!value) return true;
  if (/[.!?…)]$/.test(value)) return false;

  const tokens = value.split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const last = (tokens[tokens.length - 1] || '').toLowerCase();

  if (/^(?:a|o|as|os|um|uma|uns|umas|de|do|da|dos|das|em|no|na|nos|nas|por|para|pra|com|sem|que|e|ou|mas|como)$/i.test(last)) {
    return true;
  }

  if (last.length <= 2) return true;
  return false;
}

async function repairConversationalOutput({ client, model, text, temperature, maxTokens }) {
  if (!client) return '';
  const raw = String(text || '').trim();
  if (!raw) return '';

  try {
    const response = await executeWithAiRetry(
      () => client.chat.completions.create({
        model,
        temperature: Math.min(Math.max(Number(temperature) || 0.2, 0), 0.7),
        max_tokens: Math.min(Math.max(Number(maxTokens) || 120, 32), 240),
        messages: [
          {
            role: 'system',
            content: 'Reescreva apenas a resposta final para WhatsApp. Sem metadados, sem rótulos, sem explicações sobre regras, sem raciocínio em voz alta. Mantenha o sentido. Não inclua markdown estrutural (ex.: **Role**, **Task**, listas de política).'
          },
          {
            role: 'user',
            content: `Texto a limpar:\n${raw}`
          }
        ]
      }),
      { actionLabel: 'reparo de saída conversacional' }
    );

    return sanitizeConversationalOutput(response?.choices?.[0]?.message?.content || '');
  } catch (error) {
    console.warn('[AI] repairConversationalOutput failed:', error?.message || error);
    return '';
  }
}

async function repairConversationalOutputStrict({ client, model, text }) {
  if (!client) return '';
  const raw = String(text || '').trim();
  if (!raw) return '';

  try {
    const response = await executeWithAiRetry(
      () => client.chat.completions.create({
        model,
        temperature: 0,
        max_tokens: 120,
        messages: [
          {
            role: 'system',
            content: 'Retorne SOMENTE uma frase final curta em português para WhatsApp. Proibido markdown, bullets, labels (Role/Input/Output/Question/Goal), instruções internas, justificativas e raciocínio. Apenas a resposta final ao usuário.'
          },
          {
            role: 'user',
            content: `Transforme este texto em uma única resposta final limpa:\n${raw}`
          }
        ]
      }),
      { actionLabel: 'reparo estrito de saída conversacional' }
    );

    return sanitizeConversationalOutput(response?.choices?.[0]?.message?.content || '');
  } catch (error) {
    console.warn('[AI] repairConversationalOutputStrict failed:', error?.message || error);
    return '';
  }
}

async function finalizeConversationalOutput({ client, model, text, temperature, maxTokens }) {
  const sanitized = sanitizeConversationalOutput(text || '');
  if (!sanitized) return 'Desculpa, não consegui formular uma resposta limpa agora. Pode repetir de outro jeito?';

  // Second pass: ask the model to return a clean final message.
  const repaired = await repairConversationalOutput({
    client,
    model,
    text: sanitized,
    temperature,
    maxTokens
  });

  let candidate = sanitizeConversationalOutput(repaired || sanitized);
  if (isValidConversationalOutput(candidate)) {
    return candidate;
  }

  // Third pass (strict): single short plain-text sentence only.
  const strict = await repairConversationalOutputStrict({
    client,
    model,
    text: candidate || sanitized
  });
  candidate = sanitizeConversationalOutput(strict || candidate);
  if (isValidConversationalOutput(candidate)) {
    return candidate;
  }

  // Deterministic final fallback to avoid leaking scaffolding/prompt text.
  return 'Desculpa, não consegui formular uma resposta limpa agora. Pode repetir de outro jeito?';
}
/**
 * Generates a conversational reply using the configured OpenAI chat model.
 * @param {Object} options
 * @param {Array<{role: string, content: string}>} options.messages - Chat messages for the completion call
 * @param {string} [options.model] - Override model name
 * @param {number} [options.temperature] - Sampling temperature
 * @param {number} [options.maxTokens] - Maximum number of tokens in the reply
 * @returns {Promise<string|null>} - Generated reply text or null if unavailable
 */
async function generateConversationalReply({
  messages,
  model = process.env.CONVERSATION_MODEL || 'gpt-4o-mini',
  temperature,
  maxTokens,
  signal
} = {}) {
  const envTemp = Number(process.env.CONVERSATION_TEMPERATURE);
  const envMaxTokens = Number(process.env.CONVERSATION_MAX_TOKENS);
  const forceNoThink = !['0', 'false', 'no', 'off'].includes(String(process.env.CONVERSATION_FORCE_NO_THINK || '1').toLowerCase());
  const safeTemperature = Number.isFinite(temperature)
    ? temperature
    : (Number.isFinite(envTemp) ? envTemp : 0.6);
  const safeMaxTokens = Number.isFinite(maxTokens) && maxTokens > 0
    ? Math.floor(maxTokens)
    : (Number.isFinite(envMaxTokens) && envMaxTokens > 0 ? Math.floor(envMaxTokens) : 320);
  const fallbackModel = process.env.CONVERSATION_MODEL_FALLBACK || process.env.OPENAI_CHAT_MODEL_FALLBACK || 'gpt-4o-mini';

  if (!Array.isArray(messages) || messages.length === 0) {
    console.warn('[AI] Conversational reply chamado sem mensagens.');
    return null;
  }

  const preparedMessages = normalizeConversationMessages(messages, { forceNoThink });

  const lastUserMessage = (() => {
    for (let i = preparedMessages.length - 1; i >= 0; i -= 1) {
      const role = String(preparedMessages[i]?.role || '').toLowerCase();
      if (role !== 'user') continue;
      return String(preparedMessages[i]?.content || '')
        .replace(/^\s*\/no_think\s+/i, '')
        .trim();
    }
    return '';
  })();

  const safeCompletionPrompt = [
    'Você é Lia, participante de grupo no WhatsApp.',
    'Responda em português brasileiro, natural e direto.',
    'Sem metadados, sem rótulos (ex: System/Assistant), sem pensar em voz alta.',
    'Se fizer lista, um item por linha.',
    `Pergunta: ${lastUserMessage || 'Sem pergunta explícita.'}`,
    'Resposta:'
  ].join('\n');

  const runSafeCompletionsFallback = async (client, targetModel, label = 'safe_completions') => {
    try {
      console.warn(`[AI][conversation] route=${label} reason_code=chat_empty_or_invalid`);
      const completionFallback = await executeWithAiRetry(
        () => client.completions.create({
          model: targetModel,
          prompt: safeCompletionPrompt,
          temperature: safeTemperature,
          max_tokens: safeMaxTokens,
          chat_template_kwargs: { enable_thinking: false },
          stop: ['\nUsuário:', '\nUser:', '\nSistema:', '\nSystem:'],
          signal
        }),
        { actionLabel: `resposta conversacional (${label})`, metricStage: 'ai_safe_fallback' }
      );

      const text = await finalizeConversationalOutput({
        client,
        model: targetModel,
        text: completionFallback?.choices?.[0]?.text || '',
        temperature: safeTemperature,
        maxTokens: safeMaxTokens
      });
      if (!text) return null;

      return text;
    } catch (fallbackError) {
      console.warn(`[AI] ${label} failed:`, fallbackError?.message || fallbackError);
      return null;
    }
  };

  const runCloudFallback = async (reasonCode = 'primary_failed') => {
    if (!conversationFallbackAi) {
      return null;
    }

    try {
      console.warn(`[AI][conversation] route=chat_fallback_openai reason_code=${reasonCode}`);
      const response = await executeWithAiRetry(
        () => conversationFallbackAi.chat.completions.create({
          model: fallbackModel,
          messages: preparedMessages,
          temperature: safeTemperature,
          max_tokens: safeMaxTokens,
          chat_template_kwargs: { enable_thinking: false },
          signal
        }),
        { actionLabel: 'resposta conversacional (fallback OpenAI)', metricStage: 'ai_cloud_fallback' }
      );

      const choice = await finalizeConversationalOutput({
        client: conversationFallbackAi,
        model: fallbackModel,
        text: response?.choices?.[0]?.message?.content || '',
        temperature: safeTemperature,
        maxTokens: safeMaxTokens
      });
      if (choice) {
        return choice;
      }

      return await runSafeCompletionsFallback(conversationFallbackAi, fallbackModel, 'safe_completions_openai_fallback');
    } catch (fallbackError) {
      console.error('[AI] Fallback OpenAI conversacional falhou:', fallbackError);
      return null;
    }
  };

  const isLikelyTruncatedOutput = (text = '', finishReason = '') => {
    const value = String(text || '').trim();
    if (!value) return true;
    if (String(finishReason || '').toLowerCase() === 'length') return true;

    if (!/[.!?…)]$/.test(value)) {
      const tail = (value.split(/\s+/).pop() || '').trim();
      if (tail.length > 0 && tail.length <= 3) return true;
    }
    return false;
  };

  try {
    if (!conversationAi) {
      console.warn('[AI] Conversational AI requested sem client configurado.');
      return await runCloudFallback('primary_client_unconfigured');
    }

    console.log('[AI][conversation] route=chat_completions reason_code=request');
    let response = await executeWithAiRetry(
      () => conversationAi.chat.completions.create({
        model,
        messages: preparedMessages,
        temperature: safeTemperature,
        max_tokens: safeMaxTokens,
        chat_template_kwargs: { enable_thinking: false },
        signal
      }),
      { actionLabel: 'resposta conversacional', metricStage: 'ai_primary' }
    );

    let choiceRaw = response?.choices?.[0]?.message?.content || '';
    let finishReason = response?.choices?.[0]?.finish_reason || '';

    if (isLikelyTruncatedOutput(choiceRaw, finishReason)) {
      const boostedMaxTokens = Math.min(Math.max(safeMaxTokens * 2, safeMaxTokens + 120), 1200);
      try {
        console.warn(`[AI][conversation] detected_truncation retrying_with_more_tokens from=${safeMaxTokens} to=${boostedMaxTokens} finish_reason=${finishReason || 'unknown'}`);
        response = await executeWithAiRetry(
          () => conversationAi.chat.completions.create({
            model,
            messages: preparedMessages,
            temperature: safeTemperature,
            max_tokens: boostedMaxTokens,
            chat_template_kwargs: { enable_thinking: false },
            signal
          }),
          { actionLabel: 'resposta conversacional (retry por truncamento)', metricStage: 'ai_retry_truncation' }
        );
        choiceRaw = response?.choices?.[0]?.message?.content || choiceRaw;
      } catch (retryErr) {
        console.warn('[AI][conversation] truncation retry failed:', retryErr?.message || retryErr);
      }
    }

    const choice = await finalizeConversationalOutput({
      client: conversationAi,
      model,
      text: choiceRaw,
      temperature: safeTemperature,
      maxTokens: safeMaxTokens
    });
    if (choice && !hasAbruptConversationalEnding(choice)) {
      return choice;
    }

    if (choice && hasAbruptConversationalEnding(choice)) {
      const repairedMaxTokens = Math.min(Math.max(safeMaxTokens + 180, 320), 1200);
      try {
        console.warn(`[AI][conversation] abrupt_tail_detected retrying_with_more_tokens from=${safeMaxTokens} to=${repairedMaxTokens}`);
        const continuityRetry = await executeWithAiRetry(
          () => conversationAi.chat.completions.create({
            model,
            messages: preparedMessages,
            temperature: safeTemperature,
            max_tokens: repairedMaxTokens,
            chat_template_kwargs: { enable_thinking: false },
            signal
          }),
          { actionLabel: 'resposta conversacional (retry por final abrupto)', metricStage: 'ai_retry_abrupt_tail' }
        );

        const continuityChoice = await finalizeConversationalOutput({
          client: conversationAi,
          model,
          text: continuityRetry?.choices?.[0]?.message?.content || '',
          temperature: safeTemperature,
          maxTokens: repairedMaxTokens
        });

        if (continuityChoice && !hasAbruptConversationalEnding(continuityChoice)) {
          return continuityChoice;
        }
      } catch (continuityErr) {
        console.warn('[AI][conversation] abrupt-tail retry failed:', continuityErr?.message || continuityErr);
      }
    }

    console.warn('[AI][conversation] route=safe_completions reason_code=empty_chat_choice');
    const primarySafeFallback = await runSafeCompletionsFallback(conversationAi, model, 'safe_completions');
    if (primarySafeFallback) {
      return primarySafeFallback;
    }

    return await runCloudFallback('primary_empty_after_safe_fallback');
  } catch (error) {
    if (signal?.aborted) return null;
    const reasonCode = inferReasonCodeFromError(error);
    console.error(`[AI][conversation] route=chat_completions reason_code=${reasonCode}`, error);

    // Secondary path for providers that intermittently fail chat.completions (HTTP 500).
    try {
      const completionFallback = await executeWithAiRetry(
        () => conversationAi.completions.create({
          model,
          prompt: safeCompletionPrompt,
          temperature: safeTemperature,
          max_tokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.floor(maxTokens) : 220,
          chat_template_kwargs: { enable_thinking: false },
          stop: ['\nUsuário:', '\nUser:', '\nSistema:', '\nSystem:'],
          signal
        }),
        { actionLabel: 'resposta conversacional (fallback de exceção completions)', metricStage: 'ai_exception_fallback' }
      );

      const text = await finalizeConversationalOutput({
        client: conversationAi,
        model,
        text: completionFallback?.choices?.[0]?.text || '',
        temperature: safeTemperature,
        maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.floor(maxTokens) : 220
      });
      if (text) {
        return text;
      }
    } catch (fallbackError) {
      console.error('[AI] Fallback de exceção conversacional falhou:', fallbackError);
    }

    return await runCloudFallback(reasonCode || 'primary_exception');
  }
}

async function extractMemoryFactsFromText({
  text,
  recentMessages = [],
  senderName,
  groupName,
  model = process.env.MEMORY_FACT_MODEL || 'gpt-4o-mini',
  maxFacts = 5
} = {}) {
  try {
    if (!openai) {
      return [];
    }

    const cleanText = String(text || '').trim();
    if (!cleanText) {
      return [];
    }

    const safeMaxFacts = Number.isFinite(Number(maxFacts))
      ? Math.min(Math.max(Math.floor(Number(maxFacts)), 1), 8)
      : 5;
    const history = Array.isArray(recentMessages)
      ? recentMessages.map((entry) => String(entry || '').trim()).filter(Boolean).slice(-8)
      : [];

    const response = await executeWithAiRetry(
      () => openai.chat.completions.create({
        model,
        temperature: 0.1,
        max_tokens: 300,
        chat_template_kwargs: { enable_thinking: false },
        messages: [
          {
            role: 'system',
            content:
              'Extraia memórias úteis da própria pessoa em uma conversa informal de grupo. ' +
              'Ignore saudações, perguntas vazias, ironia fraca e fatos sobre terceiros. ' +
              'Classifique cada memória com layer explicit, inferred ou speculative. ' +
              'Mapeie explicit para memoryType confirmed; inferred para softSignal; speculative para provisional. ' +
              'Converta cada fato em uma frase curta em português, na terceira pessoa, pronta para memória persistente. ' +
              'Responda estritamente em JSON no formato {"facts":[{"fact":"...","category":"...","confidence":0.0,"layer":"...","memoryType":"...","evidenceCount":1}]}. ' +
              'Use confidence entre 0 e 1. Retorne facts vazio se não houver nada útil.'
          },
          {
            role: 'user',
            content:
              `Nome do remetente: ${senderName || 'desconhecido'}\n` +
              `Grupo: ${groupName || 'desconhecido'}\n` +
              `Máximo de fatos: ${safeMaxFacts}\n` +
              `Mensagens recentes do grupo:\n- ${history.join('\n- ') || 'sem histórico'}\n` +
              `Mensagem: ${cleanText}`
          }
        ]
      }),
      { actionLabel: 'extração de fatos de memória' }
    );

    const raw = response?.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      return [];
    }

    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const jsonText = start >= 0 && end >= start ? raw.slice(start, end + 1) : raw;
    const parsed = JSON.parse(jsonText);
    const facts = Array.isArray(parsed?.facts) ? parsed.facts : [];

    return facts
      .map((entry) => ({
        fact: String(entry?.fact || '').trim(),
        category: String(entry?.category || 'general').trim() || 'general',
        confidence: Number(entry?.confidence),
        layer: String(entry?.layer || '').trim(),
        memoryType: String(entry?.memoryType || '').trim(),
        evidenceCount: Number(entry?.evidenceCount)
      }))
      .filter((entry) => entry.fact)
      .map((entry) => ({
        ...entry,
        confidence: Number.isFinite(entry.confidence)
          ? Math.min(Math.max(entry.confidence, 0), 1)
          : 0.65,
        evidenceCount: Number.isFinite(entry.evidenceCount) && entry.evidenceCount > 0
          ? Math.floor(entry.evidenceCount)
          : 1
      }))
      .slice(0, safeMaxFacts);
  } catch (error) {
    console.warn('[AI] Erro ao extrair fatos de memória:', error?.message || error);
    return [];
  }
}

async function extractRunningJokeFromText({
  text,
  recentMessages = [],
  senderName,
  groupName,
  model = process.env.MEMORY_FACT_MODEL || 'gpt-4o-mini'
} = {}) {
  try {
    if (!openai) {
      return null;
    }

    const cleanText = String(text || '').trim();
    if (!cleanText) {
      return null;
    }

    const history = Array.isArray(recentMessages)
      ? recentMessages.map((entry) => String(entry || '').trim()).filter(Boolean).slice(-8)
      : [];

    const response = await executeWithAiRetry(
      () => openai.chat.completions.create({
        model,
        temperature: 0.1,
        max_tokens: 220,
        messages: [
          {
            role: 'system',
            content:
              'Analise uma mensagem recente de grupo e um pequeno histórico. ' +
              'Identifique apenas piadas internas/apelidos coletivos já recorrentes ou explicitamente propostos para alguém/coisa do grupo. ' +
              'Ignore brincadeiras isoladas, zoeira sem recorrência, ofensas e conteúdo ambíguo. ' +
              'Responda estritamente em JSON no formato {"runningJoke":{"name":"...","origin":"...","context":"...","confidence":0.0}} ou {"runningJoke":null}.'
          },
          {
            role: 'user',
            content:
              `Grupo: ${groupName || 'desconhecido'}\n` +
              `Remetente: ${senderName || 'desconhecido'}\n` +
              `Histórico recente:\n- ${history.join('\n- ') || 'sem histórico'}\n` +
              `Mensagem atual: ${cleanText}`
          }
        ]
      }),
      { actionLabel: 'extração de piada interna' }
    );

    const raw = response?.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      return null;
    }

    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const jsonText = start >= 0 && end >= start ? raw.slice(start, end + 1) : raw;
    const parsed = JSON.parse(jsonText);
    const joke = parsed?.runningJoke;
    if (!joke || typeof joke !== 'object') {
      return null;
    }

    const normalized = {
      name: String(joke.name || '').trim(),
      origin: String(joke.origin || '').trim(),
      context: String(joke.context || '').trim(),
      confidence: Number(joke.confidence)
    };

    if (!normalized.name || !normalized.context) {
      return null;
    }

    normalized.confidence = Number.isFinite(normalized.confidence)
      ? Math.min(Math.max(normalized.confidence, 0), 1)
      : 0.75;

    return normalized;
  } catch (error) {
    console.warn('[AI] Erro ao extrair piada interna:', error?.message || error);
    return null;
  }
}
module.exports = {
  getAiAnnotations,
  getAiAnnotationsForGif,
  getAiAnnotationsFromPrompt,
  getTagsFromTextPrompt,
  transcribeAudioBuffer,
  transcribeAudioFile,
  isAiAvailable,
  generateConversationalReply,
  extractMemoryFactsFromText,
  extractRunningJokeFromText,
  normalizeConversationMessages
};
