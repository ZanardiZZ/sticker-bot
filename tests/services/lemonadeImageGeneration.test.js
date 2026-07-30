const { ImageGenerationQueue } = require('../../src/services/lemonadeImageGeneration');
const { assert, assertEqual } = require('../helpers/testUtils');

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const tests = [
  {
    name: 'Serializes image jobs and preserves Z-Image defaults',
    fn: async () => {
      const originalFetch = global.fetch;
      const calls = [];
      let active = 0;
      let peak = 0;
      global.fetch = async (_url, options) => {
        active += 1;
        peak = Math.max(peak, active);
        calls.push(JSON.parse(options.body));
        await new Promise(resolve => setTimeout(resolve, 10));
        active -= 1;
        return response({ data: [{ b64_json: 'cG5n' }] });
      };
      try {
        const queue = new ImageGenerationQueue({
          apiKey: 'test-key',
          delayMs: 0,
          maxQueue: 3,
          userCooldownMs: 0,
          maxLoad: 1000,
          rejectOnDState: false
        });
        const results = await Promise.all([
          queue.enqueue('primeiro'),
          queue.enqueue('segundo')
        ]);
        assertEqual(peak, 1, 'Image generation must be serial');
        assertEqual(calls[0].steps, 8, 'Default steps must remain 8');
        assertEqual(calls[0].cfg_scale, 1, 'Default cfg scale must remain 1');
        assertEqual(results[0].imageData, 'cG5n', 'Should return Lemonade image data');
      } finally {
        global.fetch = originalFetch;
      }
    }
  },
  {
    name: 'Rejects repeated requests from the same user during cooldown',
    fn: async () => {
      const queue = new ImageGenerationQueue({ apiKey: 'test-key', delayMs: 0, userCooldownMs: 60000, maxLoad: 1000, rejectOnDState: false });
      const originalFetch = global.fetch;
      global.fetch = async () => response({ data: [{ b64_json: 'cG5n' }] });
      try {
        const first = queue.enqueue('primeiro', { requesterId: 'user-1' });
        let error = null;
        try {
          queue.enqueue('segundo', { requesterId: 'user-1' });
        } catch (caught) {
          error = caught;
        }
        assert(error && error.code === 'IMAGE_USER_COOLDOWN', 'Second request must be rate limited');
        await first;
      } finally {
        global.fetch = originalFetch;
      }
    }
  },
  {
    name: 'Queues a job during pressure and starts it after pressure clears',
    fn: async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => response({ data: [{ b64_json: 'cG5n' }] });
      try {
        const queue = new ImageGenerationQueue({
          apiKey: 'test-key',
          delayMs: 0,
          userCooldownMs: 0,
          maxLoad: 8,
          pressureWaitMs: 100,
          pressurePollMs: 1,
          rejectOnDState: true
        });
        let checks = 0;
        queue._systemPressure = () => (++checks < 3 ? { load1: 99, dStateCount: 1 } : { load1: 0, dStateCount: 0 });
        const result = await queue.enqueue('aguardar pressão');
        assertEqual(result.imageData, 'cG5n', 'Queued job must execute after pressure clears');
        assert(checks >= 3, 'Queue must poll pressure before starting');
      } finally {
        global.fetch = originalFetch;
      }
    }
  },
  {
    name: 'Rejects jobs when the waiting queue is full',
    fn: async () => {
      let release;
      const blocked = new Promise(resolve => { release = resolve; });
      const originalFetch = global.fetch;
      global.fetch = async () => {
        await blocked;
        return response({ data: [{ b64_json: 'cG5n' }] });
      };
      try {
        const queue = new ImageGenerationQueue({ apiKey: 'test-key', delayMs: 0, maxQueue: 1, userCooldownMs: 0, maxLoad: 1000, rejectOnDState: false });
        const first = queue.enqueue('primeiro');
        queue.enqueue('segundo');
        let error = null;
        try {
          queue.enqueue('terceiro');
        } catch (caught) {
          error = caught;
        }
        assert(error && error.code === 'IMAGE_QUEUE_FULL', 'Third waiting job must be rejected');
        release();
        await queue.drain();
      } finally {
        global.fetch = originalFetch;
      }
    }
  }
];

module.exports = { tests };
