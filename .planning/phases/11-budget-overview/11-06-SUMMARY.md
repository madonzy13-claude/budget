---
phase: 11-budget-overview
plan: 06
subsystem: api
tags: [budgeting, overview, wealth, snapshots, time-series, pie, tdd]

# Dependency graph
requires:
  - phase: 11-budget-overview
    provides: budget_wealth_snapshots table (11-01); computeBudgetWealthNow + holdingsValuation (11-03)
provides:
  - "getOverviewWealth(deps) — snapshot value series + live point + grow/dynamics/avg + investments pie"
  - "createWealthSnapshotRepo() — seriesForRange snapshot read"
  - "GET /budgets/:id/overview/wealth?from&to&view (Zod, IDOR 404)"
affects: [11-07, 11-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Value series = last-in-bucket snapshot aggregation + a live current point that OVERRIDES the current bucket (only when now is in range)"
    - "MoM dynamics labelled by the later point; monthly-avg = mean of NON-NULL steps (zero-base steps excluded)"

key-files:
  created:
    - packages/budgeting/src/application/get-overview-wealth.ts
    - packages/budgeting/src/adapters/persistence/wealth-snapshot-repo.ts
    - apps/api/src/routes/overview-wealth.ts
    - packages/budgeting/test/overview/get-overview-wealth.test.ts
    - apps/api/test/routes/overview-wealth.test.ts
  modified:
    - apps/api/src/boot.ts
    - apps/api/src/routes/budgets.ts
    - packages/budgeting/package.json

key-decisions:
  - "Live point reuses computeBudgetWealthNow (11-03) — identical numbers to the cron + capitalization card. It overrides the current bucket so the rightmost point is up to date (D-04), but ONLY when `now`'s bucket falls within [from,to] (a past range keeps its last snapshot)."
  - "No FX in this service: snapshots are stored in budget ccy, the live point + pie are already default_ccy. Dropped the planned fxProvider dep."
  - "Pie uses a dedicated holdingsByType port (per holding_type sums) — the 11-03 holdingsValuation only yields a total. Boot implements it by grouping investments.listHoldings.valueInBudgetCents by holdingType."
  - "No cost-basis / purchase-price / contributions metric anywhere (D-17) — series is value-only."

patterns-established:
  - "Snapshot tables are worker-write-only: app_role has SELECT+DELETE, worker_role INSERT+SELECT. Integration tests seed snapshots with the worker role + tenant GUC, not app_role."

requirements-completed: [SC7, D-04, D-15, D-16, D-17, D-18, D-20]

# Metrics
duration: 50 min
completed: 2026-06-28
---

# Phase 11 Plan 06: Financial-Wealth Section Service Summary

**Value time-series from the 3h budget_wealth_snapshots (last-in-bucket) with a live current point appended via computeBudgetWealthNow, grow/loss + month-over-month dynamics + monthly-average grow, and a per-holding-type pie for the investments view. Capitalization/investments toggle. No cost-basis (D-17). TDD red→green, 6 unit + 4 real-DB integration tests green.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-06-28
- **Tasks:** 3 (RED, GREEN, route+DB-test)
- **Files modified:** 8

## Accomplishments

- `getOverviewWealth`: series (bucket via D-20 monthly/daily, last-in-bucket aggregation) + live point override (D-04); grow/loss (D-15); MoM dynamics + monthly-avg grow as mean of non-null steps (D-16); investments-view per-type pie (D-18); capitalization view → pie null.
- `createWealthSnapshotRepo.seriesForRange` — snapshot series read on the series index.
- Route `GET /budgets/:id/overview/wealth?from&to&view` (Zod view enum + range, IDOR 404); boot DI reuses computeBudgetWealthNow + a holdingsByType adapter over investments.listHoldings.

## Task Commits (TDD)

1. **RED** — `test(11-06): wealth section (RED)` — 6 failing unit tests.
2. **GREEN** — `feat(11-06): implement wealth section service + snapshot repo (GREEN)` — service + repo + exports; 6 unit tests pass; typecheck 0.
3. **Route + DB test** — `feat(11-06): wealth route + boot wiring + real-DB test` — route + boot + 4 real-Postgres integration tests.

## Decisions Made

See key-decisions frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Port] Added a holdingsByType port for the pie**

- The 11-03 `holdingsValuation` only returns a total; the pie needs per-type sums. Added a small `holdingsByType.valueByType` port; boot groups `investments.listHoldings` by `holdingType`. The live point still uses the total `holdingsValuation` via `computeBudgetWealthNow`.

**2. [Reuse] Dropped fxProvider from the service deps**

- Snapshots, the live point, and the pie are all already default_ccy → no FX path here (matches 11-04/11-05).

**3. [Test infra] Snapshots seeded via worker_role**

- **Found during:** Task 3 — `permission denied for table budget_wealth_snapshots` on the app_role seed.
- **Cause:** the table is worker-write-only (app_role: SELECT+DELETE; worker_role: INSERT+SELECT) — snapshots are written by the cron, not the app.
- **Fix:** seed snapshot rows with a worker_role connection + the tenant GUC; the app_role still does the read under test.

### Coverage note

- Pie CONTENT is pinned in the **unit** test. The **integration** test stubs holdings valuation/by-type (live inv = 0, fixed pie) to stay deterministic without the Phase-9 pricing pipeline; it exercises the real snapshot read + real wallet read for the live capitalization point.

---

**Total deviations:** 3 auto-fixed (1 port, 1 reuse, 1 test infra).
**Impact on plan:** Same DTO + behavior; cleaner deps; documented worker-write snapshot pattern.

## Issues Encountered

- infisical/Tailscale down → integration tests run with DATABASE_URL_APP + DATABASE_URL_WORKER sourced from the api container (see [[project_infisical_down_db_workaround]]).

## User Setup Required

None.

## Next Phase Readiness

- `computeBudgetWealthNow` is now instantiated in boot — 11-07's cron can reuse the exact same instance/output. The snapshot table read path is proven against real DB.
- **Verification caveat:** `make test` (infisical-wrapped) not run; 10 tests run directly (6 unit + 4 integration) green; full typecheck exits 0.

---

_Phase: 11-budget-overview_
_Completed: 2026-06-28_
