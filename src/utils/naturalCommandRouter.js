/**
 * Deterministic natural-language -> command router.
 * Conservative by design: only maps allowlisted safe commands.
 */

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAllowlist() {
  const raw = String(process.env.NATURAL_COMMAND_ALLOWLIST || '#random,#tema,#ping,#pong,#comandos').trim();
  return new Set(
    raw
      .split(',')
      .map(item => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function hasBotCue(rawText = '') {
  const text = String(rawText || '');
  if (!text) return false;

  // Names/aliases commonly used in chats.
  if (/\b(?:bot|zz\s*-?\s*bot|sticker\s*-?\s*bot|lia)\b/i.test(text)) return true;

  // Raw @mention usually means the user is explicitly addressing someone.
  if (/@\d{6,}/.test(text)) return true;

  return false;
}

function isNaturalRouterEnabled() {
  const flag = String(process.env.NATURAL_COMMAND_ENABLED || '1').toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(flag);
}

function extractThemeTerm(rawText = '') {
  const text = String(rawText || '').trim();
  if (!text) return null;

  const patterns = [
    /(?:figurinha|sticker|gif|meme)s?\s+(?:de|do|da|sobre|com)\s+([^?.!,;]{2,80})/i,
    /(?:me\s+manda|manda|envia|quero)\s+(?:uma\s+|uns\s+|alguma\s+)?(?:figurinha|sticker|gif|meme)s?\s+(?:de|do|da|sobre|com)\s+([^?.!,;]{2,80})/i,
    /\btema\s+([^?.!,;]{2,80})/i
  ];

  let term = null;
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      term = match[1].trim();
      break;
    }
  }

  if (!term) return null;

  term = term
    .replace(/\b(?:pra mim|por favor|pfv|pls|ai|a[ií])\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const normalized = normalizeText(term);
  if (!normalized) return null;

  // Generic asks should route to #random, not #tema vazio.
  if (/^(?:qualquer(?:\s+uma)?|aleatori[oa]?|algo|alguma|surpresa)$/.test(normalized)) {
    return null;
  }

  return term;
}

function resolveNaturalCommand({ text, context = {} } = {}) {
  if (!isNaturalRouterEnabled()) return null;

  const raw = String(text || '').trim();
  if (!raw || raw.startsWith('#')) return null;

  const normalized = normalizeText(raw);
  if (!normalized) return null;

  const allowlist = parseAllowlist();

  // In groups, require explicit addressing cue to avoid accidental triggers.
  const isGroup = Boolean(context?.isGroup);
  if (isGroup && !hasBotCue(raw)) {
    // Exception: very explicit sticker-request imperative is allowed.
    const explicitStickerAsk = /^(?:me\s+)?(?:manda|envia|quero)\b.*\b(?:figurinha|sticker|gif|meme)s?\b/i.test(raw);
    if (!explicitStickerAsk) return null;
  }

  if (allowlist.has('#comandos') && /(\bajuda\b|\bcomandos\b|\bmenu\b|o\s+que\s+voce\s+faz|o\s+que\s+você\s+faz)/i.test(normalized)) {
    return '#comandos';
  }

  if (allowlist.has('#ping') && /(\bping\b|\bstatus\b|ta\s+vivo|t[aá]\s+vivo|online|latencia|lat[eê]ncia)/i.test(normalized)) {
    return '#ping';
  }

  if (allowlist.has('#pong') && /\bpong\b/i.test(normalized)) {
    return '#pong';
  }

  if (allowlist.has('#tema')) {
    const themeTerm = extractThemeTerm(raw);
    if (themeTerm) {
      return `#tema ${themeTerm}`;
    }
  }

  if (allowlist.has('#random') && /(aleatori|surpreend|qualquer\s+uma|manda\s+uma\s+(?:figurinha|sticker|gif|meme)|envia\s+uma\s+(?:figurinha|sticker|gif|meme)|me\s+manda\s+uma\s+(?:figurinha|sticker|gif|meme))/i.test(normalized)) {
    return '#random';
  }

  return null;
}

module.exports = {
  resolveNaturalCommand,
  normalizeText,
  extractThemeTerm,
  hasBotCue
};
