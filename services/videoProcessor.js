const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const { getAiAnnotationsFromPrompt } = require('./ai');
const { spawn } = require('child_process');
const whisperPath = path.resolve(__dirname, '../whisper.cpp/build/whisper');
const modelPath = path.resolve(__dirname, '../whisper.cpp/build/ggml-base.bin');

ffmpeg.setFfmpegPath(ffmpegPath);

// Extrai frames (timestamps em segundos)
async function extractFrames(filePath, timestamps) {
  const tempDir = path.resolve(__dirname, '../temp', `frames_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const promises = timestamps.map((timeSec, i) => new Promise((resolve, reject) => {
    const output = path.join(tempDir, `frame_${i}.jpg`);
    ffmpeg(filePath)
      .on('error', reject)
      .screenshots({
        timestamps: [timeSec],
        filename: `frame_${i}.jpg`,
        folder: tempDir,
        size: '512x512'
      })
      .on('end', () => resolve(output));
  }));

  return Promise.all(promises);
}

// Verifica se vídeo tem faixa de áudio
async function hasAudioTrack(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const streams = metadata.streams || [];
      const audioStream = streams.find(s => s.codec_type === 'audio');
      resolve(!!audioStream);
    });
  });
}

// Extrai áudio para wav (usado para transcrição futura, aqui só prévia)
async function extractAudio(filePath) {
  const output = path.resolve(__dirname, '../temp', `audio_${Date.now()}.wav`);
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .noVideo()
      .audioCodec('pcm_s16le')
      .format('wav')
      .save(output)
      .on('end', () => resolve(output))
      .on('error', reject);
  });
}

async function transcribeAudioLocal(audioPath) {
  return new Promise((resolve, reject) => {
    // Ajuste o caminho do executável whisper.cpp e dos parâmetros conforme sua instalação local
    // Exemplo: './whisper.cpp/whisper' --model small.en --output-txt --audio audio.wav
    const whisperPath = path.resolve(__dirname, '../whisper.cpp/build/whisper'); // modifique conforme necessário
    const args = [
      '--model', 'small.en',
      '--output-txt', // gerar txt e capturar saída do txt
      '--no-timestamps',
      audioPath,
    ];

    const whisper = spawn(whisperPath, args);

    let stdout = '';
    let stderr = '';

    whisper.stdout.on('data', data => {
      stdout += data.toString();
    });

    whisper.stderr.on('data', data => {
      stderr += data.toString();
    });

    whisper.on('close', code => {
      if (code === 0) {
        // Assumindo saída txt em mesmo diretório com outro nome (audioPath.txt)
        const txtPath = audioPath.replace(path.extname(audioPath), '.txt');
        try {
          const transcription = fs.readFileSync(txtPath, 'utf-8').trim();
          resolve(transcription);
        } catch (err) {
          // fallback: resolve empty string caso não encontre txt
          resolve('');
        }
      } else {
        reject(new Error(`whisper process exited with code ${code}: ${stderr}`));
      }
    });
  });
}
// Função principal: processa vídeo, gera prompt com imagens + transcrição e solicita IA
async function processVideo(filePath) {
  // Duração vídeo
  const duration = await new Promise((res, rej) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) rej(err);
      else res(meta.format.duration);
    });
  });

  // Timestamps para frames: 10%, 50%, 90%
  const timestamps = [duration * 0.1, duration * 0.5, duration * 0.9];

  // Extrai frames
  const framesPaths = await extractFrames(filePath, timestamps);

  // Verifica áudio
  const audioExists = await hasAudioTrack(filePath);

  let transcription = '';
  
  if (audioExists) {
    // Extrai áudio wav local
    const audioPath = await extractAudio(filePath);
    // Transcreve localmente com whisper.cpp (ou similar) via CLI
    try {
      transcription = await transcribeAudioLocal(audioPath);
    } catch (err) {
      console.warn('Erro na transcrição local:', err);
      transcription = '';
    }
    // Limpar arquivo áudio
    try { fs.unlinkSync(audioPath); } catch {}
  }
  // Ler frames + codificar base64
  const base64Frames = framesPaths.map(fp => {
    const b = fs.readFileSync(fp);
    return b.toString('base64');
  });

  // Limpar arquivos temporários frames
  for (const fp of framesPaths) {
    try { fs.unlinkSync(fp); } catch {}
  }

  // Monta prompt para IA
  let prompt = `
Você é um assistente que irá analisar um vídeo enviado representado por 3 imagens na sequência e uma transcrição de áudio (se disponível).

Imagens base64 separadas por "---imagem---":
${base64Frames.join('\n---imagem---\n')}

Transcrição do áudio (se não há áudio, esta parte está vazia):
${transcription || '[sem áudio]'}

Por favor, forneça:
1) Uma breve descrição do vídeo, em até 50 palavras.
2) Uma lista de 5 tags relevantes, separadas por vírgula, relacionadas ao conteúdo do vídeo.

Responda no formato JSON:
{
  "description": "texto curto da descrição",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}
`.trim();

  // Chama OpenAI com o prompt
  return await getAiAnnotationsFromPrompt(prompt);
}


module.exports = { processVideo, extractFrames };