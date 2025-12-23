const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

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
      .audioCodec('libopus')
      .audioBitrate('64k')
      .audioFrequency(48000)
      .audioChannels(1)
      .format('ogg')
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
