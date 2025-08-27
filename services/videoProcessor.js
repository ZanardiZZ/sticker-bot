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
  const tempDir = path.resolve(__dirname, '../temp', `frames_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  
  try {
    fs.mkdirSync(tempDir, { recursive: true });
  } catch (mkdirErr) {
    console.warn('[VideoProcessor] Erro ao criar diretório temp:', mkdirErr.message);
    throw new Error('Falha ao criar diretório temporário para frames');
  }

  const promises = timestamps.map((timeSec, i) => new Promise((resolve, reject) => {
    const output = path.join(tempDir, `frame_${i}.jpg`);
    ffmpeg(filePath)
      .on('error', (err) => {
        console.warn(`[VideoProcessor] Erro ao extrair frame ${i}:`, err.message);
        reject(err);
      })
      .screenshots({
        timestamps: [timeSec],
        filename: `frame_${i}.jpg`,
        folder: tempDir,
        size: '512x512'
      })
      .on('end', () => {
        if (fs.existsSync(output)) {
          resolve(output);
        } else {
          reject(new Error(`Frame ${i} não foi criado`));
        }
      });
  }));

  try {
    return await Promise.all(promises);
  } catch (error) {
    // Limpa diretório em caso de erro
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
    throw error;
  }
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
    const whisperPath = path.resolve(__dirname, '../whisper.cpp/build/whisper');
    
    // Verifica se whisper existe antes de tentar executar
    if (!fs.existsSync(whisperPath)) {
      console.warn('[VideoProcessor] whisper.cpp não encontrado, retornando transcrição vazia');
      return resolve('');
    }
    
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

    whisper.on('error', (error) => {
      console.warn('[VideoProcessor] Erro ao executar whisper:', error.message);
      resolve(''); // Retorna string vazia em vez de rejeitar
    });

    whisper.on('close', code => {
      if (code === 0) {
        // Assumindo saída txt em mesmo diretório com outro nome (audioPath.txt)
        const txtPath = audioPath.replace(path.extname(audioPath), '.txt');
        try {
          const transcription = fs.readFileSync(txtPath, 'utf-8').trim();
          // Limpa arquivo txt
          try { fs.unlinkSync(txtPath); } catch {}
          resolve(transcription);
        } catch (err) {
          // fallback: resolve empty string caso não encontre txt
          console.warn('[VideoProcessor] Arquivo de transcrição não encontrado');
          resolve('');
        }
      } else {
        console.warn(`[VideoProcessor] whisper process exited with code ${code}: ${stderr}`);
        resolve(''); // Retorna string vazia em vez de rejeitar
      }
    });
  });
}
// Função principal: processa vídeo, gera prompt com imagens + transcrição e solicita IA
async function processVideo(filePath) {
  console.log(`[VideoProcessor] Processando arquivo: ${path.basename(filePath)}`);
  
  try {
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
      try {
        const audioPath = await extractAudio(filePath);
        // Transcreve localmente com whisper.cpp (ou similar) via CLI
        transcription = await transcribeAudioLocal(audioPath);
        // Limpar arquivo áudio
        try { fs.unlinkSync(audioPath); } catch {}
      } catch (audioErr) {
        console.warn('[VideoProcessor] Erro ao processar áudio:', audioErr.message);
        transcription = '';
      }
    }
    
    // Ler frames + codificar base64
    const base64Frames = framesPaths.map(fp => {
      try {
        const b = fs.readFileSync(fp);
        return b.toString('base64');
      } catch (err) {
        console.warn('[VideoProcessor] Erro ao ler frame:', fp);
        return null;
      }
    }).filter(frame => frame !== null);

    // Limpar arquivos temporários frames
    for (const fp of framesPaths) {
      try { fs.unlinkSync(fp); } catch {}
    }

    if (base64Frames.length === 0) {
      console.warn('[VideoProcessor] Nenhum frame válido extraído');
      return { description: 'Erro na extração de frames do vídeo', tags: ['video', 'erro'] };
    }

    // Monta prompt para IA com identificador único
    const fileId = path.basename(filePath).replace(/\W+/g, '_');
    let prompt = `
Você é um assistente que irá analisar um vídeo enviado (ID: ${fileId}) representado por ${base64Frames.length} imagens na sequência e uma transcrição de áudio (se disponível).

Imagens base64 separadas por "---imagem---":
${base64Frames.join('\n---imagem---\n')}

Transcrição do áudio (se não há áudio, esta parte está vazia):
${transcription || '[sem áudio]'}

Por favor, forneça uma análise específica deste vídeo (ID: ${fileId}):
1) Uma breve descrição do vídeo, em até 50 palavras.
2) Uma lista de 5 tags relevantes, separadas por vírgula, relacionadas ao conteúdo específico do vídeo.

Responda no formato JSON:
{
  "description": "texto curto da descrição específica",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}
`.trim();

    // Chama OpenAI com o prompt
    console.log(`[VideoProcessor] Enviando ${base64Frames.length} frames para análise de IA`);
    const result = await getAiAnnotationsFromPrompt(prompt);
    console.log(`[VideoProcessor] Análise concluída para ${fileId}:`, result.description?.slice(0, 30) || 'sem descrição');
    
    return result;
  } catch (error) {
    console.error('[VideoProcessor] Erro geral no processamento:', error.message);
    return { 
      description: `Erro no processamento do vídeo: ${error.message}`, 
      tags: ['video', 'erro', 'processamento'] 
    };
  }
}


module.exports = { processVideo, extractFrames };