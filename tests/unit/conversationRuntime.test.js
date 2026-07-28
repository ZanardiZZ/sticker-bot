const { ConversationRuntime } = require('../../src/services/conversationRuntime');

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const tests = [
  {
    name: 'coalesces a burst and runs only the latest request',
    fn: async () => {
      const runtime = new ConversationRuntime({ debounceMs: 10, timeoutMs: 200 });
      const calls = [];
      const first = runtime.schedule('group@g.us', { id: 1 }, async request => { calls.push(request.id); });
      const second = runtime.schedule('group@g.us', { id: 2 }, async request => { calls.push(request.id); });
      assert(await first === false, 'superseded request should resolve false');
      assert(await second === true, 'latest request should resolve true');
      assert(calls.length === 1 && calls[0] === 2, 'only latest request should execute');
    }
  },
  {
    name: 'invalidates an active response and schedules the newer request',
    fn: async () => {
      const runtime = new ConversationRuntime({ debounceMs: 0, timeoutMs: 200 });
      const calls = [];
      let releaseFirst;
      const firstRun = new Promise(resolve => { releaseFirst = resolve; });
      const first = runtime.schedule('group2@g.us', { id: 1 }, async (request, guard) => {
        calls.push(`start-${request.id}`);
        await firstRun;
        assert(!guard.isCurrent(), 'first generation must become stale');
      });
      await sleep(5);
      const second = runtime.schedule('group2@g.us', { id: 2 }, async request => {
        calls.push(`start-${request.id}`);
      });
      releaseFirst();
      assert(await first === true, 'first active request should finish without error');
      assert(await second === true, 'new request is accepted while first is active');
      await sleep(10);
      assert(calls.includes('start-1') && calls.includes('start-2'), 'both generations should be observed');
    }
  },
  {
    name: 'aborts a timed-out generation',
    fn: async () => {
      const runtime = new ConversationRuntime({ debounceMs: 0, timeoutMs: 20 });
      let aborted = false;
      const result = await runtime.schedule('group3@g.us', {}, async (_request, guard) => {
        await new Promise(resolve => {
          guard.signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true });
        });
      });
      assert(result === false, 'timed-out generation should fail');
      assert(aborted, 'timeout must abort the generation signal');
    }
  }
];

module.exports = { tests };
