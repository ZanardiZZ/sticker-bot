require('dotenv').config();
const crypto = require('crypto');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { getAiAnnotationsFromPrompt, getAiAnnotations } = require('./ai');
const sharp = require('sharp');
const { getTopTags } = require('../utils/messageUtils');
// (Removed unused constants whisperPath and modelPath)

// Conditional loading for FFmpeg - these may fail in some environments due to network restrictions
let ffmpeg = null;
let ffmpegPath = null;

try {
  ffmpeg = require('fluent-ffmpeg');
  ffmpegPath = require('ffmpeg-static');
  
  if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
  }
} catch (error) {
  console.warn('[VideoProcessor] FFmpeg não disponível:', error.message);
  console.warn('[VideoProcessor] Funcionalidades de processamento de vídeo serão desabilitadas');
}

// Initialize OpenAI client for video transcription
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Extrai frames (timestamps em segundos)
async function extractFrames(filePath, timestamps) {
  // Check if FFmpeg is available
  if (!ffmpeg || !ffmpegPath) {
    console.warn('[VideoProcessor] FFmpeg não disponível, não é possível extrair frames');
    throw new Error('FFmpeg não disponível - funcionalidade de extração de frames desabilitada');
  }
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }
  
  const uniqueId = crypto.randomBytes(16).toString('hex');
  const processId = process.pid; // Add process ID for extra uniqueness in concurrent scenarios
  let tempDir = path.resolve(__dirname, '../temp', `frames_${processId}_${uniqueId}`);

  try {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log(`[VideoProcessor] Diretório temporário criado: ${tempDir}`);
  } catch (mkdirErr) {
    console.warn('[VideoProcessor] Erro ao criar diretório temp:', mkdirErr.message);
    // Try with an alternative directory name in case of concurrent access
    const altTempDir = path.resolve(__dirname, '../temp', `frames_alt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`);
    try {
      fs.mkdirSync(altTempDir, { recursive: true });
      console.log(`[VideoProcessor] Diretório temporário alternativo criado: ${altTempDir}`);
      // Update tempDir to use the alternative
      tempDir = altTempDir;
    } catch (altErr) {
      throw new Error(`Falha ao criar diretório temporário para frames: ${mkdirErr.message}. Tentativa alternativa também falhou: ${altErr.message}`);
    }
  }

  const promises = timestamps.map((timeSec, i) => new Promise((resolve, reject) => {
    const output = path.join(tempDir, `frame_${i}.jpg`);
    
    // Additional validation for timestamp before processing
    if (!timeSec || isNaN(timeSec) || !isFinite(timeSec) || timeSec < 0) {
      reject(new Error(`Timestamp inválido para frame ${i + 1}: ${timeSec}. Isso pode indicar um problema de processamento concorrente.`));
      return;
    }
    
    console.log(`[VideoProcessor] Extraindo frame ${i + 1} no timestamp ${timeSec}s...`);
    
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timeout ao extrair frame ${i} após 30 segundos`));
    }, 30000); // 30 second timeout per frame
    
    ffmpeg(filePath)
      .on('error', (err) => {
        clearTimeout(timeoutId);
        console.warn(`[VideoProcessor] Erro ao extrair frame ${i + 1}:`, err.message);
        
        // Enhanced error checking for timestamp-related issues
        if (err.message.includes('Invalid duration specification') || err.message.includes('NaN')) {
          reject(new Error(`Erro de timestamp inválido no frame ${i + 1}: ${err.message}. Timestamp usado: ${timeSec}s`));
        } else if (err.message.includes('ffprobe') || err.message.includes('No such file')) {
          reject(new Error(`FFmpeg não pode processar o arquivo: ${err.message}`));
        } else {
          reject(err);
        }
      })
      .screenshots({
        timestamps: [timeSec],
        filename: `frame_${i}.jpg`,
        folder: tempDir,
        size: '512x512'
      })
      .on('end', () => {
        clearTimeout(timeoutId);
        if (fs.existsSync(output)) {
          console.log(`[VideoProcessor] Frame ${i + 1} extraído com sucesso: ${output}`);
          resolve(output);
        } else {
          // Add diagnostic information for debugging
          console.warn(`[VideoProcessor] Frame ${i + 1} não foi criado. Diagnóstico:`);
          console.warn(`  - Arquivo esperado: ${output}`);
          console.warn(`  - Diretório existe: ${fs.existsSync(tempDir)}`);
          console.warn(`  - Timestamp usado: ${timeSec}s`);
          console.warn(`  - Arquivo original existe: ${fs.existsSync(filePath)}`);
          
          // List files in temp directory for debugging
          try {
            const tempFiles = fs.readdirSync(tempDir);
            console.warn(`  - Arquivos no diretório temp: ${tempFiles.join(', ') || 'nenhum'}`);
          } catch (listErr) {
            console.warn(`  - Erro ao listar diretório temp: ${listErr.message}`);
          }
          
          reject(new Error(`Frame ${i + 1} não foi criado em ${output}. Possível problema de formato GIF ou timestamp inválido.`));
        }
      });
  }));

  let extractedFrames = [];
  const errors = [];
  
  try {
    // Use Promise.allSettled to get partial success instead of all-or-nothing
    const results = await Promise.allSettled(promises);
    
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        extractedFrames.push(result.value);
      } else {
        errors.push(`Frame ${i + 1}: ${result.reason.message}`);
      }
    });
    
    if (extractedFrames.length === 0) {
      console.error('[VideoProcessor] Nenhum frame foi extraído com sucesso');
      console.error('[VideoProcessor] Erros encontrados:', errors);
      throw new Error(`Falha ao extrair qualquer frame. Erros: ${errors.join('; ')}`);
    }
    
    if (errors.length > 0) {
      console.warn(`[VideoProcessor] ${errors.length} frames falharam na extração:`, errors);
    }
    
    console.log(`[VideoProcessor] ${extractedFrames.length}/${timestamps.length} frames extraídos com sucesso`);
    return extractedFrames;
    
  } catch (error) {
    // Limpa diretório em caso de erro
    console.log(`[VideoProcessor] Limpando diretório temporário após erro: ${tempDir}`);
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (cleanupErr) {
      console.warn('[VideoProcessor] Erro ao limpar diretório temporário:', cleanupErr.message);
    }
    throw error;
  }
}

// Verifica se vídeo tem faixa de áudio
async function hasAudioTrack(filePath) {
  // Check if FFmpeg is available
  if (!ffmpeg) {
    console.warn('[VideoProcessor] FFmpeg não disponível, assumindo que vídeo não tem áudio');
    return false;
  }
  
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
  // Check if FFmpeg is available
  if (!ffmpeg) {
    console.warn('[VideoProcessor] FFmpeg não disponível, não é possível extrair áudio');
    throw new Error('FFmpeg não disponível - funcionalidade de extração de áudio desabilitada');
  }
  const uniqueId = crypto.randomBytes(16).toString('hex');
  const output = path.resolve(__dirname, '../temp', `audio_${uniqueId}.wav`);
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
  try {
    if (!openai) {
      console.warn('[VideoProcessor] OpenAI API key not configured, returning empty transcription');
      return '';
    }

    if (!fs.existsSync(audioPath)) {
      console.warn('[VideoProcessor] Audio file not found:', audioPath);
      return '';
    }

    // Use OpenAI Whisper API for transcription
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: 'whisper-1',
      language: 'pt', // Portuguese
      response_format: 'text'
    });

    return transcription.trim() || '';

  } catch (error) {
    console.warn('[VideoProcessor] Error transcribing audio with OpenAI:', error.message);
    return ''; // Return empty string on error (consistent with original behavior)
  }
}

// Analisa um frame individual e retorna descrição e tags
async function analyzeFrame(framePath, frameIndex) {
  try {
    if (!fs.existsSync(framePath)) {
      console.warn(`[VideoProcessor] Frame ${frameIndex} não encontrado: ${framePath}`);
      return { description: '', tags: [] };
    }
    
    const buffer = fs.readFileSync(framePath);
    const result = await getAiAnnotations(buffer);
    
    console.log(`[VideoProcessor] Frame ${frameIndex} analisado: ${result.description?.slice(0, 30) || 'sem descrição'}...`);
    
    return {
      description: result.description || '',
      tags: result.tags || []
    };
  } catch (error) {
    console.warn(`[VideoProcessor] Erro ao analisar frame ${frameIndex}:`, error.message);
    return { description: '', tags: [] };
  }
}

// Função principal: processa vídeo, gera prompt com imagens + transcrição e solicita IA
async function processVideo(filePath) {
  console.log(`[VideoProcessor] Processando arquivo: ${path.basename(filePath)}`);
  
  // Check if FFmpeg is available
  if (!ffmpeg) {
    console.warn('[VideoProcessor] FFmpeg não disponível, retornando análise básica');
    return {
      description: 'Vídeo não processado - FFmpeg não disponível',
      tags: ['video', 'nao-processado']
    };
  }
  
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

    // Analisa cada frame individualmente
    console.log('[VideoProcessor] Analisando frames individuais...');
    const frameAnalyses = [];
    
    for (let i = 0; i < framesPaths.length; i++) {
      const analysis = await analyzeFrame(framesPaths[i], i + 1);
      frameAnalyses.push(analysis);
    }

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
    
    // Limpar arquivos temporários frames
    for (const fp of framesPaths) {
      try { fs.unlinkSync(fp); } catch {}
    }

    if (frameAnalyses.length === 0) {
      console.warn('[VideoProcessor] Nenhum frame analisado');
      return { description: 'Erro na análise de frames do vídeo', tags: ['video', 'erro'] };
    }

    // Combinar análises dos frames
    const frameDescriptions = frameAnalyses
      .map((analysis, i) => `Frame ${i + 1}: ${analysis.description}`)
      .filter(desc => desc.includes(':') && desc.split(':')[1].trim())
      .join('\n');

    const allTags = frameAnalyses
      .flatMap(analysis => analysis.tags)
      .filter(tag => tag && tag.trim());

    const topTags = getTopTags(allTags, 5);

    // Monta descrição final integrando frames e áudio
    const fileId = path.basename(filePath).replace(/\W+/g, '_');
    let finalDescription = '';
    let finalTags = topTags;

    if (transcription && transcription !== '[sem áudio]' && !transcription.includes('não transcrito')) {
      // Se tem áudio válido, integra com análise visual
      const prompt = `
Você está analisando um vídeo (ID: ${fileId}) que contém tanto conteúdo visual quanto áudio.

ANÁLISE VISUAL DOS FRAMES:
${frameDescriptions}

TRANSCRIÇÃO DO ÁUDIO:
${transcription}

TAGS VISUAIS IDENTIFICADAS:
${topTags.join(', ')}

Por favor, forneça uma análise integrada que combine o conteúdo visual e auditivo:
1) Uma descrição concisa do vídeo (máximo 50 palavras) que integre ambos os aspectos
2) Uma lista de 5 tags relevantes que representem tanto o conteúdo visual quanto auditivo

Responda no formato JSON:
{
  "description": "descrição integrada do vídeo",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}
`.trim();

      console.log('[VideoProcessor] Integrando análise visual e auditiva...');
      const integratedResult = await getAiAnnotationsFromPrompt(prompt);
      
      if (integratedResult && typeof integratedResult === 'object') {
        finalDescription = integratedResult.description || frameDescriptions.split('\n')[0]?.split(': ')[1] || 'Vídeo analisado';
        finalTags = integratedResult.tags && integratedResult.tags.length > 0 ? integratedResult.tags : topTags;
      } else {
        console.warn('[VideoProcessor] Resultado inválido da integração audiovisual:', integratedResult);
        finalDescription = frameDescriptions.split('\n')[0]?.split(': ')[1] || 'Vídeo analisado';
        finalTags = topTags;
      }
      
    } else {
      // Só análise visual, combina descrições dos frames
      if (frameAnalyses.length === 1) {
        finalDescription = frameAnalyses[0].description || 'Vídeo processado';
      } else {
        // Sumariza múltiplos frames
        const prompt = `
Você está analisando um vídeo (ID: ${fileId}) através de múltiplos frames.

ANÁLISE DE CADA FRAME:
${frameDescriptions}

TAGS IDENTIFICADAS:
${topTags.join(', ')}

Por favor, forneça uma descrição única e concisa (máximo 50 palavras) que sumarize o conteúdo visual geral do vídeo e 5 tags representativas.

Responda no formato JSON:
{
  "description": "descrição sumarizada do vídeo",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}
`.trim();

        console.log('[VideoProcessor] Sumarizando análise visual de múltiplos frames...');
        const summaryResult = await getAiAnnotationsFromPrompt(prompt);
        
        if (summaryResult && typeof summaryResult === 'object') {
          finalDescription = summaryResult.description || frameAnalyses[0].description || 'Vídeo processado';
          finalTags = summaryResult.tags && summaryResult.tags.length > 0 ? summaryResult.tags : topTags;
        } else {
          console.warn('[VideoProcessor] Resultado inválido da sumarização:', summaryResult);
          finalDescription = frameAnalyses[0].description || 'Vídeo processado';
          finalTags = topTags;
        }
      }
    }

    console.log(`[VideoProcessor] Análise concluída para ${fileId}:`, finalDescription?.slice(0, 30) || 'sem descrição');
    
    return {
      description: finalDescription,
      tags: finalTags
    };
    
  } catch (error) {
    console.error('[VideoProcessor] Erro geral no processamento:', error.message);
    return { 
      description: `Erro no processamento do vídeo: ${error.message}`, 
      tags: ['video', 'erro', 'processamento'] 
    };
  }
}

// Função simplificada para GIFs - apenas análise visual de 3 frames
async function processGif(filePath) {
  console.log(`[VideoProcessor] Processando GIF: ${path.basename(filePath)}`);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`[VideoProcessor] Arquivo GIF não encontrado: ${filePath}`);
    return {
      description: 'Erro: arquivo GIF não encontrado',
      tags: ['gif', 'erro', 'arquivo-nao-encontrado']
    };
  }
  
  // Check if FFmpeg is available
  if (!ffmpeg || !ffmpegPath) {
    console.warn('[VideoProcessor] FFmpeg não disponível, retornando análise básica para GIF');
    return {
      description: 'GIF não processado - FFmpeg não disponível',
      tags: ['gif', 'nao-processado']
    };
  }
  
  let tempFramePaths = [];
  
  try {
    // Para GIFs, usa timestamps fixos mais próximos
    let duration = await new Promise((res, rej) => {
      ffmpeg.ffprobe(filePath, (err, meta) => {
        if (err) {
          console.warn(`[VideoProcessor] Erro ao obter metadados do GIF: ${err.message}`);
          rej(err);
        } else {
          const fileDuration = meta.format?.duration || 2; // fallback para 2s se não detectar duração
          console.log(`[VideoProcessor] Duração do GIF detectada: ${fileDuration}s`);
          res(fileDuration);
        }
      });
    });

    // Validate duration and apply fallback for concurrent processing safety
    if (!duration || isNaN(duration) || duration <= 0 || !isFinite(duration)) {
      console.warn(`[VideoProcessor] Duração inválida detectada (${duration}), usando fallback padrão`);
      duration = 2; // Safe default duration
    }

    // Para GIFs curtos, usa timestamps mais próximos
    const timestamps = duration > 3 
      ? [duration * 0.1, duration * 0.5, duration * 0.9]
      : [0.1, Math.max(0.5, duration * 0.3), Math.max(1, duration * 0.8)];

    // Additional safety check for computed timestamps
    const validTimestamps = timestamps.filter(t => t && !isNaN(t) && isFinite(t) && t > 0);
    const finalTimestamps = validTimestamps.length > 0 ? validTimestamps : [0.1, 0.5, 1.0];
    
    if (validTimestamps.length === 0) {
      console.warn('[VideoProcessor] Todos os timestamps calculados são inválidos, usando timestamps padrão');
    } else if (validTimestamps.length < timestamps.length) {
      console.warn(`[VideoProcessor] ${timestamps.length - validTimestamps.length} timestamps inválidos foram filtrados`);
    }

    console.log(`[VideoProcessor] Extraindo frames do GIF nos timestamps: ${finalTimestamps.join(', ')}s`);

    // Extrai frames - with better error handling for GIF format issues
    try {
      tempFramePaths = await extractFrames(filePath, finalTimestamps);
      console.log(`[VideoProcessor] ${tempFramePaths.length} frames extraídos com sucesso`);
    } catch (extractError) {
      console.error('[VideoProcessor] Falha completa na extração de frames:', extractError.message);
      
      // Add more specific diagnostic information
      if (extractError.message.includes('Falha ao extrair qualquer frame')) {
        console.warn('[VideoProcessor] Possíveis causas do erro de extração de frames:');
        console.warn('  1. Formato GIF incompatível ou corrompido');
        console.warn('  2. Timestamps inválidos para este GIF específico');
        console.warn('  3. Problema de permissão no diretório temporário');
        console.warn('  4. FFmpeg não consegue processar este tipo de GIF');
        
        // Try with a simpler approach - just get the first frame at t=0
        console.warn('[VideoProcessor] Tentando fallback com extração de frame único...');
        try {
          tempFramePaths = await extractFrames(filePath, [0]);
          console.log('[VideoProcessor] Fallback com frame único foi bem-sucedido');
        } catch (fallbackError) {
          console.error('[VideoProcessor] Fallback também falhou:', fallbackError.message);
          // Throw error to trigger fallback mechanism in mediaProcessor.js
          throw new Error('GIF frame extraction failed completely - will trigger single-frame analysis fallback');
        }
      } else {
        // Re-throw other types of extraction errors
        throw extractError;
      }
    }

    // Analisa cada frame individualmente
    console.log('[VideoProcessor] Analisando frames do GIF...');
    const frameAnalyses = [];
    
    for (let i = 0; i < tempFramePaths.length; i++) {
      try {
        const analysis = await analyzeFrame(tempFramePaths[i], i + 1);
        if (analysis && (analysis.description || analysis.tags.length > 0)) {
          frameAnalyses.push(analysis);
        }
      } catch (frameError) {
        console.warn(`[VideoProcessor] Erro ao analisar frame ${i + 1}: ${frameError.message}`);
        // Continue com os outros frames
      }
    }

    if (frameAnalyses.length === 0) {
      console.warn('[VideoProcessor] Nenhum frame analisado com sucesso no GIF');
      return { 
        description: 'GIF processado mas sem análise de conteúdo disponível', 
        tags: ['gif', 'sem-analise'] 
      };
    }

    // Combinar análises dos frames para GIF
    const frameDescriptions = frameAnalyses
      .map((analysis, i) => `Frame ${i + 1}: ${analysis.description}`)
      .filter(desc => desc.includes(':') && desc.split(':')[1].trim())
      .join('\n');

    const allTags = frameAnalyses
      .flatMap(analysis => analysis.tags)
      .filter(tag => tag && tag.trim());

    const topTags = getTopTags(allTags, 5);

    const fileId = path.basename(filePath).replace(/\W+/g, '_');
    
    if (frameAnalyses.length === 1) {
      // Apenas um frame analisado
      return {
        description: frameAnalyses[0].description || 'GIF processado',
        tags: frameAnalyses[0].tags && frameAnalyses[0].tags.length > 0 ? frameAnalyses[0].tags : ['gif']
      };
    } else {
      // Múltiplos frames - sumariza
      const prompt = `
Você está analisando um GIF animado ou meme (ID: ${fileId}) através de múltiplos frames.

IMPORTANTE: Este é um GIF/meme, NÃO um vídeo. Descreva a animação, movimento ou cena sem usar termos como "vídeo", "filmagem" ou "gravação".

ANÁLISE DE CADA FRAME:
${frameDescriptions}

TAGS IDENTIFICADAS:
${topTags.join(', ')}

Por favor, forneça uma descrição única e concisa (máximo 50 palavras) que capture a essência da animação, movimento ou meme do GIF. Foque na ação, expressão ou situação mostrada. Use termos como "animação", "GIF", "meme", "cena" em vez de "vídeo".

Responda no formato JSON:
{
  "description": "descrição da animação/meme/cena do GIF",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}
`.trim();

      console.log('[VideoProcessor] Sumarizando análise do GIF...');
      const summaryResult = await getAiAnnotationsFromPrompt(prompt);
      
      if (summaryResult && typeof summaryResult === 'object' && summaryResult.description) {
        return {
          description: summaryResult.description || frameAnalyses[0].description || 'GIF processado',
          tags: summaryResult.tags && summaryResult.tags.length > 0 ? summaryResult.tags : topTags
        };
      } else {
        console.warn('[VideoProcessor] Resultado inválido da sumarização de GIF:', summaryResult);
        return {
          description: frameAnalyses[0].description || 'GIF processado',
          tags: topTags.length > 0 ? topTags : ['gif']
        };
      }
    }
    
  } catch (error) {
    console.error('[VideoProcessor] Erro no processamento do GIF:', error.message);
    console.error('[VideoProcessor] Stack trace:', error.stack);
    
    // Specific error handling for common issues
    if (error.message.includes('ffprobe') || error.message.includes('FFmpeg')) {
      console.warn('[VideoProcessor] Erro relacionado ao FFmpeg, tentando fallback...');
      return { 
        description: 'GIF detectado mas não foi possível processar com FFmpeg', 
        tags: ['gif', 'ffmpeg-erro', 'nao-processado'] 
      };
    } else if (error.message.includes('OpenAI') || error.message.includes('API')) {
      console.warn('[VideoProcessor] Erro relacionado à API de IA, retornando resultado básico...');
      return { 
        description: 'GIF detectado mas análise de conteúdo não disponível', 
        tags: ['gif', 'ia-erro', 'sem-analise'] 
      };
    } else {
      return { 
        description: `Erro no processamento do GIF: ${error.message}`, 
        tags: ['gif', 'erro', 'processamento'] 
      };
    }
  } finally {
    // Sempre limpar arquivos temporários
    if (tempFramePaths.length > 0) {
      console.log(`[VideoProcessor] Limpando ${tempFramePaths.length} arquivos temporários de frames...`);
      for (const fp of tempFramePaths) {
        try { 
          if (fs.existsSync(fp)) {
            fs.unlinkSync(fp);
          }
        } catch (cleanupErr) {
          console.warn(`[VideoProcessor] Erro ao limpar arquivo temporário ${fp}: ${cleanupErr.message}`);
        }
      }
    }
  }
}


module.exports = { processVideo, processGif, extractFrames };
