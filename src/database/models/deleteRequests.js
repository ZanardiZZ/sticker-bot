const { dbHandler } = require('../connection');

async function addOrUpdateDeleteRequest(mediaId, userId, groupId = null) {
  if (!mediaId || !userId) {
    return { inserted: false, updated: false };
  }

  const normalizedUserId = String(userId).trim();
  const normalizedGroupId = groupId ? String(groupId).trim() : null;
  const mediaIdNum = Number(mediaId);

  if (!Number.isFinite(mediaIdNum) || mediaIdNum <= 0) {
    return { inserted: false, updated: false };
  }

  const insertResult = await dbHandler.run(
    `INSERT OR IGNORE INTO media_delete_requests (media_id, user_id, group_id)
     VALUES (?, ?, ?)`,
    [mediaIdNum, normalizedUserId, normalizedGroupId]
  );

  if (insertResult?.changes > 0) {
    return { inserted: true, updated: false };
  }

  const updateResult = await dbHandler.run(
    `UPDATE media_delete_requests
       SET last_requested_at = (strftime('%s','now')),
           group_id = COALESCE(?, group_id)
     WHERE media_id = ? AND user_id = ?`,
    [normalizedGroupId, mediaIdNum, normalizedUserId]
  );

  return { inserted: false, updated: updateResult?.changes > 0 };
}

async function countDeleteRequests(mediaId) {
  const mediaIdNum = Number(mediaId);
  if (!Number.isFinite(mediaIdNum) || mediaIdNum <= 0) {
    return 0;
  }

  const row = await dbHandler.get(
    'SELECT COUNT(*) AS total FROM media_delete_requests WHERE media_id = ?',
    [mediaIdNum]
  );
  return row?.total ? Number(row.total) : 0;
}

async function getDeleteRequest(mediaId, userId) {
  const mediaIdNum = Number(mediaId);
  if (!Number.isFinite(mediaIdNum) || mediaIdNum <= 0 || !userId) {
    return null;
  }

  return dbHandler.get(
    'SELECT * FROM media_delete_requests WHERE media_id = ? AND user_id = ? LIMIT 1',
    [mediaIdNum, String(userId).trim()]
  );
}

async function clearDeleteRequests(mediaId) {
  const mediaIdNum = Number(mediaId);
  if (!Number.isFinite(mediaIdNum) || mediaIdNum <= 0) {
    return 0;
  }

  const result = await dbHandler.run(
    'DELETE FROM media_delete_requests WHERE media_id = ?',
    [mediaIdNum]
  );
  return result?.changes ? Number(result.changes) : 0;
}

async function listPendingDeleteRequests(limit = 50) {
  const limitNum = Number(limit);
  const safeLimit = Number.isFinite(limitNum) && limitNum > 0 ? Math.min(limitNum, 200) : 50;

  return dbHandler.all(
    `SELECT media_id, COUNT(*) AS total_votos, MIN(first_requested_at) AS primeiro_pedido,
            MAX(last_requested_at) AS ultimo_pedido
       FROM media_delete_requests
      GROUP BY media_id
      ORDER BY total_votos DESC, ultimo_pedido DESC
      LIMIT ?`,
    [safeLimit]
  );
}

module.exports = {
  addOrUpdateDeleteRequest,
  countDeleteRequests,
  getDeleteRequest,
  clearDeleteRequests,
  listPendingDeleteRequests
};
