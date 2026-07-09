---
phase: 11-budget-overview
plan: 01
subsystem: database
tags: [drizzle, postgres, rls, migration, bigint, budget-wealth-snapshots]

# Dependency graph
requires:
  - phase: 09-investments-wallet
    provides: tenancy.budgets FK target + budgeting schema + RLS/FORCE-RLS conventions
provides:
  - "budgeting.budget_wealth_snapshots table (per-budget wealth aggregate, D-04) live in dev DB with RLS + FORCE RLS"
  - "Drizzle schema budgetWealthSnapshots (bigint cents, series index, tenant-isolation pgPolicy)"
  - "budget_wealth_snapshots_bucket_uidx — date_trunc('hour', captured_at AT TIME ZONE 'UTC') UNIQUE per budget (11-07 ON CONFLICT target)"
  - "transactions_budget_cat_confirmed_idx — confirmed-only partial index on budgeting.expense_ledger (D-02/D-12 rollups for 11-04/11-05)"
affects: [11-06, 11-07, 11-04, 11-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IMMUTABLE expression index: date_trunc on timestamptz must use AT TIME ZONE 'UTC' to be index-buildable"
    - "Single-migration-per-phase (D-02): no compute-on-read metric gets a table"

key-files:
  created:
    - packages/budgeting/src/adapters/persistence/budget-wealth-snapshots-schema.ts
    - drizzle/0049_phase11_budget_wealth_snapshots.sql
  modified:
    - packages/budgeting/src/adapters/persistence/index.ts
    - drizzle/meta/_journal.json
    - apps/migrator/post-migration.sql

key-decisions:
  - "Ledger index targets budgeting.expense_ledger (the plan's 'transactions' table name was a mislabel; read_first verified the real table + budget_id/category_id/confirmed_at columns). Index NAME kept as transactions_budget_cat_confirmed_idx to satisfy downstream key_links (cosmetic — planner picks indexes regardless of name)."
  - "Bucket UNIQUE index uses date_trunc('hour', captured_at AT TIME ZONE 'UTC') because date_trunc(text, timestamptz) is STABLE, not IMMUTABLE, and a bare expression is rejected by the index builder. 11-07's ON CONFLICT inference MUST reproduce this exact expression."
  - "Added GRANTs the plan omitted: SELECT (app+worker), INSERT (worker, the 3h cron), DELETE (app, for the budget-deletion FK cascade). Without grants the RLS policy is moot — the roles couldn't touch the table at all."
  - "Migration applied directly via psql as postgres superuser (idempotent IF NOT EXISTS SQL) because infisical/Tailscale is unreachable, so `make migrate` (which wraps `infisical run`) can't run. A later real `make migrate` is a safe no-op."

patterns-established:
  - "Per-budget aggregate snapshot table: aggregate cents only, no per-asset/FX/quantity/cost-basis history (D-17)"

requirements-completed: [SC8, D-04, D-02]

# Metrics
duration: 30 min
completed: 2026-06-28
---

# Phase 11 Plan 01: Schema Migration (budget_wealth_snapshots) Summary

**Per-budget `budget_wealth_snapshots` aggregate table (bigint cents, RLS + FORCE RLS, idempotent UTC-hour bucket index) plus a confirmed-only `expense_ledger` ledger index, applied live to the dev DB.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-06-28
- **Tasks:** 3 (2 file-authoring + 1 BLOCKING apply)
- **Files modified:** 5

## Accomplishments

- `budgeting.budget_wealth_snapshots` live in the dev DB: bigint capitalization/investment cents, tenant_id, budget_id FK → tenancy.budgets ON DELETE CASCADE, currency char(3).
- RLS enabled (`relrowsecurity=t`) + FORCE RLS (`relforcerowsecurity=t`), tenant-isolation policy on `app.tenant_ids` for app_role + worker_role.
- Three indexes physically exist: bucket UNIQUE (idempotency for the cron), series (range reads), and the confirmed-only ledger partial index.
- Drizzle schema + barrel export so downstream packages get the table types without reading the live DB.

## Task Commits

1. **Task 1: Drizzle schema + RLS** — `78b35be` (feat)
2. **Task 2: 0049 migration + journal + post-migration FORCE RLS/grants** — `2ee19cd` (feat)
3. **Task 3 [BLOCKING]: apply 0049 to live dev DB** — applied via psql (no source change; verified via to_regclass + pg_class)

## Files Created/Modified

- `packages/budgeting/src/adapters/persistence/budget-wealth-snapshots-schema.ts` — Drizzle table (bigint cents) + series index + tenant-isolation pgPolicy.
- `packages/budgeting/src/adapters/persistence/index.ts` — re-export budgetWealthSnapshots.
- `drizzle/0049_phase11_budget_wealth_snapshots.sql` — hand-authored: table + bucket uidx + series idx + RLS policy + ledger idx.
- `drizzle/meta/_journal.json` — idx 49 entry.
- `apps/migrator/post-migration.sql` — FORCE RLS + SELECT/INSERT/DELETE grants for the new table.

## Decisions Made

See key-decisions frontmatter (expense_ledger vs "transactions" mislabel; IMMUTABLE date_trunc; added grants; direct-psql apply).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Ledger index table name corrected (transactions → expense_ledger)**

- **Found during:** Task 2 (migration authoring)
- **Issue:** Plan's CANONICAL SQL targeted `budgeting.transactions`, which does not exist; the real append-only ledger is `budgeting.expense_ledger`.
- **Fix:** Index created on `budgeting.expense_ledger (budget_id, category_id, confirmed_at) WHERE confirmed_at IS NOT NULL`; index name kept (`transactions_budget_cat_confirmed_idx`) for the downstream key_link pattern.
- **Verification:** `to_regclass('budgeting.transactions_budget_cat_confirmed_idx')` returns non-null after apply.
- **Committed in:** `2ee19cd`

**2. [Rule 2 - Missing Critical] IMMUTABLE bucket index expression**

- **Found during:** Task 2
- **Issue:** `date_trunc('hour', captured_at)` on a timestamptz is STABLE → "functions in index expression must be marked IMMUTABLE"; the UNIQUE index would fail to build.
- **Fix:** `date_trunc('hour', captured_at AT TIME ZONE 'UTC')`. Noted that 11-07 ON CONFLICT must match this expression exactly.
- **Verification:** Index created without error during apply.
- **Committed in:** `2ee19cd`

**3. [Rule 2 - Missing Critical] Added missing role GRANTs**

- **Found during:** Task 2
- **Issue:** Plan specified FORCE RLS but no GRANTs; without them app_role/worker_role cannot SELECT/INSERT the table at all.
- **Fix:** GRANT SELECT (app+worker), INSERT (worker), DELETE (app) in post-migration.sql + applied live.
- **Verification:** Grants applied (EXIT=0); cron (11-07) and read service (11-06) paths will function.
- **Committed in:** `2ee19cd`

---

**Total deviations:** 3 auto-fixed (1 bug, 2 missing-critical)
**Impact on plan:** All necessary for the migration to apply and the table to be usable. No scope creep.

## Issues Encountered

- **infisical / Tailscale unreachable** — `infisical.tail4b2401.ts.net` is down, so every `infisical run`-wrapped Make target (`make migrate`, `make ci-gate`) cannot run. Worked around by applying the idempotent migration directly via `docker compose exec db psql -U postgres`. **`make ci-gate` (the tenant-leak suite) could NOT be run for this plan**; the invariant it enforces (FORCE RLS on the new table) was verified directly: `relforcerowsecurity=t`.

## User Setup Required

None.

## Next Phase Readiness

- Table + indexes + RLS live → 11-06 (wealth series), 11-07 (3h cron), 11-04/11-05 (ledger rollups) unblocked.
- **Blocker for verification:** infisical/Tailscale must be restored to run `make migrate` (canonical) + `make ci-gate` before phase sign-off.

---

_Phase: 11-budget-overview_
_Completed: 2026-06-28_
