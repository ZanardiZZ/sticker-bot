# Agent Workflow

This repository supports a terminal-first workflow with one primary coding agent and an optional remote Ollama sidecar on `192.168.20.24:11434`.

## Primary Commands

- `npm run check`
- `npm run smoke`
- `npm run test:unit`
- `npm run test:integration`
- `npm run agent:context`
- `npm run agent:tooling`
- `npm run agent:deepseek -- --prompt "task"`
- `npm run agent:ollama:proxy`
- `npm run agent:codex:deepseek`
- `npm run agent:codex:deepseek:exec -- --skip-git-repo-check "task"`

If you prefer shorter commands:

- `just check`
- `just smoke`
- `just agent-context`
- `just agent-tooling`
- `just deepseek-task "task"`

If `just` is not installed, use the equivalent `make` targets:

- `make check`
- `make smoke`
- `make agent-context`
- `make agent-tooling`
- `make deepseek-task PROMPT="task"`
- `make ollama-proxy`
- `make codex-deepseek`
- `make codex-deepseek-exec PROMPT="task"`

If your shell has the local zsh helpers loaded, you can also use:

- `oproxy`
- `oproxystop`
- `cdeep`
- `cdeepexec "task"`
- `dside "task"`

## Agent Roles

### Primary coding agent

Use the primary agent for:

- final code edits
- integration across multiple subsystems
- test execution and failure triage
- review of diffs produced by sidecars

### DeepSeek sidecar

Use the remote DeepSeek sidecar for:

- repository exploration
- code sketching and first-pass drafts
- summarizing large files
- proposing refactors before the primary agent edits the repo

Do not treat the sidecar as the source of truth. Final validation stays local.

### DeepSeek as Codex engine

Use the Codex wrappers when you want the `codex` CLI itself to run against the remote Ollama host through a local proxy bound to `127.0.0.1:11434`.

- Interactive: `npm run agent:codex:deepseek`
- Non-interactive: `npm run agent:codex:deepseek:exec -- --skip-git-repo-check "task"`

Current limitation:

- `deepseek-coder:6.7b` is reachable through Ollama and works through the sidecar wrapper.
- The current Codex OSS provider rejects `deepseek-coder:6.7b` because the model does not support tools.
- If you want the `codex` CLI itself to drive the proxy-backed Ollama model, use a tool-capable model such as `qwen3:8b`:

```bash
DEEPSEEK_MODEL=qwen3:8b npm run agent:codex:deepseek
```

## DeepSeek Configuration

The wrapper supports two modes.

### 1. HTTP endpoint

Set:

- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_MODEL`
- `DEEPSEEK_API_KEY` when required

Examples:

```bash
export DEEPSEEK_BASE_URL=http://deepseek-host:11434/api/generate
export DEEPSEEK_MODEL=deepseek-coder:6.7b
```

Or for an OpenAI-compatible endpoint:

```bash
export DEEPSEEK_BASE_URL=http://deepseek-host:8000/v1
export DEEPSEEK_MODEL=deepseek-coder:6.7b
export DEEPSEEK_API_KEY=your-token
```

For this local network setup:

```bash
export DEEPSEEK_BASE_URL=http://192.168.20.24:11434
export DEEPSEEK_MODEL=deepseek-coder:6.7b
```

The Codex wrapper does not call the remote Ollama host directly. It starts a small local proxy so that `codex --oss --local-provider ollama` can talk to `127.0.0.1:11434`.

### 2. SSH fallback

Set:

- `DEEPSEEK_SSH_HOST`
- optional `DEEPSEEK_SSH_CMD`

Example:

```bash
export DEEPSEEK_SSH_HOST=dev@deepseek-box
export DEEPSEEK_SSH_CMD='ollama run deepseek-coder:6.7b'
```

## Recommended Loop

1. Run `npm run agent:context`
2. Run `npm run agent:tooling` if you changed agent tooling or wrappers
3. Start `npm run agent:ollama:proxy` only if you want the `codex` CLI to use the remote Ollama host
4. Ask the sidecar for exploration or a draft when useful, or launch `npm run agent:codex:deepseek`
5. Make changes locally
6. Run the narrowest useful test first
7. Run `npm run check`
8. Run `npm run smoke` if startup wiring changed
9. Run `npm run test:integration` for behavior that crosses services

## Notes

- `npm run check` is the default fast gate: lint + format check + unit tests
- `npm run smoke` verifies key entrypoints parse correctly
- CI runs the same validation commands to keep agent output aligned with repository expectations
- `npm run agent:ollama:proxy:stop` stops the local proxy and removes the pid file
- `deepseek-coder:6.7b` remains useful through `npm run agent:deepseek`, even though it cannot be the direct Codex OSS engine
