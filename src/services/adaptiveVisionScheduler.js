const DEFAULT_MAX_WAITING = 12;
const SINGLE_GIF_CONCURRENCY = 3;
const MULTI_GIF_CONCURRENCY = 2;

class AdaptiveVisionScheduler {
  constructor(options = {}) {
    this.maxWaiting =
      Number.isInteger(options.maxWaiting) && options.maxWaiting >= 0
        ? options.maxWaiting
        : DEFAULT_MAX_WAITING;
    this.singleGifConcurrency = options.singleGifConcurrency || SINGLE_GIF_CONCURRENCY;
    this.multiGifConcurrency = options.multiGifConcurrency || MULTI_GIF_CONCURRENCY;
    this.waiting = [];
    this.running = 0;
    this.activeGifs = 0;
    this.sequence = 0;
    this.stats = { accepted: 0, completed: 0, failed: 0, rejected: 0 };
  }

  get concurrencyLimit() {
    return this.activeGifs >= 2 ? this.multiGifConcurrency : this.singleGifConcurrency;
  }

  getStats() {
    return {
      activeGifs: this.activeGifs,
      running: this.running,
      waiting: this.waiting.length,
      concurrencyLimit: this.concurrencyLimit,
      maxWaiting: this.maxWaiting,
      ...this.stats,
    };
  }

  startGif(label = 'unknown') {
    this.activeGifs += 1;
    this._pump();
    let released = false;
    return {
      label,
      release: () => {
        if (released) return;
        released = true;
        this.activeGifs = Math.max(0, this.activeGifs - 1);
        this._pump();
      },
    };
  }

  run(task, options = {}) {
    if (typeof task !== 'function') {
      return Promise.reject(new TypeError('vision task must be a function'));
    }
    if (this.waiting.length >= this.maxWaiting) {
      this.stats.rejected += 1;
      const error = new Error(`Vision queue is full (max waiting: ${this.maxWaiting})`);
      error.code = 'VISION_QUEUE_FULL';
      error.label = options.label || 'unknown';
      return Promise.reject(error);
    }

    this.stats.accepted += 1;
    return new Promise((resolve, reject) => {
      this.waiting.push({
        id: ++this.sequence,
        task,
        resolve,
        reject,
        label: options.label || 'unknown',
      });
      this._pump();
    });
  }

  _pump() {
    while (this.running < this.concurrencyLimit && this.waiting.length > 0) {
      const item = this.waiting.shift();
      this.running += 1;
      Promise.resolve()
        .then(item.task)
        .then((result) => {
          this.stats.completed += 1;
          item.resolve(result);
        })
        .catch((error) => {
          this.stats.failed += 1;
          item.reject(error);
        })
        .finally(() => {
          this.running -= 1;
          this._pump();
        });
    }
  }
}

const visionScheduler = new AdaptiveVisionScheduler({
  maxWaiting: Number(process.env.STICKER_VISION_MAX_WAITING || DEFAULT_MAX_WAITING),
});

module.exports = { AdaptiveVisionScheduler, visionScheduler };
