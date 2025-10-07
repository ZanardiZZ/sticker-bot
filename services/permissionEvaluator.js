/**
 * Group permission evaluation service
 * Provides caching and helpers to determine if a command is allowed for a group/user
 */

const { normalizeText } = require('../utils/commandNormalizer');
const { normalizeJid } = require('../utils/jidUtils');

const DEFAULT_CACHE_TTL_MS = Number(process.env.PERMISSION_CACHE_TTL_MS) || 30_000;
const WILDCARD_COMMANDS = new Set(['*', 'all', 'todos', 'qualquer', 'any', '__all__', 'default', 'padrao']);

/**
 * Normalize command identifier removing accents, lowercasing and stripping leading '#'
 * @param {string} command
 * @returns {string}
 */
function normalizeCommandKey(command) {
  const normalized = normalizeText(command);
  if (!normalized) return '';
  return normalized.startsWith('#') ? normalized.slice(1) : normalized;
}

/**
 * Factory to create a permission evaluator with injectable data dependencies
 * @param {Object} deps
 * @param {Function} deps.listGroupCommandPermissions
 * @param {Function} deps.getGroupUser
 */
function createPermissionEvaluator(deps = {}) {
  const {
    listGroupCommandPermissions,
    getGroupUser
  } = deps;

  if (typeof listGroupCommandPermissions !== 'function') {
    throw new Error('listGroupCommandPermissions dependency is required');
  }
  if (typeof getGroupUser !== 'function') {
    throw new Error('getGroupUser dependency is required');
  }

  const groupCache = new Map();
  const userCache = new Map();

  function buildCacheEntry(value, ttl = DEFAULT_CACHE_TTL_MS) {
    return {
      value,
      expiresAt: Date.now() + ttl
    };
  }

  function getCacheValue(cache, key) {
    if (!cache.has(key)) return null;
    const entry = cache.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  }

  function setCacheValue(cache, key, value, ttl) {
    cache.set(key, buildCacheEntry(value, ttl));
  }

  async function fetchGroupConfig(groupId) {
    const normalizedGroup = normalizeJid(groupId);
    if (!normalizedGroup) {
      return {
        groupId: null,
        rules: new Map(),
        ruleList: [],
        defaultRule: null,
        fetchedAt: new Date().toISOString()
      };
    }

    const cached = getCacheValue(groupCache, normalizedGroup);
    if (cached) return cached;

    let rows = [];
    try {
      rows = await listGroupCommandPermissions(groupId);
    } catch (error) {
      console.error('[PERMISSIONS] Falha ao carregar permissões do grupo:', groupId, error);
      throw error;
    }

    const ruleMap = new Map();
    const ruleList = [];
    let defaultRule = null;

    for (const row of rows || []) {
      const commandRaw = row?.command || '';
      const commandKey = normalizeCommandKey(commandRaw);
      if (!commandKey) continue;

      const allowed = row?.allowed === 1 || row?.allowed === true;
      if (WILDCARD_COMMANDS.has(commandKey)) {
        defaultRule = {
          command: commandRaw,
          key: commandKey,
          allowed
        };
        continue;
      }

      ruleMap.set(commandKey, {
        allowed,
        command: commandRaw
      });
      ruleList.push({
        command: commandRaw,
        key: commandKey,
        allowed
      });
    }

    const config = {
      groupId: normalizedGroup,
      rules: ruleMap,
      ruleList,
      defaultRule,
      fetchedAt: new Date().toISOString()
    };

    setCacheValue(groupCache, normalizedGroup, config);
    return config;
  }

  function parseCommandList(raw) {
    if (!raw) return new Set();
    let list = [];
    if (Array.isArray(raw)) {
      list = raw;
    } else {
      try {
        list = JSON.parse(raw);
      } catch (error) {
        console.warn('[PERMISSIONS] Falha ao analisar lista de comandos do usuário:', error?.message || error);
        return new Set();
      }
    }
    const result = new Set();
    for (const item of list) {
      const key = normalizeCommandKey(String(item || ''));
      if (!key) continue;
      result.add(key);
    }
    return result;
  }

  async function fetchGroupUserConfig(groupId, userId) {
    const normalizedGroup = normalizeJid(groupId);
    const normalizedUser = normalizeJid(userId);
    if (!normalizedGroup || !normalizedUser) return null;

    const cacheKey = `${normalizedGroup}::${normalizedUser}`;
    const cached = getCacheValue(userCache, cacheKey);
    if (cached) return cached;

    let row = null;
    try {
      row = await getGroupUser(groupId, userId);
    } catch (error) {
      console.error('[PERMISSIONS] Falha ao carregar usuário do grupo:', { groupId, userId, error });
      throw error;
    }

    if (!row) {
      const emptyConfig = {
        exists: false,
        blocked: false,
        allowedCommands: new Set(),
        restrictedCommands: new Set(),
        fetchedAt: new Date().toISOString()
      };
      setCacheValue(userCache, cacheKey, emptyConfig);
      return emptyConfig;
    }

    const allowedCommands = parseCommandList(row.allowed_commands);
    const restrictedCommands = parseCommandList(row.restricted_commands);

    const config = {
      exists: true,
      blocked: row.blocked === 1 || row.blocked === true,
      role: row.role || 'user',
      allowedCommands,
      restrictedCommands,
      fetchedAt: new Date().toISOString()
    };

    setCacheValue(userCache, cacheKey, config);
    return config;
  }

  function summarizeGroupConfig(config) {
    const allowRules = config.ruleList.filter(rule => rule.allowed).length;
    const denyRules = config.ruleList.filter(rule => !rule.allowed).length;
    return {
      groupId: config.groupId,
      totalRules: config.ruleList.length,
      allowRules,
      denyRules,
      defaultBehavior: config.defaultRule ? (config.defaultRule.allowed ? 'allow' : 'deny') : 'allow',
      hasDefaultRule: Boolean(config.defaultRule),
      defaultRule: config.defaultRule ? { command: config.defaultRule.command, allowed: config.defaultRule.allowed } : null,
      fetchedAt: config.fetchedAt
    };
  }

  async function getGroupPermissionSummary(groupId) {
    const config = await fetchGroupConfig(groupId);
    return summarizeGroupConfig(config);
  }

  async function evaluateGroupCommandPermission({ groupId, userId, command }) {
    const commandKey = normalizeCommandKey(command);
    const normalizedGroup = normalizeJid(groupId);
    const normalizedUser = normalizeJid(userId);

    if (!commandKey || !normalizedGroup) {
      return {
        allowed: true,
        reasonCode: 'not_a_command',
        detail: 'Mensagem não é um comando válido ou grupo ausente.',
        userMessage: null,
        meta: {
          groupId: normalizedGroup,
          userId: normalizedUser,
          command,
          commandKey
        }
      };
    }

    const groupConfig = await fetchGroupConfig(groupId);
    const summary = summarizeGroupConfig(groupConfig);
    const userConfig = userId ? await fetchGroupUserConfig(groupId, userId) : null;

    const context = {
      groupId: normalizedGroup,
      userId: normalizedUser,
      command,
      commandKey,
      summary,
      groupRules: groupConfig.ruleList.map(rule => ({ command: rule.command, allowed: rule.allowed })),
      defaultRule: groupConfig.defaultRule ? { command: groupConfig.defaultRule.command, allowed: groupConfig.defaultRule.allowed } : null,
      userRules: userConfig ? {
        blocked: userConfig.blocked,
        role: userConfig.role,
        allowedCommands: Array.from(userConfig.allowedCommands),
        restrictedCommands: Array.from(userConfig.restrictedCommands)
      } : null,
      fetchedAt: new Date().toISOString(),
      ruleApplied: null
    };

    if (userConfig && userConfig.blocked) {
      context.ruleApplied = { type: 'user_block' };
      return {
        allowed: false,
        reasonCode: 'user_blocked',
        detail: 'Usuário marcado como bloqueado nas configurações do grupo.',
        userMessage: '🚫 Você não tem autorização para usar comandos neste grupo. Procure um administrador.',
        meta: context
      };
    }

    if (userConfig && userConfig.restrictedCommands.has(commandKey)) {
      context.ruleApplied = { type: 'user_restriction', value: commandKey };
      return {
        allowed: false,
        reasonCode: 'user_restricted_command',
        detail: `Usuário possui restrição para o comando "${command}".`,
        userMessage: `🚫 Você não tem permissão para usar ${command} neste grupo.`,
        meta: context
      };
    }

    if (userConfig && userConfig.allowedCommands.size > 0 && !userConfig.allowedCommands.has(commandKey)) {
      context.ruleApplied = { type: 'user_allowlist', value: commandKey };
      return {
        allowed: false,
        reasonCode: 'user_allowlist_miss',
        detail: `Usuário não está na lista de liberação para o comando "${command}".`,
        userMessage: `🚫 Apenas usuários autorizados podem usar ${command} neste grupo.`,
        meta: context
      };
    }

    const groupRule = groupConfig.rules.get(commandKey);
    if (groupRule) {
      context.ruleApplied = { type: 'group_rule', command: groupRule.command, allowed: groupRule.allowed };
      if (!groupRule.allowed) {
        return {
          allowed: false,
          reasonCode: 'group_command_blocked',
          detail: `Comando "${command}" está configurado como bloqueado para o grupo.`,
          userMessage: `🚫 O comando ${command} está desativado neste grupo.`,
          meta: context
        };
      }
    } else if (groupConfig.defaultRule && groupConfig.defaultRule.allowed === false) {
      context.ruleApplied = { type: 'group_default_block', command: groupConfig.defaultRule.command };
      return {
        allowed: false,
        reasonCode: 'group_default_block',
        detail: 'O grupo bloqueia comandos por padrão e o comando solicitado não está liberado.',
        userMessage: `🚫 Este grupo bloqueia comandos por padrão. ${command} não está liberado.`,
        meta: context
      };
    }

    context.ruleApplied = context.ruleApplied || { type: 'allowed' };
    return {
      allowed: true,
      reasonCode: 'allowed',
      detail: 'Permissão concedida.',
      userMessage: null,
      meta: context
    };
  }

  function invalidateGroupPermissionCache(groupId) {
    if (!groupId) {
      groupCache.clear();
      userCache.clear();
      return;
    }
    const normalizedGroup = normalizeJid(groupId);
    if (!normalizedGroup) return;
    groupCache.delete(normalizedGroup);
    for (const key of Array.from(userCache.keys())) {
      if (key.startsWith(`${normalizedGroup}::`)) {
        userCache.delete(key);
      }
    }
  }

  function invalidateGroupUserCache(groupId, userId) {
    if (!groupId) {
      userCache.clear();
      return;
    }
    const normalizedGroup = normalizeJid(groupId);
    if (!normalizedGroup) return;
    if (!userId) {
      for (const key of Array.from(userCache.keys())) {
        if (key.startsWith(`${normalizedGroup}::`)) {
          userCache.delete(key);
        }
      }
      return;
    }
    const normalizedUser = normalizeJid(userId);
    userCache.delete(`${normalizedGroup}::${normalizedUser}`);
  }

  return {
    evaluateGroupCommandPermission,
    getGroupPermissionSummary,
    invalidateGroupPermissionCache,
    invalidateGroupUserCache,
    // expose internals for testing/debugging if needed
    _getCaches: () => ({ groupCache, userCache })
  };
}

// Create default evaluator using real data access layer
const dataAccess = require('../web/dataAccess');

const defaultEvaluator = createPermissionEvaluator({
  listGroupCommandPermissions: dataAccess.listGroupCommandPermissions,
  getGroupUser: dataAccess.getGroupUser
});

module.exports = {
  createPermissionEvaluator,
  evaluateGroupCommandPermission: defaultEvaluator.evaluateGroupCommandPermission,
  getGroupPermissionSummary: defaultEvaluator.getGroupPermissionSummary,
  invalidateGroupPermissionCache: defaultEvaluator.invalidateGroupPermissionCache,
  invalidateGroupUserCache: defaultEvaluator.invalidateGroupUserCache
};
