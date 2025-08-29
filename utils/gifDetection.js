const fs = require('fs');
const path = require('path');

/**
 * Detects if a video file is likely a GIF converted to MP4 by WhatsApp
 * @param {string} filePath - Path to the video file
 * @param {string} mimetype - Original mimetype
 * @returns {boolean} - True if the video appears to be a GIF
 */
async function isGifLikeVideo(filePath, mimetype) {
  // Only check video files
  if (!mimetype.startsWith('video/')) {
    return false;
  }
  
  // Try to load FFmpeg conditionally
  let ffmpeg = null;
  try {
    ffmpeg = require('fluent-ffmpeg');
    const ffmpegPath = require('ffmpeg-static');
    if (ffmpegPath) {
      ffmpeg.setFfmpegPath(ffmpegPath);
    }
  } catch (error) {
    console.warn('[GIF Detection] FFmpeg não disponível, não é possível analisar características do vídeo');
    return false;
  }
  
  if (!ffmpeg) {
    return false;
  }
  
  try {
    const metadata = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, meta) => {
        if (err) {
          reject(err);
        } else {
          resolve(meta);
        }
      });
    });
    
    const duration = metadata.format?.duration || 0;
    const bitrate = metadata.format?.bit_rate || 0;
    const size = metadata.format?.size || 0;
    
    // Check for video stream info
    const videoStream = metadata.streams?.find(s => s.codec_type === 'video');
    const audioStream = metadata.streams?.find(s => s.codec_type === 'audio');
    
    // CRITICAL: GIFs cannot have audio by definition
    // If a video has audio, it's definitely not a GIF, regardless of other characteristics
    const hasAudio = !!audioStream;
    if (hasAudio) {
      console.log(`[GIF Detection] Analyzing ${path.basename(filePath)}:`);
      console.log(`  Has audio: true - DEFINITELY NOT A GIF (GIFs cannot have audio)`);
      console.log(`  Conclusion: DEFINITELY VIDEO (has audio track)`);
      return false;
    }
    
    // Only for videos without audio: check additional GIF-like characteristics
    // 1. Very short duration (typically < 15 seconds for GIFs)  
    // 2. Low resolution (GIFs are usually small)
    // 3. Small file size for the duration
    
    const isVeryShortDuration = duration > 0 && duration <= 15; // More conservative: max 15 seconds for GIFs
    const isLowRes = videoStream && (videoStream.width <= 600 || videoStream.height <= 600); // More conservative resolution
    const isSmallFile = size <= 5 * 1024 * 1024; // More conservative: max 5MB for GIFs
    
    // For audio-less videos, require ALL remaining characteristics for GIF detection
    let score = 0;
    if (isVeryShortDuration) score++;
    if (isLowRes) score++;
    if (isSmallFile) score++;
    
    const isLikelyGif = score >= 3; // All 3 remaining criteria required (audio already confirmed absent)
    
    console.log(`[GIF Detection] Analyzing ${path.basename(filePath)}:`);
    console.log(`  Duration: ${duration}s (very short: ${isVeryShortDuration})`);
    console.log(`  Has audio: false (confirmed no audio track)`);
    console.log(`  Resolution: ${videoStream?.width}x${videoStream?.height} (low res: ${isLowRes})`);
    console.log(`  Size: ${Math.round(size / 1024)}KB (small: ${isSmallFile})`);
    console.log(`  GIF-like score: ${score}/3 (all criteria required for audio-less videos)`);
    console.log(`  Conclusion: ${isLikelyGif ? 'LIKELY GIF' : 'LIKELY VIDEO'}`);
    
    return isLikelyGif;
    
  } catch (error) {
    console.warn(`[GIF Detection] Erro ao analisar ${path.basename(filePath)}:`, error.message);
    return false;
  }
}

module.exports = {
  isGifLikeVideo
};