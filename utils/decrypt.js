// utils/decrypt.js
const { downloadAndDecrypt } = require('./waDecrypt.js');

const DEBUG = /^(debug|trace)$/i.test(process.env.LOG_LEVEL || '');

const DEFAULT_MEDIA_HOSTS = (process.env.WA_MEDIA_HOSTS || [
  'mmg.whatsapp.net',
  'media-ams4-1.cdn.whatsapp.net',
  'media.fdel1-1.fna.whatsapp.net'
].join(','))
  .split(',')
  .map(h => h.trim())
  .filter(Boolean);

const TRY_VENOM_DECRYPT = /^1|true|yes$/i.test(process.env.USE_VENOM_DECRYPT || '0');

function get(obj, ...paths) {
  for (const p of paths) {
    const v = p.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function looksLikeImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return false;
  const riff = buf.slice(0, 4).toString() === 'RIFF'
             && buf.slice(8, 12).toString() === 'WEBP';
  const png  = buf.slice(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  const jpg  = buf.slice(0, 2).equals(Buffer.from([0xff,0xd8]));
  const gif  = buf.slice(0, 3).toString() === 'GIF';
  return riff || png || jpg || gif;
}

function buildPaths(message) {
  const out = new Set();
  const directPath = get(message, 'directPath', 'mediaData.directPath', '_data.directPath');
  if (directPath && /^\/v\/.+\.enc(\?|$)/.test(directPath)) out.add(directPath);

  const clientUrl = get(message, 'clientUrl', 'deprecatedMmsDownloadUrl', 'url', 'mediaData.clientUrl');
  if (clientUrl) {
    try {
      const u = new URL(clientUrl, 'https://mmg.whatsapp.net');
      const candidate = u.pathname + (u.search || '');
      if (/^\/v\/.+\.enc(\?|$)/.test(candidate)) out.add(candidate);
    } catch {}
  }

  return [...out];
}

function buildCandidateUrls(message) {
  const paths = buildPaths(message);
  const urls = [];
  for (const p of paths) {
    for (const host of DEFAULT_MEDIA_HOSTS) {
      urls.push(`https://${host}${p}`);
    }
  }
  return [...new Set(urls)];
}

async function decryptFile(client, message) {
  if (TRY_VENOM_DECRYPT && client?.decryptFile) {
    try {
      const buf = await client.decryptFile(message);
      if (looksLikeImage(buf)) return buf;
    } catch (e) {
      if (DEBUG) console.debug('decryptFile(client) falhou:', e.message);
    }
  }

  const mediaKey = get(message, 'mediaKey', 'mediaData.mediaKey', '_data.mediaKey');
  if (!mediaKey) throw new Error('Sem mediaKey para descriptografar');

  const type = message?.isSticker || message?.type === 'sticker' ? 'sticker' : 'image';
  const candidates = buildCandidateUrls(message);
  if (!candidates.length) throw new Error('Sem URLs candidatas válidas (/v/...*.enc)');

  let lastErr;
  for (const url of candidates) {
    try {
      const dec = await downloadAndDecrypt(url, mediaKey, type);
      if (looksLikeImage(dec)) return dec;
      if (DEBUG) console.debug('Candidato não é imagem:', url);
    } catch (e) {
      lastErr = e;
      if (DEBUG) console.debug('Falha ao baixar/decrypt', { url, status: e.status, msg: e.message });
    }
  }

  const msg = lastErr?.status
    ? `Todos candidatos falharam (ex: HTTP ${lastErr.status})`
    : 'Todos candidatos falharam';
  throw new Error(msg);
}

module.exports = {
  decryptFile,
  looksLikeImage
};
