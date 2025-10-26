const envValue = Number(process.env.BOT_DELETE_VOTE_THRESHOLD_DEFAULT ?? process.env.DELETE_VOTE_THRESHOLD_DEFAULT);
const DEFAULT_DELETE_VOTE_THRESHOLD = Number.isFinite(envValue) && envValue >= 1
  ? Math.floor(envValue)
  : 3;

module.exports = {
  DEFAULT_DELETE_VOTE_THRESHOLD
};
