const assert = require('assert');
const path = require('path');
const fs = require('fs');
const {
  isAnimatedWebpBuffer,
  isAnimatedWebpBufferAuthoritative,
  ensureSafeWebpSticker,
} = require('../../src/bot/stickers');

async function run() {
  const fixture = path.join(__dirname, '..', 'fixtures', 'static-webp-with-animation-header.webp');
  const buffer = fs.readFileSync(fixture);

  assert.strictEqual(isAnimatedWebpBuffer(buffer), true, 'fixture should exercise the legacy header detector');
  assert.strictEqual(
    await isAnimatedWebpBufferAuthoritative(buffer),
    false,
    'one-page WebP must not be classified as animated'
  );

  const normalized = await ensureSafeWebpSticker(fixture);
  assert.strictEqual(normalized.animated, false, 'one-page WebP must use the static sticker path');
  assert.ok(normalized.buffer.length > 0, 'static sticker output must not be empty');

  console.log('✅ one-page ANIM/ANMF WebP uses the static sticker path');
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`❌ ${error.stack || error.message}`);
    process.exit(1);
  });
