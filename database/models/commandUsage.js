/**
 * Command usage model helpers
 */

const { db } = require('../connection');

function normalizeCommand(command) {
  return typeof command === 'string' ? command.trim().toLowerCase() : null;
}

function normalizeUserId(userId) {
  return typeof userId === 'string' ? userId.trim() : null;
}

function incrementCommandUsageWithDb(database, command, userId) {
  return new Promise((resolve, reject) => {
    const normalizedCommand = normalizeCommand(command);
    const normalizedUserId = normalizeUserId(userId);

    if (!normalizedCommand || !normalizedUserId) {
      return resolve(false);
    }

    const timestamp = Math.floor(Date.now() / 1000);

    const upsertQuery = `
      INSERT INTO command_usage (command, user_id, usage_count, last_used)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(command, user_id) DO UPDATE SET
        usage_count = usage_count + 1,
        last_used = excluded.last_used
    `.trim();

    database.run(
      upsertQuery,
      [normalizedCommand, normalizedUserId, timestamp],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(true);
        }
      }
    );
  });
}

function getTopCommandsWithDb(database, limit = 5) {
  return new Promise((resolve, reject) => {
    const parsedLimit = Number.isInteger(limit) && limit > 0 ? limit : 5;

    database.all(
      `SELECT
         command,
         SUM(usage_count) AS total_usage,
         MAX(last_used) AS last_used
       FROM command_usage
       GROUP BY command
       ORDER BY total_usage DESC, last_used DESC
       LIMIT ?`,
      [parsedLimit],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const formattedRows = (rows || []).map((row) => ({
            command: row.command,
            total_usage: Number(row.total_usage) || 0,
            last_used: Number(row.last_used) || 0
          }));
          resolve(formattedRows);
        }
      }
    );
  });
}

function getUserCommandUsageWithDb(database, userId) {
  return new Promise((resolve, reject) => {
    const normalizedUserId = normalizeUserId(userId);

    if (!normalizedUserId) {
      resolve([]);
      return;
    }

    database.all(
      `SELECT
         command, usage_count, last_used
       FROM command_usage
       WHERE user_id = ?
       ORDER BY usage_count DESC, last_used DESC`,
      [normalizedUserId],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const formatted = (rows || []).map((row) => ({
            command: row.command,
            usage_count: Number(row.usage_count) || 0,
            last_used: Number(row.last_used) || 0
          }));
          resolve(formatted);
        }
      }
    );
  });
}

function getTotalCommandsWithDb(database, userId) {
  return new Promise((resolve, reject) => {
    const normalizedUserId = normalizeUserId(userId);

    if (!normalizedUserId) {
      resolve(0);
      return;
    }

    database.get(
      `SELECT SUM(usage_count) AS total_usage
       FROM command_usage
       WHERE user_id = ?`,
      [normalizedUserId],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          const total = row && typeof row.total_usage === 'number' ? row.total_usage : 0;
          resolve(total || 0);
        }
      }
    );
  });
}

function createCommandUsageModel(database = db) {
  return {
    incrementCommandUsage: (command, userId) => incrementCommandUsageWithDb(database, command, userId),
    getTopCommands: (limit) => getTopCommandsWithDb(database, limit),
    getUserCommandUsage: (userId) => getUserCommandUsageWithDb(database, userId),
    getTotalCommands: (userId) => getTotalCommandsWithDb(database, userId)
  };
}

const defaultModel = createCommandUsageModel();

module.exports = {
  ...defaultModel,
  createCommandUsageModel,
  getUserCommandUsageWithDb,
  getTotalCommandsWithDb
};
