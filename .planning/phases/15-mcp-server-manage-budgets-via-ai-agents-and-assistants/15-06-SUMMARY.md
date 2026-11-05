---
phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
plan: 06
status: complete
---

# 15-06 Summary: write log / previews repo + limits

- `packages/platform/src/mcp/repo.ts` (exported via `@budget/platform`): `insertWriteLog`, `listRecentWrites` (7-day window, newest first), `findWritesByCallOrBatch`, `markReverted` (returns flipped count; idempotent), `dailyEntryCount` (24h SUM per client), `savePreview` (sweeps the user's expired previews), `getPreview` (null when expired or other client), `deletePreview`. Constants `UNDO_WINDOW_DAYS = 7`, `PREVIEW_TTL_MINUTES = 60`. Callers wrap in `withUserContext`.
- `WriteLogInsert.createdAt` optional (tests seed old rows); defaults to now().
- `apps/api/src/mcp/limits.ts`: `MCP_LIMITS`, `checkRate(conn, "read"|"write")` (in-memory, resets on restart), `checkDailyEntries(conn, n)` → `Result<void, {limit, used, retry_after_seconds: 3600}>` (DB-backed).

## Verification

mcp-repo.test.ts 5/0 (testcontainer, app_role + RLS cross-user check), limits.test.ts 3/0 (dev DB), tsc + eslint clean. No `mcp_write_log` SQL outside platform.
