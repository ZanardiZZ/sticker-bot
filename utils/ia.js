// utils/ia.js
require('dotenv').config();
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const sharp = require('sharp');
const { OpenAI } = require('openai');
const { encoding_for_model } = require('tiktoken');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const tokenizer = encoding_for_model('gpt-3.5-turbo');

const VISION_MODEL  = process.env.AI_MODEL_VISION  || 'gpt-4o-mini';
const SUMMARY_MODEL = process.env.AI_MODEL_SUMMARY || 'gpt-3.5-turbo';
const DESC_MAX = parseInt(process.env.AI_DESC_MAX || '240', 10);

let tokensWindowStart = Date.now();
let tokensUsed = 0;
const TPM_LIMIT = 30000;

function countTokens(text) {
  return tokenizer.encode(text).length;
}

async function callOpenAI(payload, estTokens) {
  while (Date.now() - tokensWindowStart < 60000 &&
         tokensUsed + estTokens > TPM_LIMIT) {
    await new Promise(r => setTimeout(r, 500));
  }
  if (Date.now() - tokensWindowStart >= 60000) {
    tokensWindowStart = Date.now();
    tokensUsed = 0;
  }
  tokensUsed += estTokens;
  return openai.chat.completions.create(payload);
}

function chunkByTokens(text, maxTokens = 4000) {
  const words = text.split(/\s+/);
  const chunks = [];
  let current = [];
  let sum = 0;
  for (const w of words) {
    const len = countTokens(w);
    if (sum + len > maxTokens) {
      chunks.push(current.join(' '));
      current = [w];
      sum = len;
    } else {
      current.push(w);
      sum += len;
    }
  }
  if (current.length) chunks.push(current.join(' '));
  return chunks;
}

function cleanJsonBlock(str) {
  return String(str || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function pickHashtag(text) {
  const m = String(text || '').match(/#([\p{L}\p{M}\p{N}_-]{2,64})/u);
  return m ? `#${m[1]}` : '#gerado';
}

async function gerarDescricaoETag(buffer) {
  try {
    const webpBuffer = await sharp(buffer)
      .resize(512, 512, { fit: 'inside' })
      .webp({ quality: 85 })
      .toBuffer();
    const b64 = webpBuffer.toString('base64');

    const messages = [
      { role: 'system', content:
        `Você gera descrições curtas para imagens e UMA hashtag. ` +
        `Responda ESTRITAMENTE em JSON: {"description":"...","tag":"#..."} ` +
        `A descrição ≤${DESC_MAX} chars. A hashtag começa com #.`
      },
      { role: 'user', content: [
          { type: 'text', text: `Descreva a imagem (≤${DESC_MAX} chars) e dê UMA hashtag.` },
          { type: 'image_url', image_url: { url: `data:image/webp;base64,${b64}` } }
        ]
      }
    ];

    const resp = await callOpenAI({
      model: VISION_MODEL,
      max_tokens: 160,
      temperature: 0.4,
      messages
    }, 500);

    const raw = resp.choices[0].message.content;
    try {
      const parsed = JSON.parse(cleanJsonBlock(raw));
      let description = String(parsed.description || '').trim();
      let tag = String(parsed.tag || '').trim();
      if (tag && !tag.startsWith('#')) tag = `#${tag}`;
      return {
        description: description.slice(0, DESC_MAX) || 'Sem descrição.',
        tag: tag || pickHashtag(description)
      };
    } catch {
      const description = String(raw || '')
        .replace(/#[^\s#]+/gu, '')
        .trim()
        .slice(0, DESC_MAX) || 'Sem descrição.';
      const tag = pickHashtag(raw);
      return { description, tag };
    }
  } catch (err) {
    console.error('❌ Erro na IA (imagem):', err);
    throw new Error('Erro na IA ao gerar descrição de imagem');
  }
}

async function extractAudio(videoPath, wavPath) {
  await new Promise((res, rej) => {
    execFile('ffmpeg', ['-y', '-i', videoPath, '-vn', '-ac', '1', '-ar', '16000', wavPath], err => err ? rej(err) : res());
  });
}

async function transcribeAudio(wavPath) {
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(wavPath),
    model: 'whisper-1',
    response_format: 'text'
  });
  return transcription;
}

async function summarizeBlocks(blocks) {
  const summ = [];
  for (const block of blocks) {
    const resp = await callOpenAI({
      model: SUMMARY_MODEL,
      max_tokens: 256,
      temperature: 0.3,
      messages: [
        { role: 'system', content: 'Resuma em ≤4 linhas.' },
        { role: 'user', content: block }
      ]
    }, 300);
    summ.push(resp.choices[0].message.content.trim());
  }
  return summ.join('\n');
}

async function hasAudioStream(videoPath) {
  try {
    const out = await new Promise((res, rej) => {
      execFile('ffprobe', [
        '-v', 'error',
        '-select_streams', 'a',
        '-show_entries', 'stream=index',
        '-of', 'json',
        videoPath
      ], (err, stdout) => err ? rej(err) : res(stdout));
    });
    const json = JSON.parse(out);
    return Array.isArray(json.streams) && json.streams.length > 0;
  } catch {
    return false;
  }
}

async function gerarDescricaoVideo(videoPath) {
  const tmpDir  = await fsp.mkdtemp(path.join(os.tmpdir(), 'vidproc-'));
  const wavPath = path.join(tmpDir, 'audio.wav');

  try {
    // 1) Só extrai áudio se existir stream de áudio
    let transcript = '';
    if (await hasAudioStream(videoPath)) {
      await extractAudio(videoPath, wavPath);           // sua função existente
      transcript = await transcribeAudio(wavPath);       // sua função existente
    } else {
      console.warn('⚠️ Vídeo sem áudio detectado – pulando transcrição.');
    }

    // 2) Gera resumo (ou mensagem padrão)
    const blocks = transcript
      ? chunkByTokens(transcript, 4000)
      : [];
    const resumo = blocks.length
      ? await summarizeBlocks(blocks)
      : 'Sem áudio para resumir';

    // 3) Metadados de tamanho
    const { size } = fs.statSync(videoPath);
    const metaText = `Tamanho ${(size / 1048576).toFixed(1)} MB`;

    // 4) Captura keyframes
    const framePattern = path.join(tmpDir, 'frame_%02d.webp');
    await new Promise((res, rej) => {
      execFile('ffmpeg', [
        '-i', videoPath,
        '-vf', "select=not(mod(n\\,120)),scale=512:-1",
        '-frames:v', '8',
        framePattern,
        '-vsync', 'vfr',
        '-q:v', '80'
      ], err => err ? rej(err) : res());
    });
    const files = await fsp.readdir(tmpDir);
    const keyframes = await Promise.all(
      files.filter(f => f.endsWith('.webp'))
           .sort()
           .map(f => fsp.readFile(path.join(tmpDir, f)))
    );
    const b64Frames = keyframes.map(buf => buf.toString('base64'));

    // 5) Monta payload para a IA
    const visionContent = [
      { type: 'text', text: `Transcrição resumida:\n${resumo}\n${metaText}` },
      ...b64Frames.map(b64 => ({
        type: 'image_url',
        image_url: { url: `data:image/webp;base64,${b64}` }
      }))
    ];
    const msgPayload = [
      {
        role: 'system',
        content:
          `Você é um gerador de legenda. Retorne **somente** um JSON com dois campos:\n` +
          `- "description": frase única de até ${DESC_MAX} caracteres\n` +
          `- "tag": hashtag iniciando em "#" (ex: "#exemplo")\n` +
          `Formato de saída: {"description":"…","tag":"#…"}`
      },
      { role: 'user', content: visionContent }
    ];
    const estTok = 300 + b64Frames.length * 85 + 300;

    // 6) Chama o OpenAI
    const resp2 = await callOpenAI({
      model: VISION_MODEL,
      max_tokens: 180,
      temperature: 0.4,
      messages: msgPayload
    }, estTok);

    const raw2 = resp2.choices[0].message.content;
    try {
      const parsed2 = JSON.parse(cleanJsonBlock(raw2));
      let description2 = String(parsed2.description || '').trim();
      let tag2         = String(parsed2.tag || '').trim();
      if (tag2 && !tag2.startsWith('#')) tag2 = `#${tag2}`;
      return {
        description: description2.slice(0, DESC_MAX) || 'Sem descrição.',
        tag:         tag2 || pickHashtag(description2)
      };
    } catch {
      const description3 = String(raw2 || '')
        .replace(/#[^\s#]+/gu, '')
        .trim()
        .slice(0, DESC_MAX) || 'Sem descrição.';
      const tag3 = pickHashtag(raw2);
      return { description: description3, tag: tag3 };
    }

  } catch (err) {
    console.error('❌ Erro na IA (vídeo):', err);
    throw new Error('Erro na IA ao gerar descrição de vídeo');
  } finally {
    // limpa temporários
    try { await fsp.rm(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

module.exports = {
  gerarDescricaoETag,
  gerarDescricaoVideo
};
