require('dotenv').config();
const { Configuration, OpenAIApi } = require('openai');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

/**
 * Chama a OpenAI com prompt textual customizado, retorna descrição e tags.
 * @param {string} prompt Texto do prompt a enviar.
 * @returns {Promise<{description: string|null, tags: string[]|null}>}
 */

async function transcribeAudioBuffer(buffer) {
  // Salva temporariamente o áudio em arquivo wav (whisper.cpp aceita wav)
  const tmpDir = path.resolve(__dirname, '../tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const tmpFile = path.join(tmpDir, `audio-${Date.now()}.wav`);
  fs.writeFileSync(tmpFile, buffer);

  return new Promise((resolve, reject) => {
    const whisperPath = path.resolve(__dirname, '../whisper.cpp/build/whisper');
    const modelPath = path.resolve(__dirname, '../whisper.cpp/build/models/ggml-base.bin');

    if (!fs.existsSync(whisperPath)) {
      return reject(new Error('whisper.cpp não encontrado. Execute setup-whisper.sh para compilar.'));
    }
    if (!fs.existsSync(modelPath)) {
      return reject(new Error('Modelo whisper não encontrado. Execute setup-whisper.sh para baixar.'));
    }

    // Executa o comando whisper para transcrever
    const result = spawnSync(whisperPath, [
      '-m', modelPath,
      '-f', tmpFile,
      '--language', 'pt',
      '--task', 'transcribe',
      '--threads', '2',
      '--no-translate',
      '--output-txt',
      '--output-dir', tmpDir
    ], { encoding: 'utf-8' });

    if (result.error) {
      fs.unlinkSync(tmpFile);
      return reject(result.error);
    }
    if (result.status !== 0) {
      fs.unlinkSync(tmpFile);
      return reject(new Error(`Erro na transcrição whisper: ${result.stderr}`));
    }

    // Lê o txt gerado (mesmo nome do arquivo só extensão txt)
    const txtFile = tmpFile.replace('.wav', '.txt');
    if (!fs.existsSync(txtFile)) {
      fs.unlinkSync(tmpFile);
      return reject(new Error('Arquivo txt da transcrição não encontrado.'));
    }
    const transcript = fs.readFileSync(txtFile, 'utf-8').trim();

    // Apaga arquivos temporários
    fs.unlinkSync(tmpFile);
    fs.unlinkSync(txtFile);

    // Retorna o texto da transcrição
    resolve(transcript || 'Áudio sem conteúdo transcrito.');
  });
}

async function getTagsFromTextPrompt(prompt) {
  try {
    const response = await openai.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 200,
    });

    const text = response.data.choices[0].message.content.trim();

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
  const base64Image = buffer.toString('base64');
  const prompt = `
Você é um assistente que vai analisar uma imagem enviada em base64.
Por favor, forneça:
1) Uma breve descrição da imagem, em até 30 palavras.
2) Uma lista de 5 tags relevantes, separadas por vírgula, relacionadas ao conteúdo da imagem.

Base64 da imagem:
${base64Image}

Responda no formato JSON:
{
  "description": "texto curto da descrição",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}
`.trim();

  return await getAiAnnotationsFromPrompt(prompt);
}

async function getAiAnnotationsFromPrompt(prompt) {
  try {
    const response = await openai.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 300,
    });

    const text = response.data.choices[0].message.content;
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
  getAiAnnotationsFromPrompt,
  getTagsFromTextPrompt,
  transcribeAudioBuffer // mantenha se já tiver implementado
};