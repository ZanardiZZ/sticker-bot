require('dotenv').config();
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
} else {
  console.warn('[AI] OpenAI API key not configured. AI features will be disabled.');
}

/**
 * Chama a OpenAI com prompt textual customizado, retorna descrição e tags.
 * @param {string} prompt Texto do prompt a enviar.
 * @returns {Promise<{description: string|null, tags: string[]|null}>}
 */

async function transcribeAudioBuffer(buffer) {
  try {
    if (!openai) {
      console.warn('[AI] OpenAI API key not configured. Audio transcription not available.');
      return 'Áudio não transcrito - OpenAI API key não configurada.';
    }

    // Create a temporary file for the audio buffer (OpenAI API requires a file stream, not just a file)
    const tmpDir = path.resolve(__dirname, '../tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const tmpFile = path.join(tmpDir, `audio-${Date.now()}.wav`);
    
    try {
      fs.writeFileSync(tmpFile, buffer);

      // Use OpenAI Whisper API for transcription
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tmpFile),
        model: 'whisper-1',
        language: 'pt', // Portuguese
        response_format: 'text'
      });

      const transcript = transcription.trim();
      return transcript || 'Áudio sem conteúdo transcrito.';

    } catch (apiError) {
      console.warn('[AI] Erro ao transcrever áudio com OpenAI:', apiError.message);
      return 'Áudio não transcrito - erro na API OpenAI.';
    } finally {
      // Clean up temporary file
      try {
        if (fs.existsSync(tmpFile)) {
          fs.unlinkSync(tmpFile);
        }
      } catch (cleanupErr) {
        console.warn('[AI] Erro ao limpar arquivo temporário:', cleanupErr.message);
      }
    }
  } catch (error) {
    console.warn('[AI] Erro geral na transcrição de áudio:', error.message);
    return 'Áudio não transcrito - erro geral.';
  }
}

async function getTagsFromTextPrompt(prompt) {
  try {
    if (!openai) {
      console.warn('[AI] OpenAI not configured, skipping tag generation');
      return { description: null, tags: null };
    }
    
    const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: prompt }],
  temperature: 0.3,
  max_tokens: 200,
});

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
    const VISION_MODEL = 'gpt-4o-mini';

    const webpBuffer = await sharp(buffer)
      .resize(512, 512, { fit: 'inside' })
      .webp({ quality: 85 })
      .toBuffer();
    const b64 = webpBuffer.toString('base64');

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
        `Você gera descrições curtas para imagens e CINCO hashtags únicas. ` +
        `Responda ESTRITAMENTE em JSON: {"description":"...","tags":["#...",...] } ` +
        `A descrição ≤${DESC_MAX} chars. Hashtags começam com #.`
      },
      { role: 'user', content: [
          { type: 'text', text: `Descreva a imagem (≤${DESC_MAX} chars) e dê CINCO hashtags.` },
          { type: 'image_url', image_url: { url: `data:image/webp;base64,${b64}` } }
        ]
      }
    ];

    const resp = await openai.chat.completions.create({
      model: VISION_MODEL,
      max_tokens: 300,
      temperature: 0.4,
      messages
    });

    const raw = resp.choices[0].message.content;
    try {
      const parsed = JSON.parse(cleanJsonBlock(raw));
      let description = String(parsed.description || '').trim();
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
        tags
      };
    } catch {
      const description = String(raw || '')
        .replace(/#[^\s#]+/gu, '')
        .trim()
        .slice(0, DESC_MAX) || 'Sem descrição.';
      const tags = pickHashtags(raw, 5);
      return { description, tags };
    }
  } catch (err) {
    console.error('❌ Erro na IA (imagem):', err);
    throw new Error('Erro na IA ao gerar descrição de imagem');
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
    const VISION_MODEL = 'gpt-4o-mini';

    const webpBuffer = await sharp(buffer)
      .resize(512, 512, { fit: 'inside' })
      .webp({ quality: 85 })
      .toBuffer();
    const b64 = webpBuffer.toString('base64');

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
        `Você analisa frames de GIFs/memes e gera descrições curtas e CINCO hashtags únicas. ` +
        `IMPORTANTE: Isto é um frame de um GIF/meme, NÃO um vídeo. Use termos como "cena", "imagem", "frame", "meme" ao invés de "vídeo", "filmagem" ou "gravação". ` +
        `Responda ESTRITAMENTE em JSON: {"description":"...","tags":["#...",...] } ` +
        `A descrição ≤${DESC_MAX} chars. Hashtags começam com #.`
      },
      { role: 'user', content: [
          { type: 'text', text: `Analise este frame de GIF/meme (≤${DESC_MAX} chars) e dê CINCO hashtags. Foque na ação, expressão ou situação mostrada.` },
          { type: 'image_url', image_url: { url: `data:image/webp;base64,${b64}` } }
        ]
      }
    ];

    const resp = await openai.chat.completions.create({
      model: VISION_MODEL,
      max_tokens: 300,
      temperature: 0.4,
      messages
    });

    const raw = resp.choices[0].message.content;
    try {
      const parsed = JSON.parse(cleanJsonBlock(raw));
      let description = String(parsed.description || '').trim();
      let tags = Array.isArray(parsed.tags) ? parsed.tags.map(t => t.trim()) : [];
      if (tags.length < 5) {
        // Completa com hashtags geradas via pickHashtags para totalizar 5
        const extraTags = pickHashtags(description, 5 - tags.length);
        tags = tags.concat(extraTags).slice(0, 5);
      } else if (tags.length > 5) {
        tags = tags.slice(0, 5);
      }
      if (tags.length === 0) tags = ['#gif'];
      return {
        description: description.slice(0, DESC_MAX) || 'Sem descrição.',
        tags
      };
    } catch {
      const description = String(raw || '')
        .replace(/#[^\s#]+/gu, '')
        .trim()
        .slice(0, DESC_MAX) || 'Sem descrição.';
      const tags = pickHashtags(raw, 5);
      return { description, tags };
    }
  } catch (err) {
    console.error('❌ Erro na IA (GIF frame):', err);
    throw new Error('Erro na IA ao gerar descrição de frame de GIF');
  }
}

async function getAiAnnotationsFromPrompt(prompt) {
  try {
    if (!openai) {
      console.warn('[AI] OpenAI not configured, skipping prompt annotation generation');
      return { description: null, tags: null };
    }
    
    const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: prompt }],
  temperature: 0.3,
  max_tokens: 200,
});

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
module.exports = {
  getAiAnnotations,
  getAiAnnotationsForGif,
  getAiAnnotationsFromPrompt,
  getTagsFromTextPrompt,
  transcribeAudioBuffer // mantenha se já tiver implementado
};
