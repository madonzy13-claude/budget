---
phase: 05-reserves-wallets-tabs
plan: 05-20
subsystem: recurring-engine / migrations
tags:
  [
    recurring-engine,
    data-migration,
    backfill,
    fx-currency-lock,
    dead-code-removal,
    cross-package-dep,
    rls,
    tasks-redesign,
  ]

# Dependency graph
requires:
  - fix(worker)-lock-recurring-drafts-to-budget-currency # root-cause fix already shipped on this branch
provides:
  - Backfill migration 0031 locking pre-fix unconfirmed foreign-currency recurring drafts to budget currency
  - Single canonical recurring engine (worker handler only; dead app-layer duplicate removed)
  - Catch-up loop coverage relocated to apps/worker/test/handlers (no backwards cross-package dep)
affects:
  - dev DB budgeting.expense_ledger (39 unconfirmed recurring drafts backfilled)
  - packages/budgeting export surface (one export entry removed)
  - apps/worker test suite (catch-up test added)

# Tech / patterns
tech-stack:
  added: []
  patterns:
    - "Cross-tenant data migration on a FORCE-RLS table: the migrator role is NOBYPASSRLS NOSUPERUSER and OWNS the table, so toggle `NO FORCE ROW LEVEL SECURITY` → UPDATE → `FORCE ROW LEVEL SECURITY` (transient, same migration; post-migration.sql re-asserts FORCE every run). Owner is RLS-exempt only when the table is not FORCE'd."
    - "Idempotent backfill: predicate `currency_original <> default_currency` self-empties after the first run."
    - "Engine consolidation: the worker owns the live recurring engine; the budgeting package keeps only the pure FX helper (recurring-engine-fx.ts) it shares."

key-files:
  created:
    - drizzle/0031_backfill_recurring_draft_currency.sql
    - apps/worker/test/handlers/recurring-engine-catchup.test.ts # moved from packages/budgeting/test
  modified:
    - drizzle/meta/_journal.json # idx 31 entry appended after idx 30
    - packages/budgeting/package.json # removed ./src/application/recurring-engine export
  deleted:
    - packages/budgeting/src/application/recurring-engine.ts # dead duplicate (no prod import)

# Decisions
decisions:
  - "Backfill migration toggles FORCE RLS off/on (owner-privileged) around the cross-tenant UPDATE because the migrator role is NOBYPASSRLS and both expense_ledger and budgets are FORCE-RLS — a plain UPDATE/JOIN silently matched 0 rows."
  - "Scope strictly UNCONFIRMED drafts (the worker bug). CONFIRMED foreign-currency recurring rows (3 on dev) are reported, not mutated — flagged as a separate follow-up."
  - "MOVE the catch-up test to the worker package rather than delete it: a budgeting-package test importing the worker app is a backwards cross-package dep; the worker is the correct home for the engine's catch-up coverage."

# Metrics
metrics:
  duration: ~25m
  completed: 2026-06-06
  tasks: 2
  commits: 2
  files-changed: 5
---

# Phase 05 Plan 20: Recurring-Engine Backfill + Dead-Copy Consolidation Summary

Two cleanups following the root-cause fix (`fix(worker): lock recurring drafts to budget currency`): (1) a data migration that backfills pre-fix foreign-currency recurring DRAFTS to the budget currency, and (2) deletion of the dead application-layer engine duplicate whose divergence caused the bug, relocating its catch-up test to the worker package.

## Task 1 — Backfill migration (0031)

`drizzle/0031_backfill_recurring_draft_currency.sql` locks pre-fix **unconfirmed** recurring drafts to the budget currency: `amount_converted_cents` was already correct (the worker computed the conversion), so it aligns `amount_original_cents = amount_converted_cents`, `currency_original = budget`, `fx_rate = 1`. Journal entry `idx 31` appended after `idx 30` (0029 stays removed).

**RLS deviation (Rule 1 — see Deviations):** first run recorded the migration but changed 0 rows because the migrator role is `NOBYPASSRLS NOSUPERUSER` and both `budgeting.expense_ledger` and `tenancy.budgets` are FORCE-RLS. The migrator OWNS both tables, so the final migration drops FORCE on both for the duration of the backfill, runs the UPDATE, then restores FORCE (post-migration.sql re-asserts it on every run anyway). Idempotent and security-neutral.

**Live dev DB results** (verified as `postgres` superuser, which bypasses RLS to see all tenants):

| Metric                                                                                  | Count  |
| --------------------------------------------------------------------------------------- | ------ |
| BEFORE — unconfirmed recurring drafts, `currency_original <> default_currency` (target) | **39** |
| Rows changed by 0031                                                                    | **39** |
| AFTER — same predicate                                                                  | **0**  |
| Rewritten rows now budget-ccy + fx_rate=1 + original==converted (last 5 min)            | **39** |
| CONFIRMED recurring rows in foreign currency (report-only, NOT mutated)                 | **3**  |

Migration applied via `docker compose build migrator` (stale-image gotcha) then `make migrate`. `drizzle.__drizzle_migrations` now holds 31 rows; `0031` recorded with hash `2f7b90c1…` (the corrected file). FORCE RLS confirmed restored on both tables post-migration.

> **Follow-up flagged:** 3 CONFIRMED recurring rows have `currency_original <> default_currency`. Out of scope here (the bug was unconfirmed drafts). These are already-confirmed transactions; mutating them would rewrite committed ledger history and needs its own decision.

## Task 2 — Engine consolidation

- Deleted `packages/budgeting/src/application/recurring-engine.ts` (dead duplicate; no prod import — the worker runs its own `apps/worker/src/handlers/recurring-engine.ts`).
- Removed its export-map entry from `packages/budgeting/package.json`.
- Moved `recurring-engine-catchup.test.ts` → `apps/worker/test/handlers/` and repointed its 4 dynamic imports from `@budget/budgeting/src/application/recurring-engine` to `../../src/handlers/recurring-engine`. The test is self-contained (own fixtures, no shared helpers), and the worker handler preserves backwards-compat (`runRecurringEngine(today)` positional-string still works), so no other edits were needed.
- `recurring-engine-fx.ts` and `recurring-engine-fx-bounds.test.ts` untouched (confirmed `computeRecurringFx` unaffected).

## Verification

| Check                                                                      | Result                                                         |
| -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `bun test` worker recurring-engine.test.ts + moved catchup test            | **10 pass / 0 fail**                                           |
| `bun test` recurring-engine-fx-bounds.test.ts + both confirm-draft.test.ts | **17 pass / 0 fail**                                           |
| `tsc --noEmit` apps/worker                                                 | **clean (exit 0)**                                             |
| `tsc --noEmit` packages/budgeting                                          | **15 errors = known baseline, none in recurring-engine files** |
| grep `application/recurring-engine` across source/config                   | **NONE** (only the gitignored `graphify-out/graph.json` cache) |
| Worker boot after deletion                                                 | **healthy** (restarted, polled to healthy)                     |

> The trailing `failed to wait for command termination: exit status 1` on both `bun test` runs is the Infisical-wrapper coverage-reporter artifact; the test runner itself reported `0 fail` in every run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Backfill migration matched 0 rows under the migrator's RLS-constrained role**

- **Found during:** Task 1, after the first `make migrate`.
- **Issue:** The migration registered in `__drizzle_migrations` (hash `34626b44…`) but the cross-tenant `UPDATE ... FROM tenancy.budgets` changed 0 rows. Root cause: the migrator connects as role `migrator` (NOBYPASSRLS NOSUPERUSER), and both `expense_ledger` and `budgets` are FORCE ROW LEVEL SECURITY with no `app.tenant_ids` GUC in the migrator session → RLS filtered every row. Re-running `make migrate` would NOT retry (hash already present).
- **Fix:** The migrator OWNS both tables, so the migration now drops FORCE on both (`NO FORCE ROW LEVEL SECURITY`), runs the UPDATE (owner is RLS-exempt when not FORCE'd), then restores FORCE. Transient, same-transaction, and post-migration.sql re-asserts FORCE on every run — security posture unchanged. Deleted the stale `__drizzle_migrations` tracking row (old hash) so the corrected file (new hash `2f7b90c1…`) re-applied; verified AFTER count = 0 and FORCE restored on both.
- **Files modified:** drizzle/0031_backfill_recurring_draft_currency.sql
- **Commit:** d050b4c

## Known Stubs

None.

## Out-of-scope (not touched, per plan)

- Pre-existing failures left alone: tasks-cross-tenant tenant-leak, reconcileProjections, the share-math @phase5 feature, wallets.test currentBalance, the 15-error budgeting tsc baseline.
- `graphify-out/graph.json` (gitignored, untracked) retains 18 stale refs to the deleted module in graphify's incremental AST cache. Not committed, not source — the source/config grep is clean. A full `graphify rebuild` would clear it; left as-is to avoid churn on a local artifact.

## Commits

- `d050b4c` — fix(migrations): backfill foreign-currency recurring drafts to budget currency
- `1621921` — refactor(recurring): delete dead app-layer engine, move catch-up test to worker

## Self-Check: PASSED

- Files present: drizzle/0031_backfill_recurring_draft_currency.sql, apps/worker/test/handlers/recurring-engine-catchup.test.ts, .planning/phases/05-reserves-wallets-tabs/05-20-SUMMARY.md
- Dead file removed: packages/budgeting/src/application/recurring-engine.ts
- Commits exist: d050b4c, 1621921
