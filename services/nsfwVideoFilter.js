const { extractFrames } = require('./videoProcessor');
const fs = require('fs');
const sharp = require('sharp');

// Conditional loading for TensorFlow and NSFWJS - these may fail in some environments
let nsfwjs = null;
let tf = null;
let model = null;

try {
  nsfwjs = require('nsfwjs');
  tf = require('@tensorflow/tfjs-node');
} catch (error) {
  console.warn('[NSFW Video] TensorFlow/NSFWJS não disponível:', error.message);
  console.warn('[NSFW Video] Análise NSFW de vídeo será desabilitada');
}

async function loadModel() {
  if (!nsfwjs || !tf) {
    console.warn('[NSFW Video] TensorFlow/NSFWJS não disponível');
    return null;
  }
  
  if (!model) {
    try {
      model = await nsfwjs.load();
    } catch (error) {
      console.warn('[NSFW Video] Erro ao carregar modelo NSFW:', error.message);
      return null;
    }
  }
  return model;
}

async function isImageNSFW(buffer) {
  try {
    const loadedModel = await loadModel();
    
    // If model loading failed, assume not NSFW
    if (!loadedModel || !tf) {
      console.warn('[NSFW Video] Modelo não disponível, assumindo conteúdo seguro');
      return false;
    }
    
    // Validate buffer first
    if (!buffer || buffer.length < 10) {
      console.warn('[NSFW Video] Buffer muito pequeno ou inválido para análise');
      return false;
    }

    // Try to process with sharp with better error handling
    let processedBuffer;
    try {
      // First try to get metadata to validate the image
      const metadata = await sharp(buffer).metadata();
      if (!metadata.format) {
        console.warn('[NSFW Video] Formato de imagem não detectado, assumindo como segura');
        return false;
      }
      
      // Convert to standard format and resize
      processedBuffer = await sharp(buffer)
        .resize(224, 224, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 80 })
        .toBuffer();
        
    } catch (sharpErr) {
      console.warn('[NSFW Video] Erro ao processar imagem com sharp:', sharpErr.message);
      return false;
    }

    // Use TensorFlow to decode and classify
    const tfimage = tf.node.decodeImage(processedBuffer, 3);
    const predictions = await loadedModel.classify(tfimage);
    tfimage.dispose();

    const nsfwPrediction = predictions.find(p => ['Porn', 'Hentai', 'Sexy'].includes(p.className));
    if (nsfwPrediction && nsfwPrediction.probability > 0.7) {
      return true;
    }
    return false;
    
  } catch (error) {
    console.warn('[NSFW Video] Erro na análise NSFW da imagem:', error.message);
    // Em caso de erro, retorna false para não bloquear o processamento
    return false;
  }
}

async function isVideoNSFW(filePath) {
  try {
    // Extrair frames 10%, 50%, 90%
    const duration = await new Promise((res, rej) => {
      const ffmpeg = require('fluent-ffmpeg');
      ffmpeg.ffprobe(filePath, (err, meta) => {
        if (err) return rej(err);
        else return res(meta.format.duration);
      });
    });

    if (!duration || duration <= 0) {
      console.warn('[NSFW Video] Duração inválida do vídeo, assumindo como seguro');
      return false;
    }

    const timestamps = [duration * 0.1, duration * 0.5, duration * 0.9];
    let framesPaths = [];
    
    try {
      framesPaths = await extractFrames(filePath, timestamps);
    } catch (extractErr) {
      console.warn('[NSFW Video] Erro ao extrair frames do vídeo:', extractErr.message);
      return false;
    }

    // Check each frame
    let nsfwDetected = false;
    for (const fp of framesPaths) {
      try {
        if (!fs.existsSync(fp)) {
          console.warn('[NSFW Video] Frame não encontrado:', fp);
          continue;
        }
        
        const buffer = fs.readFileSync(fp);
        const nsfw = await isImageNSFW(buffer);
        
        if (nsfw) {
          nsfwDetected = true;
        }
      } catch (frameErr) {
        console.warn('[NSFW Video] Erro ao processar frame:', fp, frameErr.message);
        // Continue checking other frames
      } finally {
        // Always try to clean up the frame file
        try {
          if (fs.existsSync(fp)) {
            fs.unlinkSync(fp);
          }
        } catch (cleanupErr) {
          console.warn('[NSFW Video] Erro ao limpar frame:', fp, cleanupErr.message);
        }
      }
      
      // If we found NSFW content, we can exit early
      if (nsfwDetected) {
        // Clean up remaining frames
        for (const remainingFp of framesPaths) {
          try {
            if (fs.existsSync(remainingFp)) {
              fs.unlinkSync(remainingFp);
            }
          } catch (cleanupErr) {
            // Ignore cleanup errors
          }
        }
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('[NSFW Video] Erro na análise NSFW do vídeo:', error.message);
    // Em caso de erro, considerar não nsfw para não bloquear mídia por falha
    return false;
  }
}

module.exports = {
  isVideoNSFW
};
