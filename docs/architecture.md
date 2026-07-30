# Repository Architecture Reference

This is the human-facing architecture reference. Repository-wide agent rules live in [`../AGENTS.md`](../AGENTS.md); this document describes the current system without acting as an additional automatic contract.

## Runtime

The project is a Node.js WhatsApp sticker bot with an Express administration surface, SQLite persistence, media processing, and optional AI/integration services. Stable root entrypoints preserve compatibility, while implementation lives under `src/`.

- `index.js`: bot entrypoint wrapper.
- `server.js`: web/server entrypoint wrapper.
- `src/bot/`: message handling, sticker processing, media queues, and delivery.
- `src/commands/`: command registry and handlers.
- `src/server/` and `src/waAdapter.js`: bridge and WhatsApp adapter behavior.
- `src/database/`: database handler, models, migrations, and LID mapping.
- `src/services/`: AI, media, payments, privacy, OpenViking, and other integrations.
- `src/web/`: Express routes, authentication, middleware, data access, and frontend assets.

## Operational boundaries

Runtime data is external to the repository: environment files, WhatsApp sessions, SQLite databases, WAL files, media, logs, backups, and local model files must not be committed. Public CI runs without WhatsApp, PM2, private services, operational databases, or credentials.

Production process supervision uses the PM2 instance owned by the configured operational user. Local development and CI should use the documented npm scripts instead of manually starting duplicate processes.

## Important compatibility contracts

- Preserve WPPConnect/WA-JS compatibility and the LID-to-phone-number mapping model.
- Prefer `listChats()` with the documented compatibility fallback.
- Preserve WebP/GIF handling and the configured FFmpeg fallback chain.
- Keep payment, privacy, authentication, and webhook secrets in external configuration.
- Database schema changes require migrations and integration validation.

## Validation

```bash
npm run check
npm run smoke
npm run test:integration
```

Use the smallest applicable command first and expand validation when the change crosses persistence, process, route, message, or integration boundaries. See [`TESTING.md`](TESTING.md) for the detailed test map.

## Related current documentation

- [`../README.md`](../README.md): installation and user-facing operation.
- [`TESTING.md`](TESTING.md): tests and validation.
- [`ROADMAP.md`](ROADMAP.md): current backlog.
- [`ai-systems.md`](ai-systems.md): AdminWatcher and ConversationAgent.
- [`agent-workflow.md`](agent-workflow.md): optional agent tooling workflow.
- [`AUTO_DEPLOY_WEBHOOK.md`](AUTO_DEPLOY_WEBHOOK.md): webhook deployment operation.
- [`LGPD_INVENTORY.md`](LGPD_INVENTORY.md): privacy inventory and retention baseline.
- [`MEMORY_OPENVIKING.md`](MEMORY_OPENVIKING.md): current memory integration.
- [`MERCADOPAGO_CHECKOUT_ORDERS.md`](MERCADOPAGO_CHECKOUT_ORDERS.md): payment integration.
