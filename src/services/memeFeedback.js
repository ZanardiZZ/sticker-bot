const POSITIVE_REACTIONS = new Set(['🎯', '👍', '❤️', '❤', '🔥', '😂', '😍', '👏']);
const NEGATIVE_REACTIONS = new Set(['👎', '😐', '😕', '😞', '😡', '🤮', '💩']);

function classifyMemeFeedback(emoji) {
  const value = String(emoji || '').trim();
  if (!value) return null;
  if (POSITIVE_REACTIONS.has(value)) return 'positive';
  if (NEGATIVE_REACTIONS.has(value)) return 'negative';
  return null;
}

function sanitizeExample(value, max = 220) {
  return String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function buildMemeFeedbackDirective({ positive = 0, negative = 0, positiveExamples = [], negativeExamples = [] } = {}) {
  const total = Number(positive) + Number(negative);
  if (!total) return '';
  const lines = ['Feedback agregado de criações anteriores (use como orientação, não como regra rígida):'];
  if (positive > 0) lines.push(`- ${positive} feedback(s) positivo(s): preserve clareza visual, humor e composição dos exemplos aprovados.`);
  if (negative > 0) lines.push(`- ${negative} feedback(s) negativo(s): evite repetir padrões dos exemplos rejeitados.`);
  const approved = positiveExamples.map((example) => sanitizeExample(example)).filter(Boolean).slice(0, 2);
  const rejected = negativeExamples.map((example) => sanitizeExample(example)).filter(Boolean).slice(0, 2);
  if (approved.length) lines.push(`- Padrões aprovados: ${approved.join(' | ')}`);
  if (rejected.length) lines.push(`- Padrões rejeitados: ${rejected.join(' | ')}`);
  return lines.join('\n');
}

module.exports = { POSITIVE_REACTIONS, NEGATIVE_REACTIONS, classifyMemeFeedback, buildMemeFeedbackDirective };
