const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

// Audio conversion settings optimized for WhatsApp
// WhatsApp requires OPUS codec in OGG container for audio messages
const AUDIO_CODEC = 'libopus';
const AUDIO_BITRATE = '64k';      // Good quality for voice/music while keeping file size reasonable
const AUDIO_SAMPLE_RATE = 48000;  // 48kHz - WhatsApp recommended sample rate for OPUS
const AUDIO_CHANNELS = 1;         // Mono - reduces file size, sufficient for most audio
const OUTPUT_FORMAT = 'ogg';      // OGG container for OPUS codec

/**
 * Converts MP3 audio file to OPUS format (OGG container)
 * WhatsApp requires audio messages to be in OPUS format for proper playback
 * 
 * @param {string} inputPath - Path to input MP3 file
 * @param {string} outputPath - Path for output OGG/OPUS file
 * @returns {Promise<string>} Path to converted file
 */
async function convertMp3ToOpus(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(inputPath)) {
      return reject(new Error('Input file does not exist'));
    }

    console.log('[AudioConverter] Converting MP3 to OPUS:', { inputPath, outputPath });

    ffmpeg(inputPath)
      .audioCodec(AUDIO_CODEC)
      .audioBitrate(AUDIO_BITRATE)
      .audioFrequency(AUDIO_SAMPLE_RATE)
      .audioChannels(AUDIO_CHANNELS)
      .format(OUTPUT_FORMAT)
      .on('start', (commandLine) => {
        console.log('[AudioConverter] FFmpeg command:', commandLine);
      })
      .on('end', () => {
        console.log('[AudioConverter] Conversion successful:', outputPath);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('[AudioConverter] Conversion failed:', err.message);
        reject(new Error(`Failed to convert audio to OPUS: ${err.message}`));
      })
      .save(outputPath);
  });
}

/**
 * Converts MP3 to OPUS with automatic output path generation
 * 
 * @param {string} inputPath - Path to input MP3 file
 * @returns {Promise<string>} Path to converted file
 */
async function convertMp3ToOpusAuto(inputPath) {
  const dir = path.dirname(inputPath);
  const basename = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(dir, `${basename}.ogg`);
  
  return convertMp3ToOpus(inputPath, outputPath);
}

module.exports = {
  convertMp3ToOpus,
  convertMp3ToOpusAuto
};
