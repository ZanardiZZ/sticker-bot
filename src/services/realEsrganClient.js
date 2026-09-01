const DEFAULT_URL = process.env.REAL_ESRGAN_URL || 'http://192.168.20.153:8195';
const DEFAULT_TIMEOUT = Number.parseInt(process.env.REAL_ESRGAN_TIMEOUT_MS || '900000', 10);

function createRealEsrganHttpClient(deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;
  const baseUrl = String(deps.baseUrl || DEFAULT_URL).replace(/\/$/, '');
  const timeoutMs = deps.timeoutMs || DEFAULT_TIMEOUT;
  const apiKey = deps.apiKey || process.env.REAL_ESRGAN_API_KEY || '';
  if (!fetchFn || !baseUrl) return null;

  return async function upscale(buffer) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { 'content-type': 'application/json' };
      if (apiKey) headers.authorization = `Bearer ${apiKey}`;
      const response = await fetchFn(`${baseUrl}/upscale`, {
        method: 'POST', headers,
        body: JSON.stringify({ image: buffer.toString('base64') }),
        signal: controller.signal
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(`Real-ESRGAN HTTP ${response.status}`);
        error.code = body.error || 'REAL_ESRGAN_HTTP_ERROR';
        error.retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
        throw error;
      }
      if (!body.image) throw new Error('Real-ESRGAN não retornou imagem.');
      return { buffer: Buffer.from(body.image, 'base64'), info: body };
    } catch (error) {
      if (error.name === 'AbortError') {
        const timeout = new Error('Tempo limite do Real-ESRGAN excedido.');
        timeout.code = 'REAL_ESRGAN_TIMEOUT';
        timeout.retryable = true;
        throw timeout;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}

module.exports = { createRealEsrganHttpClient };
