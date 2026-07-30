# AI Systems and Self-Healing Operations

This document describes active AI-assisted runtime components. It is a human-facing reference; global agent rules are in [`../AGENTS.md`](../AGENTS.md).

## AdminWatcher

The AdminWatcher implementation lives in `src/services/adminWatcher.js` and its diagnostic/remediation helpers live in `src/services/openaiTools.js`. It is an optional operational feature, controlled by environment configuration and disabled unless explicitly enabled.

Operational rules:

- keep remediation tools bounded and auditable;
- do not expose secrets, private infrastructure identifiers, or raw credentials in prompts or logs;
- validate changes with the focused unit tests before enabling the watcher;
- restart the `dev`-owned PM2 services only through the operational process manager.

## ConversationAgent

The group conversation component lives in `src/services/conversationAgent.js`. It uses bounded history, cooldowns, memory context where configured, and the existing AI provider abstraction. Changes must preserve message privacy, rate limits, fallback behavior, and prompt-size bounds.

## Configuration

Use `.env.example` only as a placeholder reference. Real values belong in external runtime configuration. Check presence without printing values:

```bash
test -n "${OPENAI_API_KEY:-}" && echo "OPENAI_API_KEY configured" || echo "OPENAI_API_KEY missing"
```

## Validation

```bash
npm run check
npm run test:integration
```

For message routing, persistence, or process-boundary changes, run both commands. Runtime smoke checks must not require WhatsApp connectivity or production credentials.

## Related references

- [`architecture.md`](architecture.md): current runtime boundaries.
- [`TESTING.md`](TESTING.md): test selection.
- [`MEMORY_OPENVIKING.md`](MEMORY_OPENVIKING.md): memory integration.
- [`../.github/agents/BOT.md`](../.github/agents/BOT.md): optional bot specialist profile.
- [`../.github/agents/OPERATIONS.md`](../.github/agents/OPERATIONS.md): optional operations profile.
