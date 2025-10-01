const RIFF_SIGNATURE = Buffer.from('RIFF');
const WEBP_SIGNATURE = Buffer.from('WEBP');

/**
 * Attempts to sanitize a WebP buffer by fixing misplaced headers or incorrect RIFF sizes.
 * @param {Buffer} buffer
 * @returns {{buffer: Buffer, changed: boolean, notes: string[]}}
 */
function sanitizeWebpBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return { buffer, changed: false, notes: [] };
  }

  const notes = [];
  let changed = false;

  const riffIndex = buffer.indexOf(RIFF_SIGNATURE);
  if (riffIndex === -1) {
    return { buffer, changed: false, notes: [] };
  }

  let start = riffIndex;
  if (start > 0) {
    notes.push(`trimmed ${start} leading byte(s) before RIFF header`);
    changed = true;
  }

  const expectedWebpIndex = start + 8;
  let actualWebpIndex = buffer.indexOf(WEBP_SIGNATURE, riffIndex);

  if (actualWebpIndex === -1) {
    return { buffer, changed: changed, notes };
  }

  if (actualWebpIndex !== expectedWebpIndex) {
    const possibleStart = actualWebpIndex - 8;
    if (possibleStart >= 0 && buffer.slice(possibleStart, possibleStart + 4).equals(RIFF_SIGNATURE)) {
      if (possibleStart !== start) {
        start = possibleStart;
        notes.push('realigned WEBP signature to correct offset');
        changed = true;
      }
    }
  }

  let sanitized = buffer.slice(start);
  actualWebpIndex = sanitized.indexOf(WEBP_SIGNATURE);
  if (actualWebpIndex !== 8) {
    // If after slicing we still don't have WEBP at offset 8, bail out using original buffer
    return { buffer, changed: false, notes };
  }

  let resultBuffer = sanitized;

  if (resultBuffer.length >= 8) {
    const declaredSize = resultBuffer.readUInt32LE(4);
    const actualSize = resultBuffer.length - 8;
    if (declaredSize !== actualSize) {
      const copy = Buffer.from(resultBuffer);
      copy.writeUInt32LE(actualSize, 4);
      resultBuffer = copy;
      notes.push(`fixed RIFF chunk size from ${declaredSize} to ${actualSize}`);
      changed = true;
    } else if (changed) {
      // Ensure we return a detached buffer when we trimmed bytes
      resultBuffer = Buffer.from(resultBuffer);
    }
  }

  return { buffer: resultBuffer, changed, notes };
}

module.exports = {
  sanitizeWebpBuffer,
};

