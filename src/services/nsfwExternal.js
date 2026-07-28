const axios = require('axios');
const OpenAI = require('openai');
const sharp = require('sharp');

const PROVIDERS = (process.env.NSFW_EXTERNAL_PROVIDER || 'huggingface,openai')
  .split(',')
  .map(p => p.trim().toLowerCase())
  .filter(Boolean);
const DEBUG = process.env.DEBUG_NSFW_EXTERNAL === '1';

function logDebug(...args) {
  if (DEBUG) {
    console.log('[NSFW External]', ...args);
  }
}

function normalizeScore(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function flattenPredictionPayload(payload, acc = []) {
  if (!payload) return acc;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      flattenPredictionPayload(item, acc);
    }
    return acc;
  }
  if (payload && typeof payload === 'object' && payload.label !== undefined) {
    acc.push(payload);
  }
  return acc;
}

function matchLabel(label = '') {
  const clean = String(label).toLowerCase();
  return clean.replace(/[^a-z0-9]+/g, ' ').trim();
}

const DEFAULT_NSF_W_LABELS = ['nsfw', 'porn', 'pornography', 'sexual', 'sexy', 'explicit', 'hentai'];
const DEFAULT_SAFE_LABELS = ['neutral', 'safe', 'sfw', 'drawing', 'hentai_safe'];

let openaiClient = null;

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_MODERATION_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

async function classifyWithHuggingFace(buffer, { mimeType, _retry = false } = {}) {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) return null;

  const modelId = process.env.HUGGINGFACE_NSFWMODEL || 'Falconsai/nsfw_image_detection';
  const baseUrl = process.env.HUGGINGFACE_API_BASE || 'https://api-inference.huggingface.co/models';
  const minScore = normalizeScore(process.env.NSFW_EXTERNAL_MIN_SCORE, 0.6);
  const safeMinScore = normalizeScore(process.env.NSFW_EXTERNAL_SAFE_SCORE, 0.55);
  const timeout = parseInt(process.env.NSFW_EXTERNAL_TIMEOUT || process.env.HUGGINGFACE_TIMEOUT || '10000', 10);
  const url = `${baseUrl.replace(/\/?$/, '')}/${encodeURIComponent(modelId)}`;

  try {
    const response = await axios.post(url, buffer, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/octet-stream',
        ...(mimeType ? { 'X-Image-Mime-Type': mimeType } : {})
      },
      timeout
    });

    const data = response.data;
    if (data && data.error) {
      logDebug('API response error:', data.error);
      return null;
    }

    const flat = flattenPredictionPayload(data);
    if (!flat.length) {
      logDebug('No predictions received from HuggingFace');
      return null;
    }

    let topNsfw = { score: 0, label: null };
    let topSafe = { score: 0, label: null };

    for (const prediction of flat) {
      const value = normalizeScore(prediction.score);
      const normLabel = matchLabel(prediction.label);
      if (!normLabel) continue;

      if (DEFAULT_NSF_W_LABELS.some(keyword => normLabel.includes(keyword))) {
        if (value > topNsfw.score) {
          topNsfw = { score: value, label: prediction.label };
        }
      }

      if (DEFAULT_SAFE_LABELS.some(keyword => normLabel.includes(keyword))) {
        if (value > topSafe.score) {
          topSafe = { score: value, label: prediction.label };
        }
      }
    }

    if (topNsfw.label && topNsfw.score >= minScore) {
      logDebug('Flagged image as NSFW via HuggingFace', topNsfw);
      return {
        nsfw: true,
        confidence: topNsfw.score,
        label: topNsfw.label,
        provider: 'huggingface',
        raw: data
      };
    }

    if (topSafe.label && topSafe.score >= safeMinScore) {
      logDebug('Image classified as safe via HuggingFace', topSafe);
      return {
        nsfw: false,
        confidence: topSafe.score,
        label: topSafe.label,
        provider: 'huggingface',
        raw: data
      };
    }

    logDebug('HuggingFace returned predictions but none met thresholds', { topNsfw, topSafe });
    return null;
  } catch (error) {
    if (error.response && error.response.data && error.response.data.error) {
      const apiError = error.response.data.error;
      logDebug('HuggingFace error:', apiError);
      if (typeof apiError === 'string' && apiError.includes('currently loading')) {
        const etaSeconds = Number(error.response.data.estimated_time);
        if (!_retry) {
          if (Number.isFinite(etaSeconds) && etaSeconds > 0 && etaSeconds <= 15) {
            await new Promise(resolve => setTimeout(resolve, etaSeconds * 1000));
            return classifyWithHuggingFace(buffer, { mimeType, _retry: true });
          }
        }
      }
    } else {
      logDebug('HuggingFace request failed:', error.message);
    }
    return null;
  }
}

async function classifyWithOpenAI(buffer, { mimeType } = {}) {
  const client = getOpenAIClient();
  if (!client) return null;

  const moderationModel = process.env.OPENAI_MODERATION_MODEL || 'omni-moderation-latest';
  const minScore = normalizeScore(process.env.NSFW_OPENAI_MIN_SCORE, 0.2);
  const mediaMime = mimeType && typeof mimeType === 'string' ? mimeType : 'image/jpeg';

  try {
    const payload = [
      {
        type: 'input_image',
        image_url: `data:${mediaMime};base64,${buffer.toString('base64')}`
      }
    ];

    const response = await client.moderations.create({
      model: moderationModel,
      input: payload
    });

    const result = Array.isArray(response.results) ? response.results[0] : null;
    if (!result) {
      logDebug('OpenAI moderation returned no results');
      return null;
    }

    const scores = result.category_scores || {};
    const entries = Object.entries(scores);
    const sorted = entries.sort((a, b) => (normalizeScore(b[1]) - normalizeScore(a[1])));
    const [topLabel = '', topScore = 0] = sorted[0] || [];

    const sexualScore = Math.max(
      normalizeScore(scores['sexual']),
      normalizeScore(scores['sexual/minors']),
      normalizeScore(scores['sexual/erotic'])
    );

    const flagged = Boolean(result.flagged) || sexualScore >= minScore;

    if (!flagged) {
      return {
        nsfw: false,
        confidence: normalizeScore(topScore),
        label: topLabel || 'safe',
        provider: 'openai',
        raw: response
      };
    }

    return {
      nsfw: true,
      confidence: Math.max(normalizeScore(topScore), sexualScore),
      label: topLabel || 'sexual',
      provider: 'openai',
      raw: response
    };
  } catch (error) {
    logDebug('OpenAI moderation error:', error?.message || error);
    return null;
  }
}


let gemmaClient = null;

function getGemmaClient() {
  if (!gemmaClient) {
    const baseURL = process.env.GEMMA_NSFW_BASE_URL || process.env.OPENAI_MULTIMODAL_BASE_URL || '';
    const options = { apiKey: process.env.GEMMA_NSFW_API_KEY || 'not-required' };
    if (baseURL) options.baseURL = baseURL;
    gemmaClient = new OpenAI(options);
  }
  return gemmaClient;
}

function parseGemmaModeration(content) {
  const raw = String(content || '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    const decision = String(parsed.decision || parsed.classification || parsed.category || '').trim().toLowerCase();
    const confidence = Math.max(0, Math.min(1, normalizeScore(parsed.confidence, 0)));
    if (!decision || !Number.isFinite(confidence)) return null;
    return { decision, confidence, reason: String(parsed.reason || '').slice(0, 160) };
  } catch {
    return null;
  }
}

async function classifyWithGemma(buffer) {
  if (!buffer || buffer.length === 0) return null;
  const client = getGemmaClient();
  const model = process.env.GEMMA_NSFW_MODEL || process.env.OPENAI_MULTIMODAL_MODEL;
  if (!model) {
    logDebug('Gemma NSFW model is not configured');
    return null;
  }
  const minConfidence = normalizeScore(process.env.NSFW_GEMMA_MIN_CONFIDENCE, 0.65);
  try {
    const png = await sharp(buffer).resize(512, 512, { fit: 'inside' }).png().toBuffer();
    const response = await client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 128,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        {
          role: 'system',
          content: 'Você é um classificador de segurança de imagens. Não descreva a imagem e não mostre raciocínio. Classifique somente conteúdo sexual explícito, pornografia, nudez sexualizada ou exploração sexual de menores. Não marque como NSFW pessoas vestidas, trajes de banho comuns, arte não sexual, memes, violência não sexual ou contexto médico. Responda SOMENTE JSON válido no formato {"decision":"safe|nsfw|uncertain","confidence":0.0,"reason":"texto curto"}.'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Classifique esta imagem. Se houver qualquer dúvida real, use decision="uncertain".' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,' + png.toString('base64') } }
          ]
        }
      ]
    });
    const parsed = parseGemmaModeration(response?.choices?.[0]?.message?.content);
    if (!parsed || parsed.decision === 'uncertain') {
      logDebug('Gemma NSFW returned no decisive classification', parsed);
      return null;
    }
    const explicit = ['nsfw', 'sexual', 'explicit', 'porn', 'pornography', 'hentai', 'sexual_minors'].some(x => parsed.decision.includes(x));
    const safe = ['safe', 'sfw', 'non_nsfw'].includes(parsed.decision);
    if (!explicit && !safe) return null;
    const sexualMinors = parsed.decision.includes('sexual_minors');
    if (explicit && !sexualMinors && parsed.confidence < minConfidence) {
      logDebug('Gemma NSFW confidence below threshold; delegating to fallback', parsed);
      return null;
    }
    const flagged = explicit && (sexualMinors || parsed.confidence >= minConfidence);
    return {
      nsfw: flagged,
      confidence: parsed.confidence,
      label: explicit ? parsed.decision : 'safe',
      provider: 'gemma',
      raw: { decision: parsed.decision, confidence: parsed.confidence, reason: parsed.reason }
    };
  } catch (error) {
    logDebug('Gemma NSFW request failed:', error?.message || error);
    return null;
  }
}

async function classifyImage(buffer, options = {}) {
  if (!buffer || buffer.length === 0) return null;

  for (const provider of PROVIDERS) {
    if (provider === 'huggingface') {
      const result = await classifyWithHuggingFace(buffer, options);
      if (result) return result;
    } else if (provider === 'gemma') {
      const result = await classifyWithGemma(buffer);
      if (result) return result;
    } else if (provider === 'openai') {
      const result = await classifyWithOpenAI(buffer, options);
      if (result) return result;
    }
  }
  return null;
}

function isExternalModerationEnabled() {
  return PROVIDERS.some(provider => {
    if (provider === 'huggingface') {
      return Boolean(process.env.HUGGINGFACE_API_KEY);
    }
    if (provider === 'gemma') {
      return Boolean(process.env.GEMMA_NSFW_MODEL || process.env.OPENAI_MULTIMODAL_MODEL);
    }
    if (provider === 'openai') {
      return Boolean(process.env.OPENAI_MODERATION_API_KEY || process.env.OPENAI_API_KEY);
    }
    return false;
  });
}

module.exports = {
  classifyImage,
  isExternalModerationEnabled
};
