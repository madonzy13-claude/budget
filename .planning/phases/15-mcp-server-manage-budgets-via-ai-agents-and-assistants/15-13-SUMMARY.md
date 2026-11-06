---
phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
plan: 13
status: complete
---

# 15-13 Summary: write tools

**writeTool wrapper** (`apps/api/src/mcp/tools/define.ts`). Every write tool goes through it, which:
- refuses a token without the write scope. The SDK's `scopeChallenge` answers HTTP 403 `insufficient_scope` (scopes `read write offline_access`) before the tool runs; an in-handler check repeats it as defence in depth;
- allows 20 writes a minute per connection;
- runs the daily-cap preflight before any mutation. Tools declare `entryCount`; a tool that only knows its count later calls `ctx.preflight(n)`. A non-GET `ctx.dispatch` made before a preflight passed returns `preflight_required` without reaching the route;
- writes one `mcp_write_log` row per effect, and drops effects whose dispatch was a replay. A failed log insert returns the result with `undo_available: false`. Returns the handler so tests can call it directly.

**Replay detection.**
- The idempotency middleware sets `Idempotent-Replayed: true` on cached answers, both the lookup and the in-flight wait.
- `DispatchResult.replayed` reads that header.

**Bug fixed (found while writing the retry test).** A non-2xx response is not cached, but its claim row stayed behind at status 0, so a retry with the same key "replayed" the empty claim and answered 500. The middleware now releases the claim (`releaseIdempotency`, which deletes only status-0 rows) whenever it does not cache. This affected the web app's own retries too.

**Tools** (`write.ts`, 9):

| Tool | Notes | destructiveHint |
| --- | --- | --- |
| add_transactions | ≤500 rows; all rows validated before the first write; per-row key `${key}:${i}`; partial `{created, failed}` on a mid-batch failure | — |
| edit_transaction | | — |
| delete_transaction | | ✓ |
| sync_wallet_balance | returns old, new and difference as decimals | ✓ |
| set_category_limit | a past month is single-month; the current month carries forward; cushion is kept unless given | — |
| create_category | | — |
| rename_category | | — |
| archive_category | | ✓ |
| budget_create | | — |

**Deviations:**
- **There is no income in the ledger.** `POST /transactions` always writes SPENDING (R6: a negative amount is a refund), and the web never creates INCOME rows. `/incomes` is planned-income configuration. The tool therefore takes spendings and refunds; the tests use a refund row instead of an income row.
- **budget_create** returned 401: the route passes request headers to Better Auth's `createOrganization`, and an internal MCP request has no cookie. The route now passes no headers for `internalRequests`, which makes it a system action for `body.userId` (the session user resolved from the token).
- **Rate and daily-cap integration tests** live in write-tools.test.ts, not limits.test.ts, beside the other tool calls.
- **auth.test "61st call"** got a 30s timeout. Its 63 round trips take 5–15s depending on machine load; that was measured before and after this plan, so it is not a regression.
- **No foreign key on category_id.** The route accepts a category id that does not exist, as the app already does; the tool keeps that behaviour (D-07). Noted, not changed.
- **set_category_limit sends no needs/wants split.** The route then stores NULL for both, the same as a client that omits them.

**Tests:**
- write-tools 22 + registry 4 (destructive set included).
- MCP, middleware, connected-apps, budgets and transactions routes: 186/0.
- tsc and eslint clean.

Commits: 22a89987 (RED), fc5cb1da (GREEN), 82a2ae89 (RED), 82cd0f16 (GREEN).
