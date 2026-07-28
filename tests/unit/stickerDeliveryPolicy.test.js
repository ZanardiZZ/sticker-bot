const { isConfirmedStickerDelivery } = require('../../src/bot/deliveryPolicy');
const { BaileysWsAdapter } = require('../../src/waAdapter');

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const tests = [
  {
    name: 'accepts only explicitly confirmed sticker delivery',
    fn: () => assert(isConfirmedStickerDelivery({ status: 'sent', messageId: 'wamid-1' }), 'confirmed delivery should pass')
  },
  {
    name: 'rejects uncertain ACK timeout',
    fn: () => assert(!isConfirmedStickerDelivery({ status: 'uncertain', mediaId: 17860, reason: 'ack_timeout' }), 'uncertain delivery must fail')
  },
  {
    name: 'rejects legacy or incomplete result without messageId',
    fn: () => {
      assert(!isConfirmedStickerDelivery(undefined), 'undefined must fail');
      assert(!isConfirmedStickerDelivery({ status: 'sent' }), 'missing messageId must fail');
    }
  },
  {
    name: 'does not retry non-idempotent raw sticker after ACK timeout',
    fn: async () => {
      const client = new BaileysWsAdapter({ url: 'ws://test.invalid' });
      let attempts = 0;
      client._ensureReady = async () => {};
      client._sendAndWaitForAck = async () => {
        attempts += 1;
        throw new Error('ack_timeout');
      };
      let failed = false;
      try {
        await client.sendRawWebpAsSticker('group@g.us', 'data:image/webp;base64,AA==');
      } catch (err) {
        failed = err.message === 'ack_timeout';
      }
      assert(failed, 'ACK timeout must remain visible to caller');
      assert(attempts === 1, `expected one media attempt, got ${attempts}`);
    }
  }
];

module.exports = { tests };
