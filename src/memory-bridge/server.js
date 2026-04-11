#!/usr/bin/env node

require('dotenv').config();

const express = require('express');
const { MemoryStore, DB_PATH } = require('./store');
const { inferTopic, llmConfig } = require('./llm');

const PORT = Number(process.env.MEMORY_BRIDGE_PORT || 8766);
const BIND_HOST = process.env.MEMORY_BRIDGE_HOST || '0.0.0.0';
const API_TOKEN = String(process.env.MEMORY_BRIDGE_TOKEN || '').trim();

const CATEGORY_PREFIXES = {
  confirmed: 'confirmed:',
  softSignal: 'soft:',
  provisional: 'provisional:'
};

function decodeFactCategory(category = '') {
  const value = String(category || '').trim();
  if (!value) return { memoryType: 'confirmed', category: 'general' };

  if (value.startsWith(CATEGORY_PREFIXES.confirmed)) {
    return { memoryType: 'confirmed', category: value.slice(CATEGORY_PREFIXES.confirmed.length) || 'general' };
  }
  if (value.startsWith(CATEGORY_PREFIXES.softSignal)) {
    return { memoryType: 'softSignal', category: value.slice(CATEGORY_PREFIXES.softSignal.length) || 'general' };
  }
  if (value.startsWith(CATEGORY_PREFIXES.provisional)) {
    return { memoryType: 'provisional', category: value.slice(CATEGORY_PREFIXES.provisional.length) || 'general' };
  }
  return { memoryType: 'confirmed', category: value || 'general' };
}

function asMemoryItem(row) {
  const parsed = decodeFactCategory(row?.category || 'general');
  return {
    fact: row?.fact,
    category: parsed.category,
    memoryType: parsed.memoryType,
    confidence: Number.isFinite(Number(row?.confidence)) ? Number(row.confidence) : 0.7,
    source: row?.source || 'memory_bridge',
    createdAt: row?.created_at || null
  };
}

function aggregateTopics(events = [], max = 5) {
  const counts = new Map();
  for (const ev of events) {
    const topic = String(ev?.topic || '').trim().toLowerCase();
    if (!topic) continue;
    counts.set(topic, (counts.get(topic) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([topic, mentions]) => ({ topic, mentions }));
}

async function main() {
  const app = express();
  const store = new MemoryStore();
  await store.init();

  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    if (!API_TOKEN) return next();
    const provided = req.headers['x-memory-token'] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (String(provided || '') !== API_TOKEN) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    return next();
  });

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'memory-bridge',
      dbPath: DB_PATH,
      llm: llmConfig
    });
  });

  app.get('/api/user/:id', async (req, res) => {
    const userId = String(req.params.id || '').trim();
    if (!userId) return res.status(400).json({ error: 'invalid_user_id' });

    const user = await store.getUser(userId);
    if (!user) return res.json({ exists: false });

    return res.json({
      exists: true,
      userId,
      name: user.name || null,
      firstSeen: user.first_seen || null,
      updatedAt: user.updated_at || null,
      metadata: user.metadata_json ? JSON.parse(user.metadata_json) : {}
    });
  });

  app.post('/api/user/:id', async (req, res) => {
    const userId = String(req.params.id || '').trim();
    if (!userId) return res.status(400).json({ error: 'invalid_user_id' });

    const saved = await store.saveUser(userId, req.body || {});
    return res.json({ ok: true, exists: true, userId, name: saved?.name || null });
  });

  app.post('/api/user/:id/fact', async (req, res) => {
    const userId = String(req.params.id || '').trim();
    const fact = String(req.body?.fact || '').trim();
    const category = String(req.body?.category || 'general').trim() || 'general';
    const confidence = Number.isFinite(Number(req.body?.confidence)) ? Number(req.body.confidence) : 0.7;
    const source = String(req.body?.source || 'memory_bridge').trim();

    if (!userId || !fact) {
      return res.status(400).json({ error: 'invalid_payload' });
    }

    await store.addFact(userId, fact, category, confidence, source);
    return res.json({ ok: true });
  });

  app.get('/api/user/:id/facts', async (req, res) => {
    const userId = String(req.params.id || '').trim();
    const category = req.query.category ? String(req.query.category) : null;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    if (!userId) return res.status(400).json({ error: 'invalid_user_id' });

    const facts = await store.getFacts(userId, { category, limit });
    return res.json({ userId, facts });
  });

  app.get('/api/group/:id', async (req, res) => {
    const groupId = String(req.params.id || '').trim();
    if (!groupId) return res.status(400).json({ error: 'invalid_group_id' });

    const group = await store.getGroup(groupId);
    if (!group) return res.json({ exists: false });

    return res.json({
      exists: true,
      groupId,
      name: group.name || null,
      firstSeen: group.first_seen || null,
      updatedAt: group.updated_at || null,
      metadata: group.metadata_json ? JSON.parse(group.metadata_json) : {}
    });
  });

  app.post('/api/group/:id', async (req, res) => {
    const groupId = String(req.params.id || '').trim();
    if (!groupId) return res.status(400).json({ error: 'invalid_group_id' });

    const saved = await store.saveGroup(groupId, req.body || {});
    return res.json({ ok: true, exists: true, groupId, name: saved?.name || null });
  });

  app.post('/api/group/:id/joke', async (req, res) => {
    const groupId = String(req.params.id || '').trim();
    const name = String(req.body?.name || '').trim();
    const origin = String(req.body?.origin || '').trim();
    const context = String(req.body?.context || '').trim();

    if (!groupId || !name || !context) {
      return res.status(400).json({ error: 'invalid_payload' });
    }

    await store.addRunningJoke(groupId, name, origin, context);
    return res.json({ ok: true });
  });

  app.post('/api/event', async (req, res) => {
    const payload = req.body || {};
    const description = String(payload.description || payload.content || '').trim();

    let topic = String(payload.topic || '').trim();
    if (!topic && description) {
      const inferred = await inferTopic(description);
      topic = inferred?.topic || '';
    }

    await store.logEvent({ ...payload, topic: topic || null });
    return res.json({ ok: true, topic: topic || null });
  });

  app.get('/api/events', async (req, res) => {
    const groupId = req.query.groupId ? String(req.query.groupId) : null;
    const type = req.query.type ? String(req.query.type) : null;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const events = await store.getEvents({ groupId, type, limit });
    return res.json({ events });
  });

  app.get('/api/insights/:groupId', async (req, res) => {
    const groupId = String(req.params.groupId || '').trim();
    const userIds = String(req.query.userIds || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const users = {};
    for (const userId of userIds) {
      const facts = await store.getFacts(userId, { limit: 40 });
      const memoryItems = facts.map(asMemoryItem);
      users[userId] = {
        confirmedFacts: memoryItems.filter((item) => item.memoryType === 'confirmed'),
        softSignals: memoryItems.filter((item) => item.memoryType === 'softSignal'),
        provisionalMemories: memoryItems.filter((item) => item.memoryType === 'provisional'),
        recentFacts: memoryItems.slice(0, 8)
      };
    }

    const group = await store.getGroup(groupId);
    const runningJokes = await store.getRunningJokes(groupId, 20);
    const recentEvents = await store.getEvents({ groupId, limit: 80 });
    const activeTopics = aggregateTopics(recentEvents, 6);

    return res.json({
      users,
      group: {
        groupId,
        name: group?.name || null,
        runningJokes,
        activeTopics
      }
    });
  });

  app.listen(PORT, BIND_HOST, () => {
    console.log(`[MemoryBridge] up on http://${BIND_HOST}:${PORT}`);
    console.log(`[MemoryBridge] db=${DB_PATH}`);
    console.log(`[MemoryBridge] llm=${llmConfig.model} at ${llmConfig.url}`);
  });
}

main().catch((error) => {
  console.error('[MemoryBridge] fatal:', error);
  process.exit(1);
});
