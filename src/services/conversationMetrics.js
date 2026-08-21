const fs = require('fs');
const path = require('path');

const MAX_SAMPLES = 200;
const metricsPath = process.env.CONVERSATION_METRICS_PATH
  || path.join(process.cwd(), 'storage/data/memory/conversation-health.json');

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[index]);
}

class ConversationMetrics {
  constructor() {
    this.startedAt = Date.now();
    this.sequence = 0;
    this.inFlight = new Map();
    this.stages = new Map();
    this.runtimeTimeoutMs = Number(process.env.CONVERSATION_RESPONSE_TIMEOUT_MS) || 12000;
  }

  start(stage, metadata = {}) {
    const id = ++this.sequence;
    const startedAt = process.hrtime.bigint();
    this.inFlight.set(id, { stage, startedAt });
    return (status = 'success', extra = {}) => this.finish(id, status, extra, metadata);
  }

  finish(id, status = 'success', extra = {}, metadata = {}) {
    const active = this.inFlight.get(id);
    if (!active) return null;
    this.inFlight.delete(id);
    const durationMs = Number(process.hrtime.bigint() - active.startedAt) / 1e6;
    const stage = active.stage;
    const entry = this.stages.get(stage) || { count: 0, success: 0, error: 0, timeout: 0, samples_ms: [] };
    entry.count += 1;
    if (status === 'success') entry.success += 1;
    else if (status === 'timeout') entry.timeout += 1;
    else entry.error += 1;
    entry.samples_ms.push(Math.round(durationMs));
    if (entry.samples_ms.length > MAX_SAMPLES) entry.samples_ms.shift();
    this.stages.set(stage, entry);

    const event = {
      type: 'conversation_stage',
      stage,
      status,
      duration_ms: Math.round(durationMs),
      ...(metadata.request_id ? { request_id: metadata.request_id } : {}),
      ...extra
    };
    console.info(`[ConversationHealth] ${JSON.stringify(event)}`);
    this.persist();
    return durationMs;
  }

  setRuntimeTimeout(timeoutMs) {
    if (Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0) {
      this.runtimeTimeoutMs = Number(timeoutMs);
    }
  }

  snapshot() {
    const stages = {};
    for (const [stage, entry] of this.stages.entries()) {
      const samples = entry.samples_ms;
      stages[stage] = {
        count: entry.count,
        success: entry.success,
        error: entry.error,
        timeout: entry.timeout,
        last_ms: samples.length ? samples[samples.length - 1] : null,
        p50_ms: percentile(samples, 50),
        p95_ms: percentile(samples, 95),
        max_ms: samples.length ? Math.max(...samples) : null
      };
    }
    return {
      schema: 1,
      generated_at: new Date().toISOString(),
      started_at: new Date(this.startedAt).toISOString(),
      runtime_timeout_ms: this.runtimeTimeoutMs,
      in_flight: this.inFlight.size,
      stages
    };
  }

  persist() {
    try {
      fs.mkdirSync(path.dirname(metricsPath), { recursive: true });
      const tmp = `${metricsPath}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, `${JSON.stringify(this.snapshot())}\n`, { mode: 0o640 });
      fs.renameSync(tmp, metricsPath);
    } catch (error) {
      console.warn(`[ConversationHealth] snapshot_persist_failed ${error?.message || error}`);
    }
  }

  reset() {
    this.startedAt = Date.now();
    this.inFlight.clear();
    this.stages.clear();
    this.persist();
  }
}

const conversationMetrics = new ConversationMetrics();

module.exports = { ConversationMetrics, conversationMetrics, metricsPath };
