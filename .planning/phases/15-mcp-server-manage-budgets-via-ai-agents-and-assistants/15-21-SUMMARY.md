---
phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
plan: 21
status: complete
---

# 15-21 Summary: wallet balance history as wealth points (decision b2)

15-01 recorded `wallet_history: b2`, so the plan ran in full.

**Storage**
- Migration **0108_wealth_snapshot_source** (0107 was already taken by oauth_consent_last_used): `source text NOT NULL DEFAULT 'worker' CHECK (source IN ('worker','import'))` on `budgeting.budget_wealth_snapshots`. It is registered in `_journal.json`, and `source` is in the Drizzle schema. The worker's INSERT names no source and still lands as 'worker' (tested; worker snapshot test green).
- Repo: `insertImported(budgetId, rows)` returns `{created, skippedExisting}`; `deleteImported(budgetId, id)` deletes only rows with `source = 'import'`.
- Use case `importWealthSnapshots` (application layer, ports only, bigint): each point is captured at `${date}T23:00:00Z`. Capitalization = Σ that date's wallets converted at that date via the shared `sumWalletsToCurrency`, plus the investments of the nearest snapshot at or before the date (0 / null when there is none).

**Routes** (overview-wealth.ts, same session and tenant guard as the GET)
- `POST /budgets/:id/overview/wealth-snapshots/import {points}` → 201 `{created, skipped_existing}`. Zod rules: ≤ 500 points, YYYY-MM-DD dates, cents as integer strings, currency 3–5 characters (as wallets allow).
- `DELETE /budgets/:id/overview/wealth-snapshots/:snapshotId` → 204 for an imported point; 404 for a worker point, an unknown id, or another budget's.

**MCP import**
- **Preview:** every valid wallet row is kept. A date that does not name every active wallet goes to `incomplete_wallet_set {date, missing_wallets}` (blocking; resolution `skip_dates`). `history_not_stored` is gone. The newest row per wallet is marked `apply`.
- **Commit:** one POST of the complete dates (each wallet's last row that day) goes **before** the balance PUTs, and each created point is logged as `wealth_snapshot` create. Then the newest row per wallet sets the balance as in 15-20. The result adds `snapshots_created` and `snapshots_skipped_existing`.
- **Skipped dates** get no history point, but their newest balances still apply, so a partial history still updates today's balances.
- **Undo:** the `wealth_snapshot.create` inverse goes through the DELETE route. A 404 is skipped in agent mode and fails in rollback. There is no changed-since check, because points never change.
- The import_preview / import_commit descriptions now tell the agent to give every wallet's balance for each date.

**Tests**
- `packages/budgeting/test/import-wealth-snapshots.test.ts` (3): FX at date plus carried investments; source marker and skip of a day that already has a point; delete of imported points only.
- `apps/api/test/routes/wealth-snapshots-import.test.ts` (6): import shows in the series, existing day skipped, 422s, cross-tenant 404, delete once, worker/unknown/foreign 404.
- import-kinds wallet tests (4): complete history → 2 points with the right values and balances; incomplete date blocks, then gets no point; a failing balance rolls back both the points and the balances; undo removes the points (series equal to before) and skips a wallet changed since.
- Full `test/mcp/` plus the new route test: 145/0. Overview + worker snapshot tests: 186/0. tsc and eslint clean. The `history_not_stored`, `parseFloat|Number(` and `drizzle`-in-application greps return nothing.

**Deviations**
- **A day with any snapshot is skipped,** not only the same hour. The rebuilt monthly history sits at 00:00, so a second point at 23:00 on the same date would draw two different totals for one day.
- **No `snapshot_exists` in preview.** The wealth GET zero-fills and carries values, so it can't tell an existing point from a carried one. Those days come back as `snapshots_skipped_existing` in the commit answer instead.
- **Wallet rollback trigger:** a balance in a currency other than the wallet's own (WALT-04), because an archived wallet still accepts a balance (as in 15-20).
- **Test budget hygiene:** completeness counts every active wallet, so each wallet test archives the budget's other wallets first.

Commits: a60b1fd7 (RED task 1), b9c572f7, cfd24f2e (RED routes), 2dfb3901, 096c172b (RED task 3), 40ee9c6a.
