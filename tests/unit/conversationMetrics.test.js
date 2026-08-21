const { ConversationMetrics } = require('../../src/services/conversationMetrics');
function assert(condition, message) { if (!condition) throw new Error(`Assertion failed: ${message}`); }
const tests = [{ name: 'records separate stage health and percentiles', fn: async () => {
  const metrics = new ConversationMetrics();
  metrics.start('ai_primary')('success');
  metrics.start('runtime_total')('timeout');
  const snapshot = metrics.snapshot();
  assert(snapshot.stages.ai_primary.count === 1, 'primary count');
  assert(snapshot.stages.ai_primary.success === 1, 'primary success');
  assert(snapshot.stages.runtime_total.timeout === 1, 'runtime timeout');
  assert(snapshot.stages.runtime_total.p95_ms >= 0, 'runtime percentile');
}}];
module.exports = { tests };
