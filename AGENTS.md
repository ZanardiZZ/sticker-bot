# Repository Agent Contract

This is the canonical repository-wide contract for coding agents. Read it before making changes. A nearer `AGENTS.md` applies only to the directory subtree where it lives and may add local rules; it must not contradict this file.

## Authority and scope

- `AGENTS.md` at the repository root is the global contract.
- The nearest nested `AGENTS.md` contains only rules specific to that leaf.
- `CLAUDE.md` and `.github/copilot-instructions.md` are short tool adapters that point here; do not duplicate this contract in them.
- `.github/agents/` contains explicit specialist profiles, not automatically inherited instructions. Load one only when the task matches its scope.
- `docs/` contains human-facing architecture and operational references, not hidden agent instructions.

## Repository shape

- `src/bot/`, `src/commands/`, `src/server/`, and `src/waAdapter.js`: WhatsApp and message processing.
- `src/database/`: SQLite access, models, migrations, and persistence helpers.
- `src/services/`: integrations, queues, AI, media, payments, and business services.
- `src/web/`: Express server, routes, middleware, and public frontend.
- `tests/`: unit and integration tests.
- `scripts/`: migrations, operations, validation, and agent tooling.
- `storage/`, databases, sessions, media, logs, backups, and local model files are operational data and must not enter Git.

## Change rules

1. Inspect the current implementation and the nearest local contract before editing.
2. Prefer small, reversible changes. Preserve public IDs, environment-variable contracts, compatibility fallbacks, and database migrations unless the task explicitly changes them.
3. Keep configuration portable: use `process.env`, `__dirname`, repository-relative paths, or documented external configuration. Never commit personal paths, private IPs, phone numbers, WhatsApp JIDs, cookies, QR data, tokens, keys, passwords, or connection strings.
4. Examples must use unmistakable placeholders such as `<YOUR_VALUE>` or `[REDACTED]`; never use realistic-looking secrets. Do not print secret values while diagnosing configuration.
5. Do not put PM2, WhatsApp sessions, SQLite databases, local services, or host-specific paths into GitHub Actions. CI must work from a clean public checkout with no `.env` or credentials.
6. Graphify is maintained outside this repository by `/home/dev/bin/stickerbot2-graphify`; do not add `graphify-out`, local caches, or Graphify dependencies to the project.

## Validation

Use the smallest sufficient gate, then expand when behavior crosses boundaries:

```bash
npm ci
npm run check              # lint + formatting + unit tests
npm run smoke              # startup-path and syntax checks
npm run test:integration   # database, routing, and cross-service behavior
```

For workflow or package changes, also run:

```bash
npx --no-install prettier --check .github/workflows/*.yml package.json package-lock.json
npm ci --dry-run --ignore-scripts
```

Do not claim completion without real command output. If a test is environment-dependent, identify the dependency and run the closest clean-checkout equivalent.

## Runtime and release safety

- The operational PM2 instance belongs to the `dev` user. Never create a second root PM2 instance on the deployment host.
- Stop and restart services only when needed, and verify process count, ports, and logs afterward.
- Before history rewrites, force-pushes, deletions, or public releases, create a reversible backup and validate all branches/tags/refs.
- Never force-push or publish credentials without explicit user authorization.

## Documentation map

- `docs/architecture.md`: human architecture and repository reference.
- `docs/ai-systems.md`: AdminWatcher, ConversationAgent, and AI-system operations.
- `docs/agent-workflow.md`: agent tooling workflow.
- `docs/agent-docs-summary.md`: summary of the specialist documentation set.
- `.github/agents/README.md`: specialist-profile catalog.
