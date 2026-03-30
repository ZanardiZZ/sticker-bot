"use strict";

const fs = require("fs/promises");
const path = require("path");
const mimeTypes = require("mime-types");

function startsWith(buffer, bytes, offset = 0) {
  if (!buffer || buffer.length < offset + bytes.length) {
    return false;
  }

  for (let i = 0; i < bytes.length; i += 1) {
    if (buffer[offset + i] !== bytes[i]) {
      return false;
    }
  }

  return true;
}

function detectFromBuffer(buffer) {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return { ext: "jpg", mime: "image/jpeg" };
  }

  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47])) {
    return { ext: "png", mime: "image/png" };
  }

  if (startsWith(buffer, [0x47, 0x49, 0x46, 0x38])) {
    return { ext: "gif", mime: "image/gif" };
  }

  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { ext: "webp", mime: "image/webp" };
  }

  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46])) {
    return { ext: "pdf", mime: "application/pdf" };
  }

  if (startsWith(buffer, [0x4f, 0x67, 0x67, 0x53])) {
    return { ext: "ogg", mime: "audio/ogg" };
  }

  if (startsWith(buffer, [0x49, 0x44, 0x33])) {
    return { ext: "mp3", mime: "audio/mpeg" };
  }

  if (startsWith(buffer, [0x00, 0x00, 0x00], 0) && startsWith(buffer, [0x66, 0x74, 0x79, 0x70], 4)) {
    return { ext: "mp4", mime: "video/mp4" };
  }

  return undefined;
}

async function fromFile(filePath) {
  const mime = mimeTypes.lookup(filePath);
  if (mime) {
    return {
      ext: path.extname(filePath).replace(/^\./, "") || undefined,
      mime
    };
  }

  const handle = await fs.open(filePath, "r");

  try {
    const buffer = Buffer.alloc(32);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return detectFromBuffer(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

module.exports = {
  fromFile
};
