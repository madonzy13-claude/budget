---
phase: 11-budget-overview
plan: 05
subsystem: api
tags: [budgeting, overview, overspent, reserves, after-reserves, scd2, tdd]

# Dependency graph
requires:
  - phase: 11-budget-overview
    provides: createOverviewRepo monthlySpend/monthlyPlanned/categoryWindows (11-04)
  - phase: 05-reserves-wallets-tabs
    provides: reservePositions engine seam + getReservesSummary
provides:
  - "getOverviewOverspent(deps) — range overspent total + by-category bar (after-reserves, desc, >0) + reserves-by-category passthrough"
  - "GET /budgets/:id/overview/overspent-reserves?from&to (Zod range, IDOR 404)"
affects: [11-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "reserve_used per (category,month) comes from the reserve ENGINE cell (reservePositions byMonth), injected into the service like get-spendings-summary — NOT a Drizzle query"
    - "after-reserves overspent max(0, spent − active_limit − reserve_used) summed over range == engine cell.overspentCents algebraically (grid bit-for-bit)"

key-files:
  created:
    - packages/budgeting/src/application/get-overview-overspent.ts
    - apps/api/src/routes/overview-overspent.ts
    - packages/budgeting/test/overview/get-overview-overspent.test.ts
    - apps/api/test/routes/overview-overspent.test.ts
  modified:
    - apps/api/src/boot.ts
    - apps/api/src/routes/budgets.ts
    - packages/budgeting/package.json

key-decisions:
  - "reserve_used is engine-derived (reservePositions byMonth cell usedCents), injected into the SERVICE — mirrors get-spendings-summary. Did NOT add the planned monthlyReserveUsedByCategory repo method: a Drizzle adapter must not call an application service (layer violation), and reserve_used is not a raw column."
  - "Reused createOverviewRepo's monthlyPlannedByCategory as the per-month active limit (already cushion-vs-normal mode-resolved from budget_mode_history) — no new repo method for the limit."
  - "No FX: spent (amount_converted), active_limit (budget ccy), reserve_used (engine cents) and reserveCents are all already default_ccy. Dropped fxProvider from deps (11-04 precedent)."
  - "D-06 archived-in-history enforced by categoryWindows window filter (m <= archived_month). Integration test proves a 999.00 March spend on a mid-Feb-archived category is ignored."

patterns-established:
  - "Section services that need reserve numbers inject reservePositions + getReservesSummary from createBudgetingModule (same seam the grid + reserves tab use)"

requirements-completed: [SC5, SC6, D-10, D-06]

# Metrics
duration: 35 min
completed: 2026-06-28
---

# Phase 11 Plan 05: Overspent + Reserves Section Service Summary

**Range overspent total + overspent-by-category bar (after-reserves, desc, >0 only) matching the Spendings grid bit-for-bit, plus reserves-by-category reused from get-reserves-summary. reserve_used sourced from the reserve engine seam (not a new query). TDD red→green, 3 unit + 3 real-DB integration tests green.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-06-28
- **Tasks:** 3 (RED, GREEN, route+DB-test)
- **Files modified:** 7

## Accomplishments

- `getOverviewOverspent`: per category per month `over = max(0, spent − active_limit − reserve_used)` floored, summed over the range months; by-category desc + >0 filter; total; reserves-by-category mirrors `getReservesSummary` rows[].reserveCents.
- spent + active_limit reuse 11-04's `createOverviewRepo` (monthlySpend + monthlyPlanned with per-month mode); reserve_used from the reserve engine (`reservePositions` byMonth cells).
- D-06 archived-in-history via `categoryWindows` (m ≤ archived_month).
- Route `GET /budgets/:id/overview/overspent-reserves` with Zod range guard + IDOR 404; boot DI reuses `baseBudgeting.reservePositions` + `baseBudgeting.getReservesSummary`.

## Task Commits (TDD)

1. **RED** — `test(11-05): overspent + reserves section (RED)` — 3 failing unit tests (import).
2. **GREEN** — `feat(11-05): implement overspent+reserves section service (GREEN)` — service + export; 3 unit tests pass; typecheck 0.
3. **Route + DB test** — `feat(11-05): overspent-reserves route + boot wiring + real-DB test` — route + boot + 3 real-Postgres integration tests.

## Decisions Made

See key-decisions frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Layering] Did not add `monthlyReserveUsedByCategory` to overview-repo**

- **Found during:** Task 2.
- **Issue:** The plan put reserve_used in the Drizzle repo, but reserve_used is engine-derived (replay orchestrator), not a column. A persistence adapter calling an application service is a hexagonal layer violation.
- **Fix:** Inject `reservePositions` into the service (the exact seam get-spendings-summary uses); read `positions.byMonth.get(month).usedCents`. No repo change.
- **Verification:** Unit test (fake reservePositions with a March usedCents reduces A's overspent) + integration test (real engine runs against real DB).

**2. [Reuse] active_limit reuses monthlyPlannedByCategory; fxProvider dropped**

- monthlyPlannedByCategory already resolves cushion-vs-normal per month — used directly as the per-month active limit. Every term is default_ccy so no FX dep (matches 11-04).

### Coverage note

- Exact reserve-draw arithmetic (reserve_used > 0 reducing overspent) is pinned in the **unit** test with a deterministic fake. The **integration** test exercises the real engine end-to-end (DB → repo → engine → service → route) and asserts the after-reserves aggregation, archived-in-history (D-06), desc/>0 ordering, and reserves passthrough — it does not pin an accrual-derived magic number (the reserve engine's accrual math is owned by the Phase 05 golden tests).

---

**Total deviations:** 2 auto-fixed (1 layering, 1 reuse).
**Impact on plan:** Cleaner layering, fewer files; same DTO + behavior.

## Issues Encountered

- infisical/Tailscale down → integration tests run with DATABASE_URL_APP + DATABASE_URL_WORKER sourced from the api container (see [[project_infisical_down_db_workaround]]).

## User Setup Required

None.

## Next Phase Readiness

- Wave 1 complete (11-03, 11-04, 11-05). Budget-side overview services (cards + planned + overspent/reserves) all serve string-cents DTOs in default_currency, ready for the section UIs (11-09).
- **Verification caveat:** `make test` (infisical-wrapped) not run; 6 tests run directly (3 unit + 3 integration) green; full typecheck exits 0.

---

_Phase: 11-budget-overview_
_Completed: 2026-06-28_
