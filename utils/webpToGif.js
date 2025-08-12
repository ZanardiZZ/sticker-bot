const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if(err) reject(stderr || err);
      else resolve(stdout);
    });
  });
}

async function webpToGif(inputPath) {
  const tmpDir = path.join(__dirname, 'temp_frames');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

  // Remove arquivos antigos (se houver)
  fs.readdirSync(tmpDir).forEach(f => fs.unlinkSync(path.join(tmpDir, f)));

  // Pega info para saber número de frames
  const info = await execPromise(`webpmux -info ${inputPath}`);
  const matches = info.match(/Number of frames: (\d+)/);
  if (!matches) throw new Error('Não foi possível obter o número de frames');
  const frameCount = parseInt(matches[1], 10);

  // Extrai cada frame
  for (let i = 1; i <= frameCount; i++) {
    const framePath = path.join(tmpDir, `frame${i}.webp`);
    await execPromise(`webpmux -get frame ${i} -o ${framePath} ${inputPath}`);
  }

  // Converte frames para PNG
  const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.webp'));
  await Promise.all(files.map((f) => {
    const input = path.join(tmpDir, f);
    const output = path.join(tmpDir, f.replace('.webp', '.png'));
    return execPromise(`dwebp ${input} -o ${output}`);
  }));

  // Remove arquivos .webp dos frames
  files.forEach(f => fs.unlinkSync(path.join(tmpDir, f)));

  // Gera GIF com imagemagick
  const gifPath = `${inputPath}.gif`;
  await execPromise(`convert -delay 10 -loop 0 ${tmpDir}/*.png ${gifPath}`);

  // Limpa PNGs temporários
  fs.readdirSync(tmpDir).forEach(f => fs.unlinkSync(path.join(tmpDir, f)));

  return gifPath;
}

module.exports = { webpToGif };