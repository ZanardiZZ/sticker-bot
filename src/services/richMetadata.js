const RICH_METADATA_FIELDS = [
  'visual_action',
  'emotion',
  'ocr_text',
  'cultural_reference',
  'usage_intent',
  'context_signals'
];

function normalizeRichMetadata(metadata = {}, { ocrText } = {}) {
  const normalized = {};
  for (const field of RICH_METADATA_FIELDS) {
    const sourceValue = field === 'ocr_text' && ocrText !== undefined ? ocrText : metadata?.[field];
    const value = String(sourceValue || '').trim();
    if (value) normalized[field] = value.slice(0, 2000);
  }
  return normalized;
}


function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\$&');
}

function stripOcrFromDescription(description, ocrText) {
  let cleaned = String(description || '').trim();
  const lines = String(ocrText || '').split(/[\n|;]/u).map(value => value.trim()).filter(value => value.length >= 2);
  for (const line of [...new Set(lines)].sort((a, b) => b.length - a.length)) {
    cleaned = cleaned.replace(new RegExp(`(?:[\s\"'“”‘’:\-–—]*)${escapeRegExp(line)}`, 'giu'), '');
  }
  return cleaned.replace(/\s+([,.;:!?])/gu, '$1').replace(/\s{2,}/gu, ' ').trim();
}

function mergeRichMetadata(items = []) {
  const merged = {};
  for (const field of RICH_METADATA_FIELDS) {
    const values = [];
    for (const item of items) {
      const value = normalizeRichMetadata(item)[field];
      if (value && !values.includes(value)) values.push(value);
    }
    if (values.length) merged[field] = values.join(' | ').slice(0, 2000);
  }
  return merged;
}

module.exports = { RICH_METADATA_FIELDS, normalizeRichMetadata, mergeRichMetadata, stripOcrFromDescription };
