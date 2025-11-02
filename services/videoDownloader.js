const YTDlpWrap = require('yt-dlp-wrap').default;
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Video Downloader Service
 * Downloads short videos from various platforms (YouTube, TikTok, Instagram, etc.)
 * using yt-dlp
 */

const MAX_VIDEO_DURATION = 60; // 60 seconds = 1 minute

// Initialize yt-dlp wrapper
let ytDlp = null;

/**
 * Initialize the yt-dlp binary
 * Downloads the binary if not already present
 */
async function initYtDlp() {
  if (ytDlp) return ytDlp;
  
  try {
    const ytDlpBinaryPath = path.resolve(__dirname, '../temp/yt-dlp');
    
    // Check if binary already exists
    if (!fs.existsSync(ytDlpBinaryPath)) {
      console.log('[VideoDownloader] Downloading yt-dlp binary...');
      ytDlp = new YTDlpWrap();
      await YTDlpWrap.downloadFromGithub(ytDlpBinaryPath);
      console.log('[VideoDownloader] yt-dlp binary downloaded successfully');
    } else {
      ytDlp = new YTDlpWrap(ytDlpBinaryPath);
      console.log('[VideoDownloader] Using existing yt-dlp binary');
    }
    
    return ytDlp;
  } catch (error) {
    console.error('[VideoDownloader] Failed to initialize yt-dlp:', error.message);
    throw error;
  }
}

/**
 * Extracts video information without downloading
 * @param {string} url - Video URL
 * @returns {Promise<Object>} Video metadata
 */
async function getVideoInfo(url) {
  try {
    const ytDlpInstance = await initYtDlp();
    
    console.log('[VideoDownloader] Extracting video info for:', url);
    
    // Get video info without downloading
    const info = await ytDlpInstance.getVideoInfo(url);
    
    if (!info) {
      throw new Error('Failed to extract video information');
    }
    
    console.log('[VideoDownloader] Video info extracted:', {
      title: info.title,
      duration: info.duration,
      extractor: info.extractor
    });
    
    return {
      title: info.title || 'Unknown',
      duration: info.duration || 0,
      extractor: info.extractor || 'unknown',
      thumbnail: info.thumbnail,
      url: info.webpage_url || url
    };
  } catch (error) {
    console.error('[VideoDownloader] Error extracting video info:', error.message);
    throw new Error(`Não foi possível obter informações do vídeo: ${error.message}`);
  }
}

/**
 * Downloads a short video from a URL
 * @param {string} url - Video URL (YouTube, TikTok, Instagram, etc.)
 * @returns {Promise<Object>} Object with filePath, mimetype, and metadata
 */
async function downloadVideo(url) {
  try {
    // Validate URL
    if (!url || typeof url !== 'string') {
      throw new Error('URL inválida');
    }
    
    // Initialize yt-dlp
    const ytDlpInstance = await initYtDlp();
    
    // Get video info first to check duration
    const videoInfo = await getVideoInfo(url);
    
    // Check if video is under 1 minute
    if (videoInfo.duration > MAX_VIDEO_DURATION) {
      throw new Error(
        `Vídeo muito longo! Duração: ${Math.round(videoInfo.duration)}s. ` +
        `Máximo permitido: ${MAX_VIDEO_DURATION}s (1 minuto).`
      );
    }
    
    // Create temp directory if it doesn't exist
    const tempDir = path.resolve(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Generate unique filename
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const outputTemplate = path.join(tempDir, `download-${uniqueId}.%(ext)s`);
    
    console.log('[VideoDownloader] Downloading video from:', url);
    console.log('[VideoDownloader] Duration:', videoInfo.duration, 'seconds');
    
    // Download video with optimal settings for short videos
    const downloadedFiles = await ytDlpInstance.execPromise([
      url,
      '-o', outputTemplate,
      '--format', 'best[ext=mp4]/best', // Prefer MP4 format
      '--no-playlist', // Don't download playlists
      '--max-filesize', '50M', // Max 50MB file size
      '--no-warnings',
      '--quiet',
      '--no-progress'
    ]);
    
    // Find the downloaded file
    const files = fs.readdirSync(tempDir).filter(f => f.startsWith(`download-${uniqueId}`));
    
    if (files.length === 0) {
      throw new Error('Arquivo de vídeo não foi encontrado após download');
    }
    
    const downloadedFile = files[0];
    const filePath = path.join(tempDir, downloadedFile);
    
    // Determine mimetype based on file extension
    const ext = path.extname(downloadedFile).toLowerCase();
    let mimetype = 'video/mp4'; // Default
    
    if (ext === '.webm') mimetype = 'video/webm';
    else if (ext === '.mkv') mimetype = 'video/x-matroska';
    else if (ext === '.avi') mimetype = 'video/x-msvideo';
    else if (ext === '.mov') mimetype = 'video/quicktime';
    
    console.log('[VideoDownloader] Video downloaded successfully:', filePath);
    
    return {
      filePath,
      mimetype,
      metadata: {
        title: videoInfo.title,
        duration: videoInfo.duration,
        source: videoInfo.extractor,
        url: videoInfo.url
      }
    };
    
  } catch (error) {
    console.error('[VideoDownloader] Error downloading video:', error.message);
    
    // Provide user-friendly error messages
    if (error.message.includes('Unsupported URL')) {
      throw new Error('URL não suportada. Verifique se o link está correto.');
    } else if (error.message.includes('Video unavailable')) {
      throw new Error('Vídeo não disponível ou privado.');
    } else if (error.message.includes('muito longo')) {
      throw error; // Pass duration error as-is
    } else {
      throw new Error(`Erro ao baixar vídeo: ${error.message}`);
    }
  }
}

/**
 * Checks if a URL is likely a video URL from a supported platform
 * @param {string} url - URL to check
 * @returns {boolean} True if URL looks like a video URL
 */
function isVideoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  const videoPatterns = [
    /youtube\.com\/watch/i,
    /youtu\.be\//i,
    /youtube\.com\/shorts/i,
    /tiktok\.com\//i,
    /instagram\.com\/(p|reel|tv)\//i,
    /twitter\.com\/.*\/status\//i,
    /x\.com\/.*\/status\//i,
    /facebook\.com\/.*\/videos\//i,
    /vimeo\.com\//i,
    /dailymotion\.com\//i,
    /twitch\.tv\/videos\//i,
    /reddit\.com\/.*\/comments\//i
  ];
  
  return videoPatterns.some(pattern => pattern.test(url));
}

module.exports = {
  downloadVideo,
  getVideoInfo,
  isVideoUrl,
  MAX_VIDEO_DURATION
};
