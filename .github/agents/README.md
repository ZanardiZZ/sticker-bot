# Specialist Agent Profiles

This directory contains explicit, task-scoped profiles. It is not the repository-wide instruction contract and is not automatically inherited by every agent. Start with the root [`AGENTS.md`](../../AGENTS.md).

## Selecting a profile

- [`sticker-bot-expert.md`](sticker-bot-expert.md): broad repository orientation and architecture.
- [`BOT.md`](BOT.md): WhatsApp, commands, bridge, message handling, and media.
- [`WEB.md`](WEB.md): Express, authentication, routes, and frontend.
- [`OPERATIONS.md`](OPERATIONS.md): local agent tooling and operational scripts.
- [`TESTING.md`](TESTING.md): validation selection and test boundaries.
- [`USAGE_GUIDE.md`](USAGE_GUIDE.md): optional prompts and local-agent workflows.
- [`agents.json`](agents.json): machine-readable profile metadata.

Load the smallest relevant profile. Profiles may explain domain-specific risks and commands, but global safety, portability, Git, and release rules always come from the root `AGENTS.md`.

## Maintenance rules

- Keep profiles focused on their declared scope.
- Do not copy the root contract into every profile.
- Prefer links to the canonical contract over duplicated policy.
- Use placeholders for hosts, models, accounts, and secrets.
- Update a profile when its commands or file map change; validate the affected commands before committing.
- Human-facing references belong under `docs/`, not in this directory.
