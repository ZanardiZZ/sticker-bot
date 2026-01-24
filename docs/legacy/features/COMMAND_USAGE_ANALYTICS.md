# Command Usage Analytics

The command usage analytics pipeline tracks how often each WhatsApp command is executed and powers ranking features like `#top5comandos`. This document explains the moving pieces so new commands automatically participate in the statistics.

## Database Schema

The migration in [`database/migrations/schema.js`](../database/migrations/schema.js) creates the `command_usage` table:

| Column | Type | Description |
| --- | --- | --- |
| `command` | `TEXT` | Normalized command name (lowercase `#` prefix). |
| `user_id` | `TEXT` | Sender identifier used to attribute executions. |
| `usage_count` | `INTEGER` | Total successful executions for a command + user pair. |
| `last_used` | `INTEGER` | UNIX timestamp (seconds) when the command was last executed. |

The `(command, user_id)` pair is unique and updated atomically so concurrent executions are safe.

## Helper Module

[`database/models/commandUsage.js`](../database/models/commandUsage.js) exposes reusable helpers:

- `incrementCommandUsage(command, userId)` — Inserts or increments the counter for a sender executing a command.
- `getTopCommands(limit = 5)` — Aggregates counters across all users and returns the most-used commands ordered by total usage (ties break by recency).

The default export is registered in [`database/index.js`](../database/index.js), so other modules can call these helpers without manual wiring.

## Recording Usage for New Commands

Every command routed through [`commands/index.js`](../commands/index.js) must explicitly opt into tracking after successful execution. When adding a new command:

1. **Add the handler case** inside `handleCommand` following the existing pattern. Set `handled = true` once the command is processed.
2. **Set `shouldTrackUsage = true`** for commands that should appear in analytics. If a command should not be counted (for example, experimental or diagnostic commands), leave the flag as `false`.
3. The shared post-processing block automatically determines the sender (`context.resolvedSenderId` fallback to `message.from`). It then calls `incrementCommandUsage` with the normalized command string.

> ⚠️ Forgetting to set `shouldTrackUsage = true` means the command will never be counted in analytics. Always double-check this flag when you introduce new commands or refactor existing ones.

## Testing

- Unit coverage lives in [`tests/unit/commandUsageModel.test.js`](../tests/unit/commandUsageModel.test.js) and validates inserts, updates, and aggregation.
- Integration coverage for the handler response is in [`tests/integration/top5commandsCommand.test.js`](../tests/integration/top5commandsCommand.test.js). Use the shared fixtures in [`tests/helpers/testUtils.js`](../tests/helpers/testUtils.js) when writing new scenarios.

Keep these suites up to date if you change the schema or usage tracking logic.
