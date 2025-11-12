/**
 * Background removal service using TensorFlow.js and Sharp.
 * Provides utilities to segment foreground subjects and return
 * transparent PNG buffers with the detected foreground preserved.
 */

const tf = require('@tensorflow/tfjs-node');
const sharp = require('sharp');

let defaultLoader = null;

/**
 * Lazily resolves the default BodyPix loader.
 * @returns {Promise<object>} Promise resolving to the segmentation model
 */
async function resolveDefaultLoader() {
  if (!defaultLoader) {
    defaultLoader = async () => {
      let bodyPix;
      try {
        bodyPix = require('@tensorflow-models/body-pix');
      } catch (error) {
        console.warn('[SERVICE:BackgroundRemoval] @tensorflow-models/body-pix ausente. Aplicando fallback heurístico.');
        return {
          async segmentPerson(tensor, options = {}) {
            // The options parameter is ignored in this heuristic fallback.
            const [height, width] = tensor.shape;
            const grayscaleTensor = tf.tidy(() => tf.mean(tf.cast(tensor, 'float32'), 2));
            const grayscaleData = await grayscaleTensor.data();
            grayscaleTensor.dispose();

            let borderSum = 0;
            let borderCount = 0;

            const accumulate = (x, y) => {
              const idx = (y * width) + x;
              borderSum += grayscaleData[idx];
              borderCount += 1;
            };

            for (let x = 0; x < width; x += 1) {
              accumulate(x, 0);
              accumulate(x, height - 1);
            }

            for (let y = 1; y < height - 1; y += 1) {
              accumulate(0, y);
              accumulate(width - 1, y);
            }

            const borderMean = borderCount > 0 ? borderSum / borderCount : 0;
            const threshold = borderMean - 15;

            const mask = new Uint8Array(width * height);
            for (let y = 0; y < height; y += 1) {
              for (let x = 0; x < width; x += 1) {
                const idx = (y * width) + x;
                const value = grayscaleData[idx];
                mask[idx] = value <= threshold ? 1 : 0;
              }
            }

            return { data: mask, width, height };
          }
        };
      }
      return bodyPix.load({
        architecture: 'MobileNetV1',
        outputStride: 16,
        multiplier: 0.75,
        quantBytes: 2
      });
    };
  }

  return defaultLoader;
}

/**
 * Creates a background removal service with injectable dependencies.
 * @param {object} [options] - Service configuration
 * @param {typeof tf} [options.tfLib] - TensorFlow library implementation
 * @param {typeof sharp} [options.sharpLib] - Sharp instance to manipulate images
 * @param {Function} [options.modelLoader] - Custom loader that resolves to a segmentation model
 * @returns {{ removeBackground: Function, setModelLoader: Function, clearModelCache: Function }}
 */
function createBackgroundRemovalService({ tfLib = tf, sharpLib = sharp, modelLoader: initialLoader } = {}) {
  let loader = initialLoader || null;
  let modelPromise = null;

  function validateBuffer(input) {
    if (!Buffer.isBuffer(input)) {
      throw new TypeError('O parâmetro "buffer" deve ser um Buffer.');
    }
    if (input.length === 0) {
      throw new Error('O buffer recebido está vazio.');
    }
  }

  async function ensureModel() {
    if (!modelPromise) {
      const activeLoader = loader || await resolveDefaultLoader();
      modelPromise = Promise.resolve(activeLoader()).catch(error => {
        modelPromise = null;
        throw error;
      });
    }
    return modelPromise;
  }

  /**
   * Allows overriding the model loader (useful for tests).
   * @param {Function} newLoader - Function returning a segmentation model
   */
  function setModelLoader(newLoader) {
    if (typeof newLoader !== 'function') {
      throw new TypeError('O carregador de modelo deve ser uma função.');
    }
    loader = newLoader;
    modelPromise = null;
  }

  /**
   * Clears cached model so a new one is loaded on next request.
   */
  function clearModelCache() {
    modelPromise = null;
  }

  /**
   * Generates a transparency mask based on the segmentation output and
   * composites it with the original image.
   *
   * @param {Buffer} buffer - Original image buffer
   * @returns {Promise<Buffer>} Buffer containing the PNG with transparent background
   */
  async function removeBackground(buffer) {
    validateBuffer(buffer);

    const model = await ensureModel();

    let tensor = null;

    try {
      tensor = tfLib.node.decodeImage(buffer, 3);
      const segmentation = await model.segmentPerson(tensor, {
        internalResolution: 'medium',
        segmentationThreshold: 0.7,
        maxDetections: 1
      });

      const maskData = segmentation?.data;
      const maskWidth = segmentation?.width || tensor.shape?.[1];
      const maskHeight = segmentation?.height || tensor.shape?.[0];

      if (!maskData || !maskWidth || !maskHeight) {
        throw new Error('Resultado de segmentação inválido.');
      }

      const totalPixels = maskWidth * maskHeight;
      if (maskData.length < totalPixels) {
        throw new Error('Máscara retornada não corresponde às dimensões da imagem.');
      }

      const alphaChannel = Buffer.allocUnsafe(totalPixels);
      let hasForeground = false;
      for (let i = 0; i < totalPixels; i += 1) {
        const value = maskData[i] ? 255 : 0;
        if (value === 255) {
          hasForeground = true;
        }
        alphaChannel[i] = value;
      }

      if (!hasForeground) {
        console.warn('[SERVICE:BackgroundRemoval] Máscara sem pixels de primeiro plano detectada.');
      }

      const composed = await sharpLib(buffer)
        .resize(maskWidth, maskHeight, { fit: 'fill' })
        .toColourspace('rgb')
        .joinChannel(alphaChannel, { raw: { width: maskWidth, height: maskHeight, channels: 1 } })
        .png()
        .toBuffer();

      return composed;
    } catch (error) {
      console.error('[SERVICE:BackgroundRemoval] Falha ao remover fundo:', error?.message || error);
      throw new Error(`Falha ao remover o fundo da imagem: ${error?.message || error}`);
    } finally {
      if (tensor) {
        try {
          tensor.dispose?.();
        } catch (disposeError) {
          console.warn('[SERVICE:BackgroundRemoval] Falha ao descartar tensor:', disposeError?.message || disposeError);
        }
        // Removed redundant double disposal of tensor
      }
    }
  }

  return {
    removeBackground,
    setModelLoader,
    clearModelCache
  };
}

const defaultService = createBackgroundRemovalService();

module.exports = {
  createBackgroundRemovalService,
  removeBackground: defaultService.removeBackground,
  setModelLoader: defaultService.setModelLoader,
  clearModelCache: defaultService.clearModelCache
};
