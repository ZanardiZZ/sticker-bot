#!/usr/bin/env node

const path = require('path');
const { runTestSuite, assert, assertEqual } = require('../helpers/testUtils');

function createSharpMock({ metadata, bufferResult }) {
  const resizeCalls = [];
  const toFormatCalls = [];
  const toBufferCalls = [];
  const metadataCalls = [];

  function sharpMock(buffer) {
    const instance = {
      _buffer: buffer,
      metadata: async () => {
        metadataCalls.push(buffer);
        if (metadata instanceof Error) {
          throw metadata;
        }
        return metadata;
      },
      resize: ({ width, height, kernel }) => {
        resizeCalls.push({ width, height, kernel });
        return instance;
      },
      toFormat: (fmt) => {
        toFormatCalls.push(fmt);
        return instance;
      },
      toBuffer: async (options) => {
        toBufferCalls.push(options);
        return bufferResult;
      }
    };

    return instance;
  }

  sharpMock.kernel = { lanczos3: 'lanczos3' };

  return {
    sharpMock,
    resizeCalls,
    toFormatCalls,
    toBufferCalls,
    metadataCalls
  };
}

const servicePath = path.resolve(__dirname, '..', '..', 'services/imageEnhancer.js');

const tests = [
  {
    name: 'Throws when buffer is not provided',
    fn: async () => {
      delete require.cache[servicePath];
      const service = require('../../services/imageEnhancer');

      let errorCaught = null;
      try {
        await service.enhanceImage(null);
      } catch (error) {
        errorCaught = error;
      }

      assert(errorCaught instanceof TypeError, 'Should throw TypeError for invalid buffer');
    }
  },
  {
    name: 'Uses AI runner by default when available',
    fn: async () => {
      delete require.cache[servicePath];
      const { createImageEnhancer } = require('../../services/imageEnhancer');

      const expectedBuffer = Buffer.from('ai-output');
      const enhanceOptions = [];

      const enhancer = createImageEnhancer({
        aiRunner: async (buffer, options) => {
          enhanceOptions.push({ buffer, options });
          return {
            buffer: expectedBuffer,
            info: { format: 'png', width: 256, height: 256, scaleFactor: options.factor, engine: 'ai' }
          };
        },
        sharp: () => {
          throw new Error('Lanczos should not be called when AI succeeds');
        }
      });

      const input = Buffer.from('original');
      const result = await enhancer.enhanceImage(input, { factor: 4 });

      assertEqual(enhanceOptions.length, 1, 'AI runner should be invoked once');
      assert(enhanceOptions[0].buffer.equals(input), 'Original buffer should be provided to AI runner');
      assertEqual(enhanceOptions[0].options.factor, 4, 'Factor should be forwarded to AI runner');
      assert(result.buffer.equals(expectedBuffer), 'AI buffer should be returned');
      assertEqual(result.info.engine, 'ai', 'Engine should be AI');
    }
  },
  {
    name: 'Falls back to Lanczos when AI is not configured',
    fn: async () => {
      const { sharpMock, resizeCalls, toFormatCalls, toBufferCalls } = createSharpMock({
        metadata: { width: 100, height: 60 },
        bufferResult: { data: Buffer.from('lanczos-result'), info: { width: 200, height: 120, format: 'png' } }
      });

      delete require.cache[servicePath];
      const { createImageEnhancer } = require('../../services/imageEnhancer');
      const enhancer = createImageEnhancer({ sharp: sharpMock, aiRunner: null });

      const result = await enhancer.enhanceImage(Buffer.from('original'));

      assert(resizeCalls.length === 1, 'Lanczos resize should be performed');
      assertEqual(resizeCalls[0].kernel, 'lanczos3', 'Lanczos kernel should be used');
      assertEqual(toFormatCalls.length, 0, 'Default format should be preserved');
      assertEqual(toBufferCalls[0].resolveWithObject, true, 'Result should include info');
      assert(result.buffer.equals(Buffer.from('lanczos-result')), 'Lanczos output should be returned');
      assertEqual(result.info.engine, 'lanczos3', 'Engine should be marked as Lanczos');
    }
  },
  {
    name: 'Falls back to Lanczos when AI errors and fallback is allowed',
    fn: async () => {
      const { sharpMock, resizeCalls } = createSharpMock({
        metadata: { width: 40, height: 40 },
        bufferResult: { data: Buffer.from('fallback'), info: { width: 80, height: 80, format: 'png' } }
      });

      delete require.cache[servicePath];
      const { createImageEnhancer } = require('../../services/imageEnhancer');

      let aiAttempts = 0;
      const enhancer = createImageEnhancer({
        sharp: sharpMock,
        aiRunner: async () => {
          aiAttempts += 1;
          throw new Error('AI exploded');
        }
      });

      const result = await enhancer.enhanceImage(Buffer.from('source'), { factor: 2 });

      assertEqual(aiAttempts, 1, 'AI runner should be attempted once');
      assertEqual(resizeCalls.length, 1, 'Lanczos fallback should run');
      assertEqual(result.info.engine, 'lanczos3', 'Fallback engine should be Lanczos');
    }
  },
  {
    name: 'Throws when AI fails and fallback is disabled',
    fn: async () => {
      delete require.cache[servicePath];
      const { createImageEnhancer } = require('../../services/imageEnhancer');

      const enhancer = createImageEnhancer({
        sharp: () => {
          throw new Error('Sharp should not be called when fallback is disabled');
        },
        aiRunner: async () => {
          throw new Error('AI failed');
        }
      });

      let errorCaught = null;
      try {
        await enhancer.enhanceImage(Buffer.from('payload'), { allowFallback: false });
      } catch (error) {
        errorCaught = error;
      }

      assert(errorCaught instanceof Error, 'Error should be thrown when fallback is disabled');
      assert(errorCaught.message.includes('Falha no upscale com IA'), 'Message should indicate AI failure');
    }
  },
  {
    name: 'Throws when Lanczos fallback cannot read metadata',
    fn: async () => {
      const metadataError = new Error('bad metadata');
      const { sharpMock } = createSharpMock({
        metadata: metadataError,
        bufferResult: { data: Buffer.alloc(0), info: {} }
      });

      delete require.cache[servicePath];
      const { createImageEnhancer } = require('../../services/imageEnhancer');

      const enhancer = createImageEnhancer({ sharp: sharpMock, aiRunner: null });

      let errorCaught = null;
      try {
        await enhancer.enhanceImage(Buffer.from('input'));
      } catch (error) {
        errorCaught = error;
      }

      assert(errorCaught instanceof Error, 'Should throw when metadata is missing');
      assert(errorCaught.message.includes('Não foi possível ler a imagem'), 'Error should mention inability to read image');
    }
  },
  {
    name: 'AI runner factory returns null when executable is missing',
    fn: async () => {
      delete require.cache[servicePath];
      const { createRealEsrganRunner } = require('../../services/imageEnhancer');

      const runner = createRealEsrganRunner({ sharp: (input) => input, executablePath: null });
      assertEqual(runner, null, 'Runner should be null when executable is not provided');
    }
  }
];

if (require.main === module) {
  runTestSuite('Image Enhancer Service Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tests };
