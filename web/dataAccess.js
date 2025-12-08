const path = require('path');
const { bus } = require('./eventBus.js');
const { db } = require('../database/index.js');
const fs = require('fs');

// Ajuste o caminho raiz dos stickers se for diferente:
const FIGURINHAS_DIR_ABS = process.env.FIGURINHAS_DIR_ABS || '/mnt/nas/Media/Figurinhas';
const ROOT_DIR = path.resolve(__dirname, '..');
const BOT_MEDIA_DIR = path.join(ROOT_DIR, 'bot', 'media');
const OLD_STICKERS_DIR = path.resolve(process.env.OLD_STICKERS_DIR || process.env.OLD_STICKERS_PATH || path.join(ROOT_DIR, 'media', 'old-stickers'));
const FIGURINHAS_DIR_NORM = FIGURINHAS_DIR_ABS.replace(/\\/g, '/');
const BOT_MEDIA_DIR_NORM = BOT_MEDIA_DIR.replace(/\\/g, '/');
const OLD_STICKERS_DIR_NORM = OLD_STICKERS_DIR.replace(/\\/g, '/');

function looksLikePersonName(raw) {
  if (!raw) return false;
  const clean = raw.trim();
  if (/grupo|figurinhas|stickers|turma|clube/i.test(clean)) return false;
  const words = clean.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  const capitalizedWords = words.filter((w) => /^[A-ZÀ-Ý][a-zà-ÿ.'-]{1,}$/.test(w));
  return capitalizedWords.length === words.length;
}

function sanitizeGroupDisplayName(name, groupId) {
  const raw = typeof name === 'string' ? name.trim() : '';
  if (!raw) return null;

  const normalized = raw.toLowerCase();
  const normalizedGroup = String(groupId || '').trim().toLowerCase();
  const normalizedGroupBase = normalizedGroup.replace('@g.us', '');
  const normalizedNameBase = normalized.replace('@g.us', '');

  // Avoid persisting JIDs or their numeric portion as display names
  if (normalized === normalizedGroup || normalizedNameBase === normalizedGroupBase) {
    return null;
  }

  if (normalized.endsWith('@g.us')) {
    return null;
  }

  if (looksLikePersonName(raw)) {
    return null;
  }

  return raw;
}

// Helper: transforma file_path em URL servida pelo web
function filePathToUrl(file_path, mimetype) {
  if (!file_path) return null;

  const normalized = file_path.replace(/\\/g, '/');

  if (normalized.startsWith(OLD_STICKERS_DIR_NORM) || normalized.includes('/old-stickers/')) {
    return '/media/old-stickers/' + path.basename(normalized);
  }

  if (normalized.startsWith(BOT_MEDIA_DIR_NORM) || normalized.includes('/bot/media/')) {
    return '/bot/media/' + path.basename(normalized);
  }

  if (normalized.startsWith(FIGURINHAS_DIR_NORM)) {
    const rel = path.relative(FIGURINHAS_DIR_ABS, file_path).replace(/\\/g, '/');
    return '/figurinhas/' + rel;
  }

  let base = path.basename(file_path);
  if (!base.includes('.') && mimetype) {
    if (mimetype === 'image/webp') base += '.webp';
    else if (mimetype === 'video/mp4') base += '.mp4';
  }
  return '/media/' + base;
}

function withUrl(row) {
  if (!row) return row;
  if (!row.url) {
    row.url = filePathToUrl(row.file_path, row.mimetype);
  }
  return row;
}

function run(sql, params = {}) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}
function all(sql, params = {}) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}
function get(sql, params = {}) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function buildStickerURL(file_path) {
  if (!file_path) return '/media/';

  const normalized = file_path.replace(/\\/g, '/');
  const base = encodeURIComponent(path.basename(file_path));

  if (normalized.startsWith(OLD_STICKERS_DIR_NORM) || normalized.includes('/old-stickers/')) {
    return '/media/old-stickers/' + base;
  }

  if (normalized.startsWith(BOT_MEDIA_DIR_NORM) || normalized.includes('/bot/media/')) {
    return '/bot/media/' + base;
  }

  if (normalized.startsWith(FIGURINHAS_DIR_NORM)) {
    return '/figurinhas/' + base;
  }

  if (normalized.includes('/media/')) {
    return '/media/' + base;
  }

  return '/media/' + base;
}

async function listMedia({ q = '', tags = [], anyTag = [], nsfw = 'all', sort = 'newest', page = 1, perPage = 60, senderId = null } = {}) {
  try {
    page = Math.max(1, page);
    perPage = Math.min(200, Math.max(1, perPage));
    
    // Build the WHERE clause more efficiently
    const whereParts = []; 
    const params = {};
    if (senderId) {
      whereParts.push('m.sender_id = $senderId');
      params.$senderId = senderId;
    }

    // NSFW filter (with index support)
    if (nsfw === '0') {
      whereParts.push('m.nsfw = 0');
    } else if (nsfw === '1') {
      whereParts.push('m.nsfw = 1');
    }

    // Text search optimization - use FTS if available, otherwise LIKE with proper indexing
    if (q) {
      params.$q = `%${q}%`;
      // Search in both file_path and description with OR condition
      whereParts.push('(m.file_path LIKE $q OR m.description LIKE $q)');
    }

    // Optimize tag filtering with better query structure
    if (tags.length > 0 || anyTag.length > 0) {
      let tagConditions = [];
      
      // For ALL tags requirement (tags parameter)
      if (tags.length > 0) {
        tags.forEach((tag, i) => {
          params[`$tag${i}`] = tag;
        });
        const tagPlaceholders = tags.map((_, i) => `$tag${i}`).join(',');
        tagConditions.push(`
          (SELECT COUNT(DISTINCT t.name) 
           FROM media_tags mt 
           JOIN tags t ON t.id = mt.tag_id 
           WHERE mt.media_id = m.id AND t.name IN (${tagPlaceholders})) = ${tags.length}
        `);
      }
      
      // For ANY tags requirement (anyTag parameter)
      if (anyTag.length > 0) {
        anyTag.forEach((tag, i) => {
          params[`$anyTag${i}`] = tag;
        });
        const anyTagPlaceholders = anyTag.map((_, i) => `$anyTag${i}`).join(',');
        tagConditions.push(`
          EXISTS (SELECT 1 FROM media_tags mt2 
                  JOIN tags t2 ON t2.id = mt2.tag_id 
                  WHERE mt2.media_id = m.id AND t2.name IN (${anyTagPlaceholders}))
        `);
      }
      
      whereParts.push(...tagConditions);
    }

    // Optimize ORDER BY based on available indexes
    let orderClause;
    switch (sort) {
      case 'oldest':
        orderClause = 'm.timestamp ASC';
        break;
      case 'name':
        orderClause = 'm.file_path ASC';
        break;
      case 'popular':
        orderClause = 'm.count_random DESC, m.timestamp DESC';
        break;
      case 'random':
        orderClause = 'RANDOM()';
        break;
      default: // newest
        orderClause = 'm.timestamp DESC';
    }

    const whereClause = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';

    // Get total count more efficiently
    const countSQL = `
      SELECT COUNT(*) AS total
      FROM media m
      ${whereClause}
    `;
    
    const totalRow = await get(countSQL, params);
    const total = totalRow ? totalRow.total : 0;

    // Get paginated results
    const resultsSQL = `
      SELECT m.*
      FROM media m
      ${whereClause}
      ORDER BY ${orderClause}
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `;
    
    const rows = await all(resultsSQL, params);

    // Get tags for all media in one optimized query
    const mediaIds = rows.map(r => r.id);
    let tagsByMedia = {};
    
    if (mediaIds.length > 0) {
      const placeholders = mediaIds.map(() => '?').join(',');
      const tagsSQL = `
        SELECT mt.media_id, t.name
        FROM media_tags mt
        JOIN tags t ON t.id = mt.tag_id
        WHERE mt.media_id IN (${placeholders})
        ORDER BY mt.media_id, t.name
      `;
      
      const tagsRows = await all(tagsSQL, mediaIds);
      
      // Group tags by media_id efficiently
      tagsRows.forEach(row => {
        if (!tagsByMedia[row.media_id]) {
          tagsByMedia[row.media_id] = [];
        }
        tagsByMedia[row.media_id].push(row.name);
      });
    }

    // Map results with URL optimization
    const results = rows.map(r => ({
      id: r.id,
      chat_id: r.chat_id,
      group_id: r.group_id,
      sender_id: r.sender_id,
      file_path: r.file_path,
      url: buildStickerURL(r.file_path),
      mimetype: r.mimetype,
      timestamp: r.timestamp,
      description: r.description,
      hash_visual: r.hash_visual,
      hash_md5: r.hash_md5,
      nsfw: !!r.nsfw,
      count_random: r.count_random,
      tags: tagsByMedia[r.id] || []
    }));

    return { total, page, per_page: perPage, results };
  } catch (err) {
    console.error('[listMedia] ERRO:', err);
    return { total: 0, page: 1, per_page: perPage, results: [], error: String(err) };
  }
}

function getMediaById(id) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT
        id, chat_id, group_id, sender_id,
        file_path, mimetype, timestamp, description,
        hash_visual, hash_md5, nsfw, count_random
      FROM media
      WHERE id = ?
      LIMIT 1
    `;
    db.get(sql, [id], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(null);
      resolve(withUrl(row));
    });
  });
}

async function getRandomMedia({ q = '', tag = null, nsfw = 'all' } = {}) {
  const whereParts = [];
  const params = {};
  if (q) {
    params.$q = `%${q}%`;
    whereParts.push('(m.file_path LIKE $q OR m.description LIKE $q)');
  }
  if (nsfw === '0') whereParts.push('m.nsfw = 0');
  else if (nsfw === '1') whereParts.push('m.nsfw = 1');

  let joinTag = '';
  if (tag) {
    joinTag = `
      JOIN media_tags mt_r ON mt_r.media_id = m.id
      JOIN tags t_r ON t_r.id = mt_r.tag_id AND t_r.name = $tagName
    `;
    params.$tagName = tag;
  }
  const where = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';
  const totalRow = await get(`
    SELECT COUNT(*) AS total
    FROM media m
    ${joinTag}
    ${where}
  `, params);
  if (!totalRow || totalRow.total === 0) return null;
  const offset = Math.floor(Math.random() * totalRow.total);
  const row = await get(`
    SELECT m.* FROM media m
    ${joinTag}
    ${where}
    LIMIT 1 OFFSET $offset
  `, { ...params, $offset: offset });
  if (!row) return null;
  await run(`UPDATE media SET count_random = count_random + 1 WHERE id = $id`, { $id: row.id });
  const tagsCsvRow = await get(`
    SELECT GROUP_CONCAT(t.name, ',') AS tags_csv
    FROM media_tags mt
    JOIN tags t ON t.id = mt.tag_id
    WHERE mt.media_id = $id
  `, { $id: row.id });
  return {
    id: row.id,
    file_path: row.file_path,
    url: buildStickerURL(row.file_path),
    mimetype: row.mimetype,
    timestamp: row.timestamp,
    description: row.description,
    nsfw: !!row.nsfw,
    count_random: row.count_random + 1,
    tags: tagsCsvRow && tagsCsvRow.tags_csv ? tagsCsvRow.tags_csv.split(',').filter(Boolean) : []
  };
}

async function listTags({ q = '', order = 'usage', limit = 200 } = {}) {
  const params = { $limit: limit };
  let where = '';
  if (q) {
    params.$q = `%${q}%`;
    where = 'WHERE name LIKE $q';
  }
  let orderClause = 'usage_count DESC, name ASC';
  if (order === 'alpha') orderClause = 'name ASC';
  return all(`
    SELECT id, name, usage_count
    FROM tags
    ${where}
    ORDER BY ${orderClause}
    LIMIT $limit
  `, params);
}

async function addTagsToMedia(mediaId, tagNames = []) {
  if (!tagNames.length) return [];
  const added = [];
  for (const rawTag of tagNames) {
    const tag = rawTag.trim().toLowerCase();
    if (!tag) continue;
    let tagRow = await get(`SELECT id, usage_count FROM tags WHERE name = $n`, { $n: tag });
    if (!tagRow) {
      const ins = await run(`INSERT INTO tags (name, usage_count) VALUES ($n, 0)`, { $n: tag });
      tagRow = { id: ins.lastID, usage_count: 0 };
    }
    try {
      await run(`INSERT OR IGNORE INTO media_tags (media_id, tag_id) VALUES ($m, $t)`, { $m: mediaId, $t: tagRow.id });
      const usage = await get(`SELECT COUNT(*) AS c FROM media_tags WHERE tag_id = $t`, { $t: tagRow.id });
      await run(`UPDATE tags SET usage_count = $c WHERE id = $t`, { $c: usage.c, $t: tagRow.id });
      added.push(tag);
    } catch {}
  }
  bus.emit('media:tagsUpdated', { media_id: mediaId, tags: added });
  return added;
}

async function removeTagFromMedia(mediaId, tagName) {
  const row = await get(`SELECT id FROM tags WHERE name = $n`, { $n: tagName });
  if (!row) return false;
  await run(`DELETE FROM media_tags WHERE media_id = $m AND tag_id = $t`, { $m: mediaId, $t: row.id });
  const usage = await get(`SELECT COUNT(*) AS c FROM media_tags WHERE tag_id = $t`, { $t: row.id });
  await run(`UPDATE tags SET usage_count = $c WHERE id = $t`, { $c: usage.c, $t: row.id });
  bus.emit('media:tagsUpdated', { media_id: mediaId, removed: tagName });
  return true;
}

async function updateMediaMeta(id, { description, nsfw } = {}) {
  const sets = [];
  const params = { $id: id };
  if (typeof description === 'string') {
    sets.push('description = $description');
    params.$description = description;
  }
  if (nsfw === 0 || nsfw === 1) {
    sets.push('nsfw = $nsfw');
    params.$nsfw = nsfw;
  }
  if (!sets.length) return { updated: false };
  await run(`UPDATE media SET ${sets.join(', ')} WHERE id = $id`, params);
  return { updated: true };
}

async function setMediaTagsExact(mediaId, tagNames = []) {
  const normalized = [...new Set(tagNames.map(t => t.trim().toLowerCase()).filter(Boolean))];
  
  // Get current tags for this media
  const currentRows = await all(`
    SELECT t.id, t.name
    FROM media_tags mt
    JOIN tags t ON t.id = mt.tag_id
    WHERE mt.media_id = $m
  `, { $m: mediaId });
  
  const currentNames = new Set(currentRows.map(r => r.name));
  const toAdd = normalized.filter(n => !currentNames.has(n));
  const toRemove = [...currentNames].filter(n => !normalized.includes(n));
  
  // Batch operations for better performance
  if (toRemove.length > 0) {
    // Remove multiple tags in one operation
    const tagIdsToRemove = currentRows
      .filter(r => toRemove.includes(r.name))
      .map(r => r.id);
    
    if (tagIdsToRemove.length > 0) {
      const placeholders = tagIdsToRemove.map(() => '?').join(',');
      await run(`DELETE FROM media_tags WHERE media_id = ? AND tag_id IN (${placeholders})`, 
        [mediaId, ...tagIdsToRemove]);
      
      // Update usage counts for removed tags in batch
      for (const tagId of tagIdsToRemove) {
        const usage = await get(`SELECT COUNT(*) AS c FROM media_tags WHERE tag_id = ?`, [tagId]);
        await run(`UPDATE tags SET usage_count = ? WHERE id = ?`, [usage.c, tagId]);
      }
    }
  }
  
  // Add new tags
  if (toAdd.length > 0) {
    await addTagsToMedia(mediaId, toAdd);
  }
  
  // Emit single event for all changes
  if (toAdd.length > 0 || toRemove.length > 0) {
    bus.emit('media:tagsUpdated', { media_id: mediaId, added: toAdd, removed: toRemove });
  }
  
  return { added: toAdd, removed: toRemove };
}

async function rankTags({ metric = 'media', nsfw = 'all', since = null, until = null, limit = 50 } = {}) {
  limit = Math.min(500, Math.max(1, limit));
  const params = { $limit: limit };
  const whereParts = [];
  if (nsfw === '0') whereParts.push('m.nsfw = 0');
  else if (nsfw === '1') whereParts.push('m.nsfw = 1');
  if (since) { params.$since = since; whereParts.push('m.timestamp >= $since'); }
  if (until) { params.$until = until; whereParts.push('m.timestamp <= $until'); }
  const where = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';
  if (metric === 'usage') {
    return all(`
      SELECT t.name, t.usage_count AS value
      FROM tags t
      ORDER BY t.usage_count DESC, t.name ASC
      LIMIT $limit
    `, params);
  }
  return all(`
    SELECT t.name, COUNT(DISTINCT m.id) AS value
    FROM tags t
    JOIN media_tags mt ON mt.tag_id = t.id
    JOIN media m ON m.id = mt.media_id
    ${where}
    GROUP BY t.name
    ORDER BY value DESC, t.name ASC
    LIMIT $limit
  `, params);
}

async function rankUsers({ metric = 'count', nsfw = 'all', since = null, until = null, limit = 50 } = {}) {
  limit = Math.min(500, Math.max(1, limit));
  const params = { $limit: limit };
  const whereParts = ['m.sender_id IS NOT NULL'];
  if (nsfw === '0') whereParts.push('m.nsfw = 0');
  else if (nsfw === '1') whereParts.push('m.nsfw = 1');
  if (since) { params.$since = since; whereParts.push('m.timestamp >= $since'); }
  if (until) { params.$until = until; whereParts.push('m.timestamp <= $until'); }
  const where = 'WHERE ' + whereParts.join(' AND ');
  const aggSelect = metric === 'popular'
    ? 'SUM(m.count_random) AS score'
    : 'COUNT(m.id) AS score';
  return all(`
    SELECT
      m.sender_id,
      ${aggSelect},
      COUNT(m.id) AS total_media,
      SUM(m.count_random) AS total_random,
      MIN(m.timestamp) AS first_ts,
      MAX(m.timestamp) AS last_ts
    FROM media m
    ${where}
    GROUP BY m.sender_id
    HAVING score > 0
    ORDER BY score DESC, m.sender_id ASC
    LIMIT $limit
  `, params);
}

module.exports = {
  listMedia,
  getMediaById,
  getRandomMedia,
  listTags,
  addTagsToMedia,
  removeTagFromMedia,
  updateMediaMeta,
  setMediaTagsExact,
  rankTags,
  rankUsers,
  buildStickerURL,

  // ====== Group Metadata ======
  async listGroups({ limit = 1000, includeDormant = true } = {}) {
    const cappedLimit = Math.min(5000, Math.max(1, limit));
    const rows = await all(
      `
        WITH union_sources AS (
          SELECT group_id, last_interaction_ts FROM groups
          UNION
          SELECT group_id, NULL AS last_interaction_ts FROM group_users
          UNION
          SELECT group_id, NULL AS last_interaction_ts FROM media WHERE group_id IS NOT NULL AND TRIM(group_id) != ''
        )
        SELECT
          ids.group_id,
          COALESCE(g.display_name, '') AS display_name,
          g.last_interaction_ts
        FROM (
          SELECT DISTINCT group_id
          FROM union_sources
          WHERE group_id IS NOT NULL AND TRIM(group_id) != ''
        ) ids
        LEFT JOIN groups g ON g.group_id = ids.group_id
        ${includeDormant ? '' : 'WHERE COALESCE(g.last_interaction_ts, 0) > 0'}
        ORDER BY
          CASE WHEN COALESCE(g.display_name, '') = '' THEN 1 ELSE 0 END,
          LOWER(COALESCE(g.display_name, ids.group_id)),
          ids.group_id
        LIMIT $limit
      `,
      { $limit: cappedLimit }
    );

    return rows.map((row) => ({
      id: row.group_id,
      name: sanitizeGroupDisplayName(row.display_name, row.group_id) || row.group_id,
      lastInteractionTs: row.last_interaction_ts || null
    }));
  },

  async upsertGroupMetadata({ groupId, displayName = null, lastInteractionTs = null }) {
    if (!groupId) {
      return { changes: 0 };
    }

    const safeDisplayName = sanitizeGroupDisplayName(displayName, groupId);
    const now = Math.floor(Date.now() / 1000);
    return run(
      `
        INSERT INTO groups (group_id, display_name, last_interaction_ts, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(group_id) DO UPDATE SET
          display_name = CASE
            WHEN COALESCE(excluded.display_name, '') = '' THEN groups.display_name
            WHEN COALESCE(groups.display_name, '') = '' THEN excluded.display_name
            WHEN excluded.display_name <> groups.display_name THEN excluded.display_name
            ELSE groups.display_name
          END,
          last_interaction_ts = CASE
            WHEN groups.last_interaction_ts IS NULL THEN excluded.last_interaction_ts
            WHEN excluded.last_interaction_ts IS NULL THEN groups.last_interaction_ts
            ELSE MAX(groups.last_interaction_ts, excluded.last_interaction_ts)
          END,
          updated_at = excluded.updated_at
      `,
      [groupId, safeDisplayName, lastInteractionTs, now, now]
    );
  },

  // ====== Group Users Management ======
  async listGroupUsers(groupId) {
    return all(`SELECT * FROM group_users WHERE group_id = ?`, [groupId]);
  },
  async getGroupUser(groupId, userId) {
    return get(`SELECT * FROM group_users WHERE group_id = ? AND user_id = ?`, [groupId, userId]);
  },
  async upsertGroupUser({ group_id, user_id, role = 'user', blocked = 0, last_activity = null, interaction_count = 0, allowed_commands = null, restricted_commands = null }) {
    return run(`INSERT INTO group_users (group_id, user_id, role, blocked, last_activity, interaction_count, allowed_commands, restricted_commands)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(group_id, user_id) DO UPDATE SET role=excluded.role, blocked=excluded.blocked, last_activity=excluded.last_activity, interaction_count=excluded.interaction_count, allowed_commands=excluded.allowed_commands, restricted_commands=excluded.restricted_commands`,
      [group_id, user_id, role, blocked, last_activity, interaction_count, allowed_commands, restricted_commands]);
  },
  // Only allow updating specific fields to prevent SQL injection
  async updateGroupUserField(group_id, user_id, field, value) {
    const allowedFields = [
      'role',
      'blocked',
      'last_activity',
      'interaction_count',
      'allowed_commands',
      'restricted_commands'
    ];
    if (!allowedFields.includes(field)) {
      throw new Error(`Invalid field name: ${field}`);
    }
    return run(`UPDATE group_users SET ${field} = ? WHERE group_id = ? AND user_id = ?`, [value, group_id, user_id]);
  },
  async deleteGroupUser(group_id, user_id) {
    return run(`DELETE FROM group_users WHERE group_id = ? AND user_id = ?`, [group_id, user_id]);
  },

  // ====== Group Command Permissions ======
  async listGroupCommandPermissions(groupId) {
    return all(`SELECT * FROM group_command_permissions WHERE group_id = ?`, [groupId]);
  },
  async setGroupCommandPermission(group_id, command, allowed = 1) {
    return run(`INSERT INTO group_command_permissions (group_id, command, allowed)
      VALUES (?, ?, ?)
      ON CONFLICT(group_id, command) DO UPDATE SET allowed=excluded.allowed`,
      [group_id, command, allowed]);
  },
  async deleteGroupCommandPermission(group_id, command) {
    return run(`DELETE FROM group_command_permissions WHERE group_id = ? AND command = ?`, [group_id, command]);
  },

  // ====== Bot Config ======
  async getBotConfig(key) {
    const row = await get(`SELECT value FROM bot_config WHERE key = ?`, [key]);
    return row ? row.value : null;
  },
  async setBotConfig(key, value) {
    return run(`INSERT INTO bot_config (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`, [key, value]);
  }
  ,
  // ====== Direct-message (DM) users management for bot-level authorization ======
  async listDmUsers() {
    return all(`SELECT * FROM dm_users ORDER BY last_activity DESC`);
  },
  async getDmUser(userId) {
    return get(`SELECT * FROM dm_users WHERE user_id = ? LIMIT 1`, [userId]);
  },
  async upsertDmUser({ user_id, allowed = 0, blocked = 0, note = null, last_activity = null }) {
    const now = Math.floor(Date.now() / 1000);
    return run(`INSERT INTO dm_users (user_id, allowed, blocked, note, last_activity, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET allowed=excluded.allowed, blocked=excluded.blocked, note=excluded.note, last_activity=COALESCE(excluded.last_activity, dm_users.last_activity), updated_at=excluded.updated_at`,
      [user_id, allowed, blocked, note, last_activity, now, now]);
  },
  async deleteDmUser(userId) {
    return run(`DELETE FROM dm_users WHERE user_id = ?`, [userId]);
  },
  async updateDmUserField(user_id, field, value) {
    const allowedFields = ['allowed', 'blocked', 'note', 'last_activity'];
    if (!allowedFields.includes(field)) throw new Error(`Invalid field: ${field}`);
    return run(`UPDATE dm_users SET ${field} = ? WHERE user_id = ?`, [value, user_id]);
  }
};
