# Sticker Bot Agent Docs

This directory contains the canonical agent-facing documentation for this repository.

## Read Order

Agents should use these files in this order:

1. [`.github/copilot-instructions.md`](/home/dev/work/sticker-bot2/.github/copilot-instructions.md)
2. [`docs/agent-workflow.md`](/home/dev/work/sticker-bot2/docs/agent-workflow.md)
3. [`sticker-bot-expert.md`](/home/dev/work/sticker-bot2/.github/agents/sticker-bot-expert.md)
4. One domain guide:
   - [`BOT.md`](/home/dev/work/sticker-bot2/.github/agents/BOT.md)
   - [`WEB.md`](/home/dev/work/sticker-bot2/.github/agents/WEB.md)
   - [`OPERATIONS.md`](/home/dev/work/sticker-bot2/.github/agents/OPERATIONS.md)
   - [`TESTING.md`](/home/dev/work/sticker-bot2/.github/agents/TESTING.md)
5. [`USAGE_GUIDE.md`](/home/dev/work/sticker-bot2/.github/agents/USAGE_GUIDE.md)

The goal is to keep one short operating contract, one workflow guide, one repository expert profile, a few small domain guides, and one practical usage guide.

## What These Docs Cover

- current validation commands
- actual repository entrypoints
- current repository layout: `src/` for code and runtime data kept out of git in paths like `storage/` and `media/`
- remote Ollama and DeepSeek workflow
- limits of `deepseek-coder:6.7b` with Codex OSS tooling
- shell aliases available on this machine
- sensitive areas that have caused regressions before
- subsystem-specific guidance without forcing every agent to load a giant generic file

## Rules for Updating Agent Docs

- Prefer accuracy over completeness
- Reflect the current scripts in `package.json`
- Remove stale references instead of adding exceptions around them
- Keep examples runnable against the current tree
- When workflow changes, update this directory and `docs/agent-workflow.md` in the same patch

## Current Recommended Agent Loop

1. Run `npm run agent:context`
2. Read only the files needed for the task
3. Make a small patch
4. Run the narrowest useful test
5. Run `npm run check`
6. Run `npm run test:integration` for cross-service behavior

## Current Model Guidance

- Use the primary coding agent for final edits and validation.
- Use `deepseek-coder:6.7b` through the sidecar wrapper for exploration or drafting.
- Use `qwen3:8b` if you want the `codex` CLI itself to operate through the local Ollama proxy with tool support.

## Source of Truth

If these docs conflict with ad hoc comments in older markdown files, trust:

1. `package.json`
2. `.github/copilot-instructions.md`
3. `docs/agent-workflow.md`

## Files

- [`sticker-bot-expert.md`](/home/dev/work/sticker-bot2/.github/agents/sticker-bot-expert.md): repository-specific guidance
- [`BOT.md`](/home/dev/work/sticker-bot2/.github/agents/BOT.md): bot and media changes
- [`WEB.md`](/home/dev/work/sticker-bot2/.github/agents/WEB.md): web and auth changes
- [`OPERATIONS.md`](/home/dev/work/sticker-bot2/.github/agents/OPERATIONS.md): agent tooling and Ollama workflow
- [`TESTING.md`](/home/dev/work/sticker-bot2/.github/agents/TESTING.md): validation guide
- [`USAGE_GUIDE.md`](/home/dev/work/sticker-bot2/.github/agents/USAGE_GUIDE.md): practical prompts and workflows
- [`agents.json`](/home/dev/work/sticker-bot2/.github/agents/agents.json): machine-readable metadata
- [`IMPLEMENTATION_SUMMARY.md`](/home/dev/work/sticker-bot2/.github/agents/IMPLEMENTATION_SUMMARY.md): what this doc set currently assumes

Root wrappers such as [`index.js`](/home/dev/work/sticker-bot2/index.js) and [`server.js`](/home/dev/work/sticker-bot2/server.js) exist mainly to preserve stable entrypoints; most implementation lives under `src/`.
