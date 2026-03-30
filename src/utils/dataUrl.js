'use strict';

function parseBase64DataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') {
    throw new Error('invalid_data_url');
  }

  const trimmed = dataUrl.trim();
  if (!trimmed.toLowerCase().startsWith('data:')) {
    throw new Error('invalid_data_url');
  }

  const commaIndex = trimmed.indexOf(',');
  if (commaIndex === -1) {
    throw new Error('invalid_data_url');
  }

  const metadata = trimmed.slice(5, commaIndex); // remove leading "data:"
  const dataPayload = trimmed.slice(commaIndex + 1);

  const metaSegments = metadata
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean);

  const base64Index = metaSegments.findIndex((segment) => segment.toLowerCase() === 'base64');
  if (base64Index === -1) {
    throw new Error('invalid_data_url');
  }

  const mimeParts = metaSegments.slice(0, base64Index);
  const mimeDescriptor = mimeParts.length > 0 ? mimeParts.join('; ') : '';

  const base64Payload = dataPayload.replace(/\s+/g, '');
  if (!base64Payload) {
    throw new Error('invalid_data_url');
  }

  let buffer;
  try {
    buffer = Buffer.from(base64Payload, 'base64');
  } catch (err) {
    throw new Error('invalid_data_url');
  }

  return {
    buffer,
    mimetype: mimeDescriptor || 'application/octet-stream',
  };
}

module.exports = {
  parseBase64DataUrl,
};
