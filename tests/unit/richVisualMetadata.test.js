const { assertEqual, runTestSuite } = require('../helpers/testUtils');
const { normalizeRichMetadata, mergeRichMetadata, stripOcrFromDescription } = require('../../src/services/richMetadata');

const tests = [
  {
    name: 'normalizeRichMetadata keeps only the six bounded canonical fields',
    fn: async () => {
      const out = normalizeRichMetadata({
        visual_action: '  acena para a câmera  ',
        emotion: ' alegria ',
        ocr_text: 'TEXTO',
        cultural_reference: 'obra conhecida',
        usage_intent: 'saudação',
        context_signals: 'ambiente externo',
        ignored: 'não persistir'
      });
      assertEqual(JSON.stringify(out), JSON.stringify({
        visual_action: 'acena para a câmera',
        emotion: 'alegria',
        ocr_text: 'TEXTO',
        cultural_reference: 'obra conhecida',
        usage_intent: 'saudação',
        context_signals: 'ambiente externo'
      }));
    }
  },
  {
    name: 'stripOcrFromDescription removes OCR copied by the model from public text',
    fn: async () => {
      const out = stripOcrFromDescription('Homem segura uma placa escrita PARE.', 'PARE');
      assertEqual(out, 'Homem segura uma placa escrita.');
    }
  },
  {
    name: 'normalizeRichMetadata uses extracted text as canonical OCR',
    fn: async () => {
      const out = normalizeRichMetadata({ ocr_text: 'OCR DO METADATA' }, { ocrText: 'OCR EXTRAÍDO' });
      assertEqual(out.ocr_text, 'OCR EXTRAÍDO');
    }
  },
  {
    name: 'mergeRichMetadata combines distinct frame observations without duplicates',
    fn: async () => {
      const out = mergeRichMetadata([
        { visual_action: 'olha para a câmera', emotion: 'surpresa', ocr_text: 'OI' },
        { visual_action: 'olha para a câmera', emotion: 'alegria', ocr_text: 'OI' },
        { visual_action: 'sorri', usage_intent: 'reação positiva' }
      ]);
      assertEqual(out.visual_action, 'olha para a câmera | sorri');
      assertEqual(out.emotion, 'surpresa | alegria');
      assertEqual(out.ocr_text, 'OI');
      assertEqual(out.usage_intent, 'reação positiva');
    }
  }
];

if (require.main === module) {
  runTestSuite('Rich Visual Metadata Tests', tests).then(r => process.exit(r.failed ? 1 : 0));
}

module.exports = { tests };
