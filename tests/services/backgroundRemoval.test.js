#!/usr/bin/env node

const sharp = require('sharp');
const { runTestSuite, assert, assertEqual } = require('../helpers/testUtils');

const servicePath = require.resolve('../../services/backgroundRemoval');

delete require.cache[servicePath];
const { createBackgroundRemovalService } = require('../../services/backgroundRemoval');

const tests = [
  {
    name: 'removeBackground aplica máscara gerada pelo modelo',
    fn: async () => {
      const service = createBackgroundRemovalService();
      service.setModelLoader(async () => ({
        async segmentPerson(tensor) {
          const [height, width] = tensor.shape;
          const data = new Uint8Array(width * height);
          // Mantém apenas os pixels da diagonal principal
          for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
              data[(y * width) + x] = x === y ? 1 : 0;
            }
          }
          return { data, width, height };
        }
      }));

      const input = await sharp({
        create: { width: 3, height: 3, channels: 3, background: { r: 200, g: 100, b: 50 } }
      }).png().toBuffer();

      const result = await service.removeBackground(input);
      const { data, info } = await sharp(result).raw().toBuffer({ resolveWithObject: true });

      assertEqual(info.width, 3, 'Largura deve ser preservada');
      assertEqual(info.height, 3, 'Altura deve ser preservada');
      assertEqual(info.channels, 4, 'Imagem final precisa de canal alfa');

      for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
          const alpha = data[(y * info.width + x) * 4 + 3];
          if (x === y) {
            assert(alpha === 255, 'Pixels previstos como primeiro plano devem ser opacos');
          } else {
            assert(alpha === 0, 'Pixels de fundo precisam ficar transparentes');
          }
        }
      }

      service.clearModelCache();
    }
  },
  {
    name: 'removeBackground propaga erro amigável quando modelo falha',
    fn: async () => {
      const service = createBackgroundRemovalService();
      service.setModelLoader(async () => ({
        async segmentPerson() {
          throw new Error('mocked-failure');
        }
      }));

      const input = await sharp({
        create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 255, b: 255 } }
      }).png().toBuffer();

      let captured = null;
      try {
        await service.removeBackground(input);
      } catch (error) {
        captured = error;
      }

      assert(captured instanceof Error, 'Erro precisa ser lançado');
      assert(captured.message.includes('Falha ao remover o fundo da imagem'), 'Mensagem deve orientar o usuário');
    }
  },
  {
    name: 'removeBackground rejeita entrada inválida',
    fn: async () => {
      const service = createBackgroundRemovalService();
      let captured = null;
      try {
        await service.removeBackground(null);
      } catch (error) {
        captured = error;
      }
      assert(captured instanceof TypeError, 'Entrada inválida deve lançar TypeError');
    }
  }
];

if (require.main === module) {
  runTestSuite('Background Removal Service Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tests };
