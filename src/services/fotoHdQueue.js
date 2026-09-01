const DEFAULT_RATE = 0.7;

function formatDuration(seconds) {
  const value = Math.max(1, Math.ceil(seconds));
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${minutes}min ${rest}s` : `${minutes}min`;
}

class FotoHdQueue {
  constructor(options = {}) {
    this.concurrency = 1;
    this.maxWaiting = options.maxWaiting ?? 4;
    this.rate = options.rate ?? DEFAULT_RATE;
    this.items = [];
    this.active = 0;
  }

  stats() {
    return { waiting: this.items.length, processing: this.active, capacity: this.maxWaiting };
  }

  estimate(frames, width, height) {
    const pixels = Math.max(1, width * height);
    const scale = Math.max(1, Math.sqrt(pixels / (400 * 225)));
    return Math.max(1, frames * this.rate * scale + 8);
  }

  add(job, estimateSeconds) {
    if (this.items.length + this.active >= this.maxWaiting) {
      const error = new Error('fotohd_queue_full');
      error.code = 'FOTOHD_QUEUE_FULL';
      throw error;
    }
    const position = this.items.length + this.active + 1;
    const promise = new Promise((resolve, reject) => {
      this.items.push({ job, resolve, reject, estimateSeconds });
      this.pump();
    });
    return { promise, position, estimateSeconds, stats: this.stats() };
  }

  pump() {
    if (this.active >= this.concurrency || this.items.length === 0) return;
    const item = this.items.shift();
    this.active += 1;
    Promise.resolve().then(item.job).then(item.resolve, item.reject).finally(() => {
      this.active -= 1;
      this.pump();
    });
  }
}

const fotoHdQueue = new FotoHdQueue({
  maxWaiting: Number.parseInt(process.env.FOTOHD_MAX_QUEUE || '4', 10),
  rate: Number.parseFloat(process.env.FOTOHD_SECONDS_PER_FRAME || String(DEFAULT_RATE))
});

module.exports = { FotoHdQueue, fotoHdQueue, formatDuration };
