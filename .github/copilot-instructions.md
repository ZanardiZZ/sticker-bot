# Copilot Repository Instructions

Use [`AGENTS.md`](../AGENTS.md) as the canonical repository-wide contract. Do not treat this adapter as a second source of truth.

## Scope selection

1. Read the nearest nested `AGENTS.md` for the files being changed.
2. Load one explicit specialist profile from [`.github/agents/`](agents/README.md) only when the task is bot, web, operations, testing, or repository-agent work.
3. Consult `docs/` for human-facing architecture and operational details.

## Required baseline

- Keep changes portable and free of personal paths, private infrastructure identifiers, credentials, WhatsApp identifiers, sessions, databases, and media.
- Do not print secrets or add real-looking secret examples.
- Use the real scripts in `package.json`; at minimum run `npm run check`, and add `npm run smoke` or `npm run test:integration` when applicable.
- Do not add local runtime services or credentials to GitHub Actions.
