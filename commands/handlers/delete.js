const { safeReply } = require('../../utils/safeMessaging');
const { parseCommand } = require('../../utils/commandNormalizer');
const { normalizeJid, isJidGroup } = require('../../utils/jidUtils');
const { getEnvAdminSet, senderIsAdminFromMessage } = require('../../utils/adminUtils');
const {
  findById,
  deleteMediaByIds,
  addOrUpdateDeleteRequest,
  countDeleteRequests,
  clearDeleteRequests,
  getBotConfigValue,
  dbHandler
} = require('../../database');
const { DEFAULT_DELETE_VOTE_THRESHOLD } = require('../../config/botDefaults');
const { resolveSenderId } = require('../../database');

const CACHE_TTL_MS = 60 * 1000;
let cachedThresholdValue = null;
let cachedThresholdAt = 0;

function extractMediaIdFromCommand(rawCommand, paramList = []) {
  if (!rawCommand && (!paramList || paramList.length === 0)) return null;
  const normalized = (rawCommand || '').replace(/\s+/g, ' ').trim();
  const regex = /#\s*deletar\s+(?:id\s*[:=]?\s*)?(\d+)/i;
  const match = normalized.match(regex);
  if (match && match[1]) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  const tokens = Array.isArray(paramList) ? paramList : [];
  for (const token of tokens) {
    const digits = String(token).match(/(\d+)/);
    if (digits && digits[1]) {
      const parsed = Number(digits[1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }
  return null;
}

async function loadVoteThreshold() {
  const now = Date.now();
  if (cachedThresholdValue !== null && (now - cachedThresholdAt) < CACHE_TTL_MS) {
    return cachedThresholdValue;
  }

  const stored = await getBotConfigValue('delete_vote_threshold');
  const parsed = Number(stored);
  const threshold = Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : DEFAULT_DELETE_VOTE_THRESHOLD;
  cachedThresholdValue = threshold;
  cachedThresholdAt = now;
  return threshold;
}

function invalidateVoteThresholdCache() {
  cachedThresholdValue = null;
  cachedThresholdAt = 0;
}

async function senderIsAdminInGroup(groupId, userId) {
  if (!groupId || !userId) return false;
  try {
    const row = await dbHandler.get(
      'SELECT role FROM group_users WHERE group_id = ? AND user_id = ? LIMIT 1',
      [groupId, userId]
    );
    if (!row || !row.role) return false;
    const role = String(row.role).toLowerCase();
    return role === 'admin' || role === 'owner' || role === 'moderator';
  } catch (error) {
    if (error && error.message && error.message.includes('no such table')) {
      return false;
    }
    console.warn('[DELETE] Falha ao consultar tabela group_users:', error?.message || error);
    return false;
  }
}

async function isAdminOrOwner({
  resolvedSenderId,
  message,
  groupId,
  mediaSenderId,
  isGroup
}) {
  const normalizedSender = normalizeJid(resolvedSenderId);
  if (!normalizedSender) return false;

  if (!isGroup) {
    return true;
  }

  const envAdmins = getEnvAdminSet();
  if (envAdmins.has(normalizedSender)) {
    return true;
  }

  if (senderIsAdminFromMessage(message)) {
    return true;
  }

  if (mediaSenderId && normalizeJid(mediaSenderId) === normalizedSender) {
    return true;
  }

  if (groupId) {
    const normalizedGroup = normalizeJid(groupId);
    if (await senderIsAdminInGroup(normalizedGroup, normalizedSender)) {
      return true;
    }
  }

  return false;
}

async function ensureResolvedSenderId(client, message, context) {
  if (context?.resolvedSenderId) {
    return context.resolvedSenderId;
  }

  const messageKey = message?.key || {};
  const rawSender = context?.rawSenderId || messageKey.participant || messageKey.participantAlt || message?.sender?.id || message?.author || message?.from;
  if (!rawSender) return null;

  try {
    return await resolveSenderId(client?.sock || client, rawSender);
  } catch (error) {
    console.warn('[DELETE] Falha ao resolver senderId, usando raw:', error?.message || error);
    return rawSender;
  }
}

async function attemptMediaDeletion(mediaId) {
  const deleted = await deleteMediaByIds([mediaId]);
  if (deleted > 0) {
    await clearDeleteRequests(mediaId);
    return true;
  }
  return false;
}

async function handleDeleteCommand(client, message, chatId, params = [], context = {}) {
  const rawCommand = message?.body || message?.caption || '';
  const payloadParams = params && params.length ? params : parseCommand(rawCommand || '').params || [];
  const mediaId = extractMediaIdFromCommand(rawCommand, payloadParams);

  if (!mediaId) {
    await safeReply(client, chatId, 'Formato inválido. Use *#deletar ID 123* para solicitar a exclusão.', message);
    return true;
  }

  try {
    const media = await findById(mediaId);
    if (!media) {
      await safeReply(client, chatId, `Não encontrei a mídia com ID ${mediaId}.`, message);
      return true;
    }

    const resolvedSenderId = await ensureResolvedSenderId(client, message, context);
    if (!resolvedSenderId) {
      await safeReply(client, chatId, 'Não consegui identificar quem enviou o comando.', message);
      return true;
    }

    const normalizedSender = normalizeJid(resolvedSenderId);
    const groupId = context?.groupId || message?.from || message?.chatId;
    const isGroup = context?.isGroup ?? isJidGroup(groupId || '');

    const adminAction = await isAdminOrOwner({
      resolvedSenderId: normalizedSender,
      message,
      groupId,
      mediaSenderId: media?.sender_id,
      isGroup
    });

    if (adminAction) {
      const deleted = await attemptMediaDeletion(mediaId);
      if (deleted) {
        await safeReply(client, chatId, `🗑️ Mídia ID ${mediaId} deletada imediatamente.`, message);
      } else {
        await safeReply(client, chatId, `Não foi possível deletar a mídia ID ${mediaId}. Tente novamente mais tarde.`, message);
      }
      return true;
    }

    const normalizedGroup = groupId ? normalizeJid(groupId) : null;
    const voteResult = await addOrUpdateDeleteRequest(mediaId, normalizedSender, normalizedGroup);
    const totalVotes = await countDeleteRequests(mediaId);
    const threshold = await loadVoteThreshold();

    if (totalVotes >= threshold) {
      const deleted = await attemptMediaDeletion(mediaId);
      if (deleted) {
        await safeReply(client, chatId, `🗑️ Mídia ID ${mediaId} deletada após atingir ${totalVotes} votos.`, message);
      } else {
        await safeReply(client, chatId, `Alcançamos ${totalVotes} votos, mas ocorreu um erro ao deletar a mídia ID ${mediaId}.`, message);
      }
      return true;
    }

    const remaining = Math.max(threshold - totalVotes, 0);
    if (voteResult.inserted) {
      await safeReply(client, chatId, `🗳️ Seu voto para deletar a mídia ID ${mediaId} foi registrado. Faltam ${remaining} voto(s).`, message);
    } else {
      await safeReply(client, chatId, `Você já havia solicitado a exclusão da mídia ID ${mediaId}. Ainda faltam ${remaining} voto(s).`, message);
    }
    return true;
  } catch (error) {
    console.error('[DELETE] Erro ao processar comando #deletar:', error);
    await safeReply(client, chatId, 'Erro ao processar sua solicitação de exclusão.', message);
    return true;
  }
}

module.exports = {
  handleDeleteCommand,
  invalidateVoteThresholdCache
};
