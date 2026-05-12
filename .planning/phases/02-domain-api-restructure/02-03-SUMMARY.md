---
phase: "02"
plan: "03"
subsystem: budgeting/reserves
tags: [reserves, sql-view, hex, cushion-mode, tdd]
dependency_graph:
  requires: [02-01]
  provides: [reserve-balance-repo, GET /budgets/:id/reserves]
  affects: [phase-04-grid, phase-05-reserves-tab]
tech_stack:
  added: []
  patterns: [with-recursive-cte, scd2-lookup, distinct-on, hex-boundary]
key_files:
  created:
    - drizzle/0014_fix_reserve_view.sql
    - packages/budgeting/src/ports/reserve-balance-repo.ts
    - packages/budgeting/src/adapters/persistence/reserve-balance-repo.ts
    - apps/api/test/routes/reserves.test.ts
  modified:
    - apps/api/src/routes/budgets.ts
    - packages/budgeting/src/contracts/factory.ts
    - packages/budgeting/package.json
    - apps/migrator/post-migration.sql
    - drizzle/meta/_journal.json
    - packages/budgeting/test/reserve-balance-repo.test.ts
decisions:
  - "Migration 0014 uses DROP+CREATE VIEW (not CREATE OR REPLACE) — Postgres silently keeps old parse tree when DISTINCT ON is added"
  - "reserve_accum base case uses min_months CTE JOIN (not correlated subquery) to avoid recursive CTE evaluation order bug"
  - "DISTINCT ON (budget_id, category_id) ORDER BY month_start DESC replaces self-referential subquery on recursive CTE"
  - "budget_id ≡ tenant_id (v1.1 design) — expense_ledger.budget_id uses COALESCE with tenant_id for pre-0013 rows"
  - "createReserveBalanceRepo() takes no constructor args — getBudgetCurrency fetched inline from tenancy.budgets"
metrics:
  duration: "3h (continuation; prior 2 agents stalled on VIEW bugs)"
  completed_date: "2026-05-12"
  tasks_completed: 2
  files_changed: 10
---

# Phase 02 Plan 03: Reserve Balance Repo + GET /reserves Summary

Port + Drizzle adapter + API route for per-category reserve auto-compute. Underlying SQL VIEW fixed via migration 0014.

## What Was Delivered

- **Port**: `ReserveBalanceRepo` interface (`getForBudget`, `getForCategory`) — no Drizzle imports (hex boundary enforced)
- **Adapter**: `createReserveBalanceRepo()` factory — queries `budgeting.category_reserve_balance` VIEW via `withTenantTx`
- **Route**: `GET /budgets/:id/reserves` → `{ budgetId, reserves: [{categoryId, balanceCents}] }`
- **Factory wiring**: `reserveBalanceRepo` added to `BudgetingModule` + `createBudgetingModule()`
- **Migration 0014**: Fixed VIEW DDL — two bugs resolved (see Deviations)
- **Tests**: 7 unit/integration (5 scenarios) + 2 route tests — all GREEN

## Test Scenarios (D-PH2-11)

| Scenario                                            | Expected balance (today=2026-05-12) | Result |
| --------------------------------------------------- | ----------------------------------- | ------ |
| 1: Empty history                                    | Map size=0, getForCategory=0.00 EUR | PASS   |
| 2: Single-month remainder                           | 170.00 EUR (Apr 7000 + May 10000)   | PASS   |
| 3: Multi-month accumulation with overspend clamp    | 250.00 EUR                          | PASS   |
| 4: Cushion-mode flip mid-history (RSCM-02)          | 180.00 EUR                          | PASS   |
| 5: Overspend clamps at zero, not negative (RSRV-02) | 300.00 EUR                          | PASS   |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two critical SQL bugs in category_reserve_balance VIEW**

- **Found during:** Task 2 (GREEN) — VIEW returned 0 rows for all queries
- **Root cause 1:** `reserve_accum` recursive CTE base case used a correlated subquery `WHERE bpm.month_start = (SELECT MIN(month_start) FROM budget_per_month bpm2 ...)` inside the recursive CTE. Postgres evaluates this as empty (sibling CTE references inside recursive CTEs resolve to empty at evaluation time), so the anchor row was never selected → entire recursive result empty.
- **Fix 1:** Added explicit `min_months AS (SELECT budget_id, category_id, MIN(month_start) AS first_month FROM budget_per_month GROUP BY ...)` CTE. Base case JOINs to `min_months` directly.
- **Root cause 2:** Final SELECT used `WHERE month_start = (SELECT MAX(...) FROM reserve_accum ra2 ...)` — self-referential subquery on a recursive CTE is not supported in Postgres and also returned empty.
- **Fix 2:** Replaced with `SELECT DISTINCT ON (budget_id, category_id) ... ORDER BY budget_id, category_id, month_start DESC`.
- **Root cause 3 (additional):** `CREATE OR REPLACE VIEW` silently kept the old parse tree when the SELECT shape changed (DISTINCT ON + ORDER BY added). The old broken DDL was still active despite `CREATE OR REPLACE` reporting success.
- **Fix 3:** Changed migration to `DROP VIEW IF EXISTS` then `CREATE VIEW` (not `CREATE OR REPLACE`). Added `GRANT SELECT ... TO app_role, worker_role` after DROP+CREATE since grants are lost when a view is dropped.
- **Files modified:** `drizzle/0014_fix_reserve_view.sql`
- **Commits:** `93911c4`

**2. [Rule 3 - Blocking] @budget/budgeting package exports missing reserve-balance-repo**

- **Found during:** Task 2 test run
- **Issue:** `@budget/budgeting/src/adapters/persistence/reserve-balance-repo` not in package.json exports map → module not found
- **Fix:** Added two export entries to `packages/budgeting/package.json`
- **Files modified:** `packages/budgeting/package.json`

**3. [Rule 3 - Blocking] Worktree node_modules resolution**

- **Found during:** Task 2 test run
- **Issue:** Worktree had no `node_modules`. Symlinked main repo's `node_modules` and overrode `@budget/budgeting` → worktree packages to pick up new adapter files.
- **Fix:** Dev-only symlinks (not committed). Tests ran from worktree.

## VIEW DDL Verification (PLAN.md acceptance criteria)

```
grep -q "WITH RECURSIVE months AS"     drizzle/0014_fix_reserve_view.sql  ✓
grep -q "budget_mode_history"          drizzle/0014_fix_reserve_view.sql  ✓
grep -q "GREATEST(0"                   drizzle/0014_fix_reserve_view.sql  ✓
grep -q "category_reserve_balance"     packages/budgeting/src/adapters/...  ✓
grep -q "/:id/reserves"               apps/api/src/routes/budgets.ts     ✓
Port drizzle import count: 0 (hex clean)                                  ✓
```

## Requirements Satisfied

- **RSCM-01**: ReserveBalanceRepo port + adapter ships; consumes `category_reserve_balance` VIEW
- **RSCM-02**: VIEW respects cushion-mode-as-of-month via `budget_mode_history` SCD-2 JOIN (Scenario 4 verified)

## Commits

| Hash      | Message                                                                     |
| --------- | --------------------------------------------------------------------------- |
| `75afa28` | test(02-03): RED reserve balance repo integration tests (5 scenarios)       |
| `93911c4` | feat(02-03): ReserveBalanceRepo + GET /budgets/{id}/reserves consuming VIEW |

## Self-Check: PASSED

- `drizzle/0014_fix_reserve_view.sql` — exists ✓
- `packages/budgeting/src/ports/reserve-balance-repo.ts` — exists ✓
- `packages/budgeting/src/adapters/persistence/reserve-balance-repo.ts` — exists ✓
- `apps/api/src/routes/budgets.ts` — contains `/:id/reserves` ✓
- `apps/api/test/routes/reserves.test.ts` — exists ✓
- Commits `75afa28`, `93911c4` — exist ✓
- 9 tests pass, 0 fail ✓
