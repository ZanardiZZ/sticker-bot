function formatError(err) {
  if (!err) return String(err);
  try {
    if (err.stack) return err.stack;
    if (typeof err === 'object') return JSON.stringify(err);
    return String(err);
  } catch (e) {
    return String(err);
  }
}

module.exports = formatError;
