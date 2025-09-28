I'll create a ready-to-paste GitHub Issue containing the full summarized conversation, code/changes list, logs, DB evidence, current state, and suggested next steps; below is a concise checklist and the issue content plus an optional gh command you can run to publish it.

Checklist

 Create issue title and body summarizing the conversation and changes
 Include files changed and status mapping
 Attach relevant logs and DB evidence (inline)
 Provide clear next steps and recommended fixes
 Publish the issue to GitHub (I can't push it directly from here; I provide the content and a command you can run)
Issue title Bug: Web UI cron changes persist to DB but bot processes keep fallback schedule (cross-process propagation)

Issue body (paste this into the GitHub issue body):

Summary
Editing the auto-send schedule via the web UI persists a computed cron expression to the SQLite bot_config table (auto_send_cron), and the web UI shows the computed cron. However, the running bot processes (pm2) continue using the fallback cron in at least one process. The in-process event bus emits schedule updates only inside a single Node process; cross-process propagation currently relies on a 10s DB poll and is not consistently observed.

Reproduction / Observed behavior
Use admin UI to set schedule (start, end, interval). POST to /api/admin/bot-config/schedule returns 200 and stores auto_send_cron.
DB shows the new cron:
sqlite3 [media.db](http://_vscodecontentref_/0) "SELECT id,key,value FROM bot_config WHERE key LIKE '%auto_send%' OR key LIKE 'schedule' ORDER BY id;"
Output observed:
1|schedule|
13|auto_send_cron|0 0-23 * * *
Bot process logs (pm2) show a scheduler still scheduled with fallback cron:
Example scheduler logs: [SCHEDULER] Agendamento: '0 8-21 * * *' no fuso America/Sao_Paulo. (pm2 process id 6)
Web server logs show POST and event emission; debug endpoint responds with 200 on 127.0.0.1 (indicates web server up).
Files changed / touched (for reviewer)
server.js — added GET/POST /api/admin/bot-config/schedule, emits bus.emit('bot:scheduleUpdated', cronExpr), added debug endpoint; moved route to avoid pre-init app usage.
dataAccess.js — fixed listMedia signature (senderId), implemented getBotConfig/setBotConfig usage.
admin-bot-config.html — UI now displays computed currentCron, re-loads after save, improved error handling.
scheduler.js — reads auto_send_cron from DB, validates, schedules via node-cron, listens to bus event for immediate in-process updates, polls DB every 10s for cross-process detection.
commands.js — status command reads auto_send_cron.
.env — added temporary DEBUG_BOT_CONFIG_TOKEN=debug-token-please-change for debug endpoint.
What I tried / debug steps
Fixed server crash: "Cannot access 'app' before initialization" by rearranging route placement.
Fixed ReferenceError: senderId by adding senderId parameter to listMedia.
Ensured web GET returns computed cron and UI reloads after save.
Persisted cron to DB; confirmed via direct sqlite query and direct Node module set/get tests.
Implemented immediate in-process update via bus events and DB polling (10s) for cross-process propagation.
Added debug endpoint that returns process PID + cron for visibility.
Inspected pm2 logs; found scheduler log lines showing fallback cron still scheduled in one process.
Current state
Web POST persists auto_send_cron to DB — Verified.
Web UI displays computed cron — Verified.
Scheduler immediately updates in the same process as POST (event bus) — Verified.
Cross-process propagation is unreliable in practice — at least one bot process still uses the fallback cron.
Root cause analysis
The event bus is process-local and does not propagate to other pm2 processes.
Cross-process synchronization only uses DB polling; either the poll hasn't triggered in the other processes, or some processes don't run the scheduler or lack correct environment (e.g., AUTO_SEND_GROUP_ID) or need restart.
Multi-process architecture (pm2) requires an inter-process notification mechanism (Redis pub/sub, etc.) or a single dedicated scheduler process.
Immediate recommendations
Short-term

Restart all bot pm2 processes so each picks up latest code and begins polling the DB (10s poll). Confirm logs within 30s.
Verify AUTO_SEND_GROUP_ID is set for every bot process (pm2 show <id> or env check).
Medium-term

Move the scheduler into a single dedicated process (simple and robust).
OR implement cross-process pub/sub (Redis) so web emits schedule changes that all bot processes subscribe to instantly.
Long-term

Add a small health/debug endpoint to each bot process that returns pid and current_cron (already added to web process — extend to bots) to ease triage.
Add tests for schedule propagation in CI.
Suggested next steps I can do for you
Query each running process’s debug endpoint (token-protected) and return the PID + auto_send_cron seen by that process.
Inspect pm2 env for each bot process to confirm required env vars (e.g., AUTO_SEND_GROUP_ID) are present.
Tail bot logs for 30s and confirm DB poll picked up the new cron or show the exception preventing it.
If you want me to continue, tell me which: (A) run per-process debug checks, (B) inspect pm2 env vars, or (C) tail logs for 30s.