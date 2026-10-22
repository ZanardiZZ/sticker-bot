const assert = require('assert');
const fs = require('fs');
const { prepareVisionImage } = require('../../src/services/ai');
(async () => {
  const input = fs.readFileSync('/home/dev/work/sticker-bot2/storage/media/old-stickers/stk-20190813-wa0097-68a4b16bf5f5.webp');
  const output = await prepareVisionImage(input);
  assert.ok(Buffer.isBuffer(output));
  assert.strictEqual(output.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(output.length > 0);
  console.log('visionImageNormalization: PASS');
})().catch(error => { console.error(error); process.exit(1); });
