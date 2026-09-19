const assert = require('assert');
const { AdaptiveVisionScheduler } = require('../../src/services/adaptiveVisionScheduler');

async function main() {
  const scheduler = new AdaptiveVisionScheduler({ maxWaiting: 3 });
  let running = 0;
  let peak = 0;
  const task = () =>
    new Promise((resolve) => {
      running += 1;
      peak = Math.max(peak, running);
      setTimeout(() => {
        running -= 1;
        resolve(true);
      }, 20);
    });

  const one = scheduler.startGif('one');
  await Promise.all([scheduler.run(task), scheduler.run(task), scheduler.run(task)]);
  assert.strictEqual(peak, 3, 'one active GIF must allow three tasks');
  one.release();

  peak = 0;
  const first = scheduler.startGif('first');
  const second = scheduler.startGif('second');
  await Promise.all([scheduler.run(task), scheduler.run(task), scheduler.run(task)]);
  assert.strictEqual(peak, 2, 'two active GIFs must cap global concurrency at two');
  first.release();
  second.release();

  const busy = new AdaptiveVisionScheduler({ maxWaiting: 0 });
  const lease = busy.startGif('bounded');
  await assert.rejects(
    () => busy.run(task),
    (error) => error.code === 'VISION_QUEUE_FULL'
  );
  lease.release();

  console.log('adaptiveVisionScheduler: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
