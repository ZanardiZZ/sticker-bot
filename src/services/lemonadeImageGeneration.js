const fs = require('fs');

const DEFAULT_BASE_URL = 'http://YOUR_IMAGE_HOST:13305';
const DEFAULT_MODEL = 'user.Z-Image-Turbo-Unsloth-IQ4';
const DEFAULT_STEPS = 8;
const DEFAULT_CFG_SCALE = 1;
const DEFAULT_DELAY_MS = 15000;
const DEFAULT_MAX_QUEUE = 3;
const DEFAULT_TIMEOUT_MS = 900000;
const DEFAULT_RETRIES = 1;
const DEFAULT_USER_COOLDOWN_MS = 60000;
const DEFAULT_MAX_LOAD = 8;
const DEFAULT_PRESSURE_WAIT_MS = 180000;
const DEFAULT_PRESSURE_POLL_MS = 5000;

function integerEnv(name, fallback, min = 0) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value >= min ? value : fallback;
}

function numberEnv(name, fallback, min = 0) {
  const value = Number.parseFloat(process.env[name] || '');
  return Number.isFinite(value) && value >= min ? value : fallback;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class ImageGenerationQueue {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || process.env.LEMONADE_IMAGE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.apiKey = options.apiKey || process.env.LEMONADE_IMAGE_API_KEY || '';
    this.model = options.model || process.env.LEMONADE_IMAGE_MODEL || DEFAULT_MODEL;
    this.steps = options.steps ?? integerEnv('LEMONADE_IMAGE_STEPS', DEFAULT_STEPS, 1);
    this.cfgScale = options.cfgScale ?? numberEnv('LEMONADE_IMAGE_CFG_SCALE', DEFAULT_CFG_SCALE, 0);
    this.delayMs = options.delayMs ?? integerEnv('LEMONADE_IMAGE_DELAY_MS', DEFAULT_DELAY_MS, 0);
    this.maxQueue = options.maxQueue ?? integerEnv('LEMONADE_IMAGE_MAX_QUEUE', DEFAULT_MAX_QUEUE, 1);
    this.timeoutMs = options.timeoutMs ?? integerEnv('LEMONADE_IMAGE_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, 1000);
    this.retries = options.retries ?? integerEnv('LEMONADE_IMAGE_RETRIES', DEFAULT_RETRIES, 0);
    this.userCooldownMs = options.userCooldownMs ?? integerEnv('LEMONADE_IMAGE_USER_COOLDOWN_MS', DEFAULT_USER_COOLDOWN_MS, 0);
    this.maxLoad = options.maxLoad ?? numberEnv('LEMONADE_IMAGE_MAX_LOAD', DEFAULT_MAX_LOAD, 0);
    this.pressureWaitMs = options.pressureWaitMs ?? integerEnv('LEMONADE_IMAGE_PRESSURE_WAIT_MS', DEFAULT_PRESSURE_WAIT_MS, 0);
    this.pressurePollMs = options.pressurePollMs ?? integerEnv('LEMONADE_IMAGE_PRESSURE_POLL_MS', DEFAULT_PRESSURE_POLL_MS, 1);
    this.rejectOnDState = options.rejectOnDState ?? process.env.LEMONADE_IMAGE_REJECT_ON_D_STATE !== 'false';
    this.queue = [];
    this.running = false;
    this.lastFinishedAt = 0;
    this.nextId = 1;
    this.cooldowns = new Map();
    this.stats = { accepted: 0, completed: 0, failed: 0, rejected: 0 };
  }

  getStats() {
    return {
      waiting: this.queue.length,
      processing: this.running ? 1 : 0,
      capacity: this.maxQueue,
      delayMs: this.delayMs,
      steps: this.steps,
      cfgScale: this.cfgScale,
      accepted: this.stats.accepted,
      completed: this.stats.completed,
      failed: this.stats.failed,
      rejected: this.stats.rejected
    };
  }

  async drain() {
    while (this.running || this.queue.length > 0) {
      await sleep(10);
    }
  }

  _pruneCooldowns(now = Date.now()) {
    for (const [key, expiresAt] of this.cooldowns) {
      if (expiresAt <= now) this.cooldowns.delete(key);
    }
  }

  _systemPressure() {
    try {
      const load1 = Number.parseFloat(fs.readFileSync('/proc/loadavg', 'utf8').split(/\s+/)[0]);
      let dStateCount = 0;
      if (this.rejectOnDState) {
        for (const entry of fs.readdirSync('/proc')) {
          if (!/^\d+$/.test(entry)) continue;
          try {
            const stat = fs.readFileSync(`/proc/${entry}/stat`, 'utf8');
            if (/^\d+ \(.*\) D /.test(stat)) dStateCount++;
          } catch (_) {
            // Process may exit while it is being inspected.
          }
        }
      }
      return { load1, dStateCount };
    } catch (_) {
      return null;
    }
  }

  enqueue(prompt, options = {}) {
    if (!this.apiKey) {
      const error = new Error('LEMONADE_IMAGE_API_KEY não configurada');
      error.code = 'IMAGE_BACKEND_NOT_CONFIGURED';
      throw error;
    }
    if (!prompt || !String(prompt).trim()) {
      throw new Error('Prompt vazio para geração de imagem');
    }

    const now = Date.now();
    const requesterId = options.requesterId ? String(options.requesterId) : null;
    this._pruneCooldowns(now);
    if (requesterId && this.userCooldownMs > 0) {
      const expiresAt = this.cooldowns.get(requesterId) || 0;
      if (expiresAt > now) {
        const error = new Error('Aguarde antes de solicitar outra imagem.');
        error.code = 'IMAGE_USER_COOLDOWN';
        error.retryAfterMs = expiresAt - now;
        this.stats.rejected++;
        throw error;
      }
      this.cooldowns.set(requesterId, now + this.userCooldownMs);
    }

    if (this.queue.length >= this.maxQueue) {
      const error = new Error('A fila de geração está cheia. Tente novamente mais tarde.');
      error.code = 'IMAGE_QUEUE_FULL';
      this.stats.rejected++;
      throw error;
    }

    const job = {
      id: `image-${Date.now()}-${this.nextId++}`,
      prompt: String(prompt).trim(),
      options,
      resolve: null,
      reject: null,
      addedAt: now
    };
    const promise = new Promise((resolve, reject) => {
      job.resolve = resolve;
      job.reject = reject;
    });
    promise.jobId = job.id;
    promise.position = this.queue.length + (this.running ? 2 : 1);
    this.queue.push(job);
    this.stats.accepted++;
    this._drain();
    return promise;
  }

  async _drain() {
    if (this.running || this.queue.length === 0) return;
    this.running = true;
    const job = this.queue.shift();
    try {
      const sinceLast = Date.now() - this.lastFinishedAt;
      if (this.lastFinishedAt && sinceLast < this.delayMs) {
        await sleep(this.delayMs - sinceLast);
      }
      await this._waitForPressureClear();
      const result = await this._runWithRetry(job);
      this.stats.completed++;
      job.resolve(result);
    } catch (error) {
      this.stats.failed++;
      job.reject(error);
    } finally {
      this.lastFinishedAt = Date.now();
      this.running = false;
      setImmediate(() => this._drain());
    }
  }

  async _waitForPressureClear() {
    const deadline = Date.now() + this.pressureWaitMs;
    while (true) {
      const pressure = this._systemPressure();
      if (!pressure || (pressure.load1 <= this.maxLoad && pressure.dStateCount === 0)) {
        return;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        const error = new Error('Servidor sob pressão de I/O por tempo prolongado; geração adiada.');
        error.code = 'IMAGE_SYSTEM_PRESSURE_TIMEOUT';
        error.retryAfterMs = this.pressurePollMs;
        error.pressure = pressure;
        throw error;
      }
      await sleep(Math.min(this.pressurePollMs, remaining));
    }
  }

  async _runWithRetry(job) {
    let attempt = 0;
    while (true) {
      try {
        return await this._request(job.prompt);
      } catch (error) {
        const retryable = error?.retryable === true || [429, 500, 502, 503, 504].includes(error?.status);
        if (!retryable || attempt >= this.retries) throw error;
        attempt += 1;
        await sleep(Math.min(30000, 2000 * attempt));
      }
    }
  }

  async _request(prompt) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/images/generations`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          size: process.env.LEMONADE_IMAGE_SIZE || process.env.MEME_IMAGE_SIZE || '1024x1024',
          n: 1,
          steps: this.steps,
          cfg_scale: this.cfgScale,
          response_format: 'b64_json'
        }),
        signal: controller.signal
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(`Lemonade HTTP ${response.status}`);
        error.status = response.status;
        error.retryable = [429, 500, 502, 503, 504].includes(response.status);
        throw error;
      }
      const imageData = body?.data?.[0]?.b64_json;
      if (!imageData) throw new Error('Lemonade não retornou imagem');
      return { imageData, model: this.model, steps: this.steps, cfgScale: this.cfgScale };
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('Tempo limite da geração de imagem excedido');
        timeoutError.code = 'IMAGE_GENERATION_TIMEOUT';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

const defaultQueue = new ImageGenerationQueue();

module.exports = {
  ImageGenerationQueue,
  imageGenerationQueue: defaultQueue,
  getImageGenerationQueueStats: () => defaultQueue.getStats(),
  generateImage: (prompt, options) => defaultQueue.enqueue(prompt, options)
};
