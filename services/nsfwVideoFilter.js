const { extractFrames } = require('./videoProcessor');
const fs = require('fs');
const { isNSFW: isImageBufferNSFW } = require('./nsfwFilter');

async function isVideoNSFW(filePath) {
  try {
    // Check if FFmpeg is available by trying to require it
    let ffmpeg;
    try {
      ffmpeg = require('fluent-ffmpeg');
    } catch (ffmpegErr) {
      console.warn('[NSFW Video] FFmpeg não disponível, assumindo vídeo como seguro:', ffmpegErr.message);
      return false;
    }
    
    // Extrair frames 10%, 50%, 90%
    const duration = await new Promise((res, rej) => {
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
        const nsfw = await isImageBufferNSFW(buffer, { mimeType: 'image/jpeg', source: 'video-frame' });
        
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
            try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) { console.warn('[NSFWVideo] Erro ao remover frame temporário:', e.message); }
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
              try { if (fs.existsSync(remainingFp)) fs.unlinkSync(remainingFp); } catch (e) { console.warn('[NSFWVideo] Erro ao remover frame temporário:', e.message); }
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
