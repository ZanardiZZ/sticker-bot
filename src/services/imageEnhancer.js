/**
 * Image enhancer service
 *
 * Provides helpers to upscale images using a local AI model (Real-ESRGAN compatible
 * binaries) and gracefully falls back to Lanczos3 via sharp when the AI backend is not
 * available. The AI runner can be configured through environment variables or injected
 * for testing purposes.
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { spawn } = require('child_process');

const DEFAULT_MODEL_NAME = process.env.REAL_ESRGAN_MODEL || 'realesrgan-x4plus';
const DEFAULT_EXECUTABLE = process.env.REAL_ESRGAN_BIN || process.env.AI_UPSCALE_BIN;

function ensureSharpInstance(instance) {
  if (!instance || typeof instance !== 'function') {
    throw new Error('[SERVICE:ImageEnhancer] sharp dependency inválida.');
  }
  return instance;
}

function createLanczosUpscaler(sharpInstance) {
  const kernel = (sharpInstance.kernel && sharpInstance.kernel.lanczos3) || 'lanczos3';

  return async function upscaleWithLanczos(buffer, { factor, format }) {
    const image = sharpInstance(buffer);
    const metadata = await image.metadata().catch((error) => {
      const wrapped = new Error('metadata_incompleta');
      wrapped.cause = error;
      throw wrapped;
    });

    if (!metadata || !metadata.width || !metadata.height) {
      throw new Error('metadata_incompleta');
    }

    const targetWidth = Math.max(1, Math.round(metadata.width * factor));
    const targetHeight = Math.max(1, Math.round(metadata.height * factor));

    image.resize({
      width: targetWidth,
      height: targetHeight,
      kernel
    });

    if (format) {
      image.toFormat(format);
    }

    const { data, info } = await image.toBuffer({ resolveWithObject: true });

    return {
      buffer: data,
      info: {
        ...info,
        width: info?.width ?? targetWidth,
        height: info?.height ?? targetHeight,
        scaleFactor: factor,
        engine: 'lanczos3'
      }
    };
  };
}

function parseExtraArgs(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter(Boolean).map(String);
  }

  if (typeof value === 'string') {
    return value
      .split(' ')
      .map(part => part.trim())
      .filter(Boolean);
  }

  return [];
}

function createRealEsrganRunner(deps = {}) {
  const sharpInstance = ensureSharpInstance(deps.sharp || sharp);
  const executablePath = deps.executablePath || DEFAULT_EXECUTABLE;

  if (!executablePath) {
    return null;
  }

  const spawnFn = deps.spawn || spawn;
  const fsPromises = (deps.fs && deps.fs.promises) || fs.promises;
  const osModule = deps.os || os;
  const pathModule = deps.path || path;
  const uuid = deps.uuid || randomUUID;
  const modelName = deps.modelName || DEFAULT_MODEL_NAME;
  const extraArgs = parseExtraArgs(deps.extraArgs || process.env.REAL_ESRGAN_EXTRA_ARGS);

  return async function runRealEsrgan(buffer, { factor, format }) {
    const workDir = pathModule.join(osModule.tmpdir(), `ai-upscale-${uuid()}`);
    const cleanup = async () => {
      await fsPromises.rm(workDir, { recursive: true, force: true }).catch(() => {});
    };

    await fsPromises.mkdir(workDir, { recursive: true });

    try {
      const inputPath = pathModule.join(workDir, 'input.png');
      const outputPath = pathModule.join(workDir, 'output.png');

      const normalizedBuffer = await sharpInstance(buffer).toFormat('png').toBuffer();
      await fsPromises.writeFile(inputPath, normalizedBuffer);

      const args = [
        '-i', inputPath,
        '-o', outputPath,
        '-n', modelName,
        '-s', String(factor)
      ].concat(extraArgs);

      await new Promise((resolve, reject) => {
        const child = spawnFn(executablePath, args, { stdio: ['ignore', 'inherit', 'pipe'] });
        let stderr = '';

        if (child.stderr) {
          child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
          });
        }

        child.once('error', reject);
        child.once('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            const err = new Error(`[SERVICE:ImageEnhancer] AI upscale retornou código ${code}`);
            err.code = code;
            err.stderr = stderr;
            reject(err);
          }
        });
      });

      const aiOutput = await fsPromises.readFile(outputPath);

      let finalBuffer = aiOutput;
      if (format && format !== 'png') {
        finalBuffer = await sharpInstance(aiOutput).toFormat(format).toBuffer();
      }

      const finalInfo = await sharpInstance(finalBuffer).metadata().catch(() => ({ format: format || 'png' }));

      return {
        buffer: finalBuffer,
        info: {
          format: format || finalInfo?.format || 'png',
          width: finalInfo?.width,
          height: finalInfo?.height,
          scaleFactor: factor,
          engine: 'ai'
        }
      };
    } finally {
      await cleanup();
    }
  };
}

/**
 * Creates an image enhancer with the provided dependencies.
 * @param {object} [deps]
 * @param {import('sharp')} [deps.sharp]
 * @param {(buffer: Buffer, options: object) => Promise<{buffer: Buffer, info: object}>} [deps.aiRunner]
 * @returns {{ enhanceImage: (buffer: Buffer, options?: object) => Promise<{buffer: Buffer, info: object}> }}
 */
function createImageEnhancer(deps = {}) {
  const sharpInstance = ensureSharpInstance(deps.sharp || sharp);
  const lanczosUpscale = createLanczosUpscaler(sharpInstance);
  const aiRunner = typeof deps.aiRunner === 'function' ? deps.aiRunner : createRealEsrganRunner({
    sharp: sharpInstance,
    executablePath: deps.executablePath,
    spawn: deps.spawn,
    fs: deps.fs,
    os: deps.os,
    path: deps.path,
    uuid: deps.uuid,
    modelName: deps.modelName,
    extraArgs: deps.extraArgs
  });

  /**
   * Upscales an image buffer prioritising AI when configured.
   * @param {Buffer} buffer
   * @param {object} [options]
   * @param {number} [options.factor=2]
   * @param {string} [options.format]
   * @param {'ai'|'lanczos'|'auto'} [options.engine='ai']
   * @param {boolean} [options.allowFallback=true]
   * @returns {Promise<{buffer: Buffer, info: object}>}
   */
  async function enhanceImage(buffer, options = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new TypeError('[SERVICE:ImageEnhancer] buffer deve ser um Buffer com dados.');
    }

    const {
      factor = 2,
      format,
      engine = 'ai',
      allowFallback = true
    } = options;

    if (!Number.isFinite(factor) || factor <= 1) {
      throw new RangeError('[SERVICE:ImageEnhancer] factor deve ser um número maior que 1.');
    }

    if (engine === 'lanczos') {
      return lanczosUpscale(buffer, { factor, format });
    }

    if (engine === 'ai' || engine === 'auto') {
      if (aiRunner) {
        try {
          return await aiRunner(buffer, { factor, format });
        } catch (error) {
          console.warn('[SERVICE:ImageEnhancer] Falha no upscale com IA, aplicando fallback:', error?.message || error);
          if (!allowFallback) {
            throw new Error('[SERVICE:ImageEnhancer] Falha no upscale com IA e fallback desabilitado.');
          }
        }
      } else if (!allowFallback) {
        throw new Error('[SERVICE:ImageEnhancer] Upscale por IA não configurado.');
      }
    }

    try {
      return await lanczosUpscale(buffer, { factor, format });
    } catch (error) {
      if (error && error.message === 'metadata_incompleta') {
        throw new Error('[SERVICE:ImageEnhancer] Não foi possível ler a imagem para aplicar upscale.');
      }

      console.error('[SERVICE:ImageEnhancer] Falha ao ampliar imagem:', error?.message || error);
      throw new Error('[SERVICE:ImageEnhancer] Erro ao ampliar imagem.');
    }
  }

  return {
    enhanceImage
  };
}

const defaultEnhancer = createImageEnhancer();

module.exports = {
  createImageEnhancer,
  enhanceImage: defaultEnhancer.enhanceImage,
  createRealEsrganRunner
};
