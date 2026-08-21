const DEFAULT_DEBOUNCE_MS = 0;
const DEFAULT_TIMEOUT_MS = 12000;
const { conversationMetrics } = require('./conversationMetrics');

function toPositiveNumber(value, fallback, minimum = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) return fallback;
  return parsed;
}

class ConversationRuntime {
  constructor({ debounceMs = DEFAULT_DEBOUNCE_MS, timeoutMs = DEFAULT_TIMEOUT_MS, logger = console } = {}) {
    this.debounceMs = toPositiveNumber(debounceMs, DEFAULT_DEBOUNCE_MS);
    this.timeoutMs = toPositiveNumber(timeoutMs, DEFAULT_TIMEOUT_MS, 1);
    conversationMetrics.setRuntimeTimeout(this.timeoutMs);
    this.logger = logger;
    this.entries = new Map();
  }

  _entry(key) {
    if (!this.entries.has(key)) {
      this.entries.set(key, {
        generation: 0,
        active: false,
        timer: null,
        waiter: null,
        latest: null
      });
    }
    return this.entries.get(key);
  }

  _resolveWaiter(entry, value) {
    if (typeof entry.waiter === 'function') {
      const resolve = entry.waiter;
      entry.waiter = null;
      resolve(value);
    }
  }

  _arm(key, entry, generation, request, run) {
    const execute = async () => {
      entry.timer = null;
      if (entry.generation !== generation) {
        this._resolveWaiter(entry, false);
        return;
      }

      entry.active = true;
      const startedAt = Date.now();
      const finishRuntimeMetric = conversationMetrics.start('runtime_total');
      const controller = new AbortController();
      let timeoutHandle;
      const guard = {
        generation,
        startedAt,
        deadlineAt: startedAt + this.timeoutMs,
        signal: controller.signal,
        isCurrent: () => entry.generation === generation,
        isExpired: () => Date.now() >= startedAt + this.timeoutMs
      };

      try {
        await Promise.race([
          Promise.resolve().then(() => run(request, guard)),
          new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => {
              controller.abort();
              reject(new Error('conversation_response_timeout'));
            }, this.timeoutMs);
          })
        ]);
        finishRuntimeMetric('success');
        this._resolveWaiter(entry, true);
      } catch (err) {
        finishRuntimeMetric(err?.message === 'conversation_response_timeout' ? 'timeout' : 'error');
        this.logger.warn(`[ConversationRuntime] run failed key=${key} reason=${err?.message || err}`);
        this._resolveWaiter(entry, false);
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        entry.active = false;
        if (entry.generation !== generation && entry.latest) {
          const next = entry.latest;
          this._arm(key, entry, entry.generation, next.request, next.run);
        } else if (!entry.timer && !entry.active) {
          this.entries.delete(key);
        }
      }
    };

    if (this.debounceMs > 0) {
      entry.timer = setTimeout(execute, this.debounceMs);
    } else {
      queueMicrotask(execute);
    }
  }

  schedule(key, request, run) {
    const entry = this._entry(key);
    entry.generation += 1;
    const generation = entry.generation;
    entry.latest = { request, run };

    if (entry.active) {
      // The active generation will be discarded and the latest request will run next.
      return Promise.resolve(true);
    }

    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
      this._resolveWaiter(entry, false);
    }

    return new Promise(resolve => {
      entry.waiter = resolve;
      this._arm(key, entry, generation, request, run);
    });
  }

  getStats() {
    return Array.from(this.entries.entries()).map(([key, entry]) => ({
      key,
      generation: entry.generation,
      active: entry.active,
      pending: Boolean(entry.timer || entry.active)
    }));
  }
}

module.exports = { ConversationRuntime, toPositiveNumber };
