/**
 * Delivery state shared by the automatic sticker scheduler.
 * A description is allowed only after an explicit messageId confirmation.
 */
function isConfirmedStickerDelivery(result) {
  return Boolean(result && result.status === 'sent' && result.messageId);
}

module.exports = { isConfirmedStickerDelivery };
