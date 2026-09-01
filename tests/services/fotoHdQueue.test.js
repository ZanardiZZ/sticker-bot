#!/usr/bin/env node
const { assert, assertEqual, runTestSuite, sleep } = require('../helpers/testUtils');
const { FotoHdQueue, formatDuration } = require('../../src/services/fotoHdQueue');

const tests = [
  { name: 'serializes jobs and reports position', fn: async () => {
    const queue = new FotoHdQueue({ maxWaiting: 2 });
    const order = [];
    const first = queue.add(async () => { order.push('a'); await sleep(25); }, 65);
    const second = queue.add(async () => { order.push('b'); }, 65);
    assertEqual(first.position, 1, 'first job position');
    assertEqual(second.position, 2, 'second job position');
    await Promise.all([first.promise, second.promise]);
    assertEqual(order.join(','), 'a,b', 'jobs must be sequential');
  } },
  { name: 'rejects bounded queue and formats estimate', fn: async () => {
    const queue = new FotoHdQueue({ maxWaiting: 1 });
    const first = queue.add(() => sleep(30), 70);
    let error;
    try { queue.add(() => undefined, 70); } catch (caught) { error = caught; }
    assertEqual(error.code, 'FOTOHD_QUEUE_FULL', 'queue overflow code');
    assertEqual(formatDuration(70), '1min 10s', 'duration format');
    await first.promise;
  } }
];

if (require.main === module) runTestSuite('Foto HD Queue Tests', tests).then(() => process.exit(0)).catch(() => process.exit(1));
module.exports = { tests };
