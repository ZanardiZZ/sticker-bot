const fs = require('fs');

function isExecutable(filePath) {
  if (!filePath) return false;
  try {
    return fs.existsSync(filePath) && (fs.statSync(filePath).mode & 0o111) !== 0;
  } catch (_) {
    return false;
  }
}

function unique(values) {
  return values.filter(Boolean).filter((value, index, list) => list.indexOf(value) === index);
}

function resolveFfmpegPath() {
  let packagedPath = null;
  try { packagedPath = require('ffmpeg-static'); } catch (_) {}
  const candidates = unique([
    process.env.FFMPEG_PATH,
    '/usr/bin/ffmpeg',
    packagedPath
  ]);
  return candidates.find(isExecutable) || null;
}

function resolveFfprobePath() {
  let packagedPath = null;
  try { packagedPath = require('ffprobe-static').path; } catch (_) {}
  const candidates = unique([
    process.env.FFPROBE_PATH,
    '/usr/bin/ffprobe',
    packagedPath
  ]);
  return candidates.find(isExecutable) || null;
}

function configureFfmpeg(ffmpeg) {
  const ffmpegPath = resolveFfmpegPath();
  if (ffmpegPath && ffmpeg && typeof ffmpeg.setFfmpegPath === 'function') {
    ffmpeg.setFfmpegPath(ffmpegPath);
  }
  return ffmpegPath;
}

module.exports = { isExecutable, resolveFfmpegPath, resolveFfprobePath, configureFfmpeg };
