---
phase: 11-budget-overview
plan: 04
subsystem: api
tags: [budgeting, overview, planned, scd2, recurring, sql, tdd, fx]

# Dependency graph
requires:
  - phase: 11-budget-overview
    provides: transactions_budget_cat_confirmed_idx (11-01); sumWalletsToCurrency (11-03)
provides:
  - "recurringMonthlyNormalize(amountCents, cadence) — pure 4-cadence → monthly cents"
  - "getOverviewPlanned(deps) — Planned-vs-Real timeline (monthly/daily) + planned-avg + recurring×2"
  - "createOverviewRepo() — multi-month aggregation (monthlySpend/monthlyPlanned/categoryWindows/dailySpend/activeRecurringRules)"
  - "GET /budgets/:id/overview/planned?from&to&categoryId (Zod range, T-11-03)"
affects: [11-05, 11-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One multi-month SQL aggregation (generate_series × SCD-2 LATERAL × per-month mode), not N single-month calls (Pitfall 5)"
    - "Per-month mode from budget_mode_history (historical accuracy) vs the grid's current flag"

key-files:
  created:
    - packages/budgeting/src/application/recurring-monthly-normalize.ts
    - packages/budgeting/src/application/get-overview-planned.ts
    - packages/budgeting/src/adapters/persistence/overview-repo.ts
    - apps/api/src/routes/overview-planned.ts
    - packages/budgeting/test/overview/recurring-monthly-normalize.test.ts
    - packages/budgeting/test/overview/get-overview-planned.test.ts
    - apps/api/test/routes/overview-planned.test.ts
  modified:
    - apps/api/src/routes/budgets.ts
    - apps/api/src/boot.ts
    - packages/budgeting/package.json

key-decisions:
  - "Timeline planned/real need NO FX: limits are in budget ccy; ledger stores amount_converted_cents. Only recurring amounts (own currency) are FX'd. Matches get-spendings-summary."
  - "Spend bucketed by transaction_date (NOT confirmed_at) so monthly real matches the spendings grid (D-12). confirmed_at IS NOT NULL is only the confirmed filter."
  - "Per-month planned uses budget_mode_history mode at month-start (cushion vs normal) — historically accurate; differs from the grid's current cushion flag by design."
  - "recurringPerMonth = firing distribution (MONTHLY all 12; YEARLY full amount in its month; WEEKLY/DAILY normalized all 12); recurringPerCategory = monthly-normalized (YEARLY÷12). Both documented."
  - "Foreign categoryId is safe via RLS (yields empty rows) — no extra existence query."

patterns-established:
  - "Adaptive bucket: daily when within one calendar month or ≤62 days, else monthly (D-20)"

requirements-completed: [SC4, SC6, D-12, D-13, D-14, D-20, D-06]

# Metrics
duration: 70 min
completed: 2026-06-28
---

# Phase 11 Plan 04: Planned Section Service Summary

**Multi-month Planned-vs-Real timeline (adaptive monthly/daily), planned-avg over active-months, and two recurring charts — one SCD-2 + per-month-mode SQL aggregation, 4-cadence normalizer; TDD red→green, 10 unit + 4 real-DB integration tests green.**

## Performance

- **Duration:** ~70 min
- **Completed:** 2026-06-28
- **Tasks:** 3 (RED, GREEN, route+DB-test)
- **Files modified:** 10

## Accomplishments

- `recurringMonthlyNormalize` pure 4-cadence normalizer (DAILY×30.44 / WEEKLY×4.345 / MONTHLY / YEARLY÷12).
- `getOverviewPlanned`: timeline (monthly buckets summed from per-category rows, or daily cumulative), planned-avg/real-avg over each category's active months only (D-13), recurring per-month (firing distribution) + per-category (monthly).
- `createOverviewRepo`: one aggregation per concern; the planned query joins generate_series months × SCD-2 LATERAL limit × per-month budget_mode_history mode.
- Route with Zod range guard (from<=to, span cap) + tenantIds 404.

## Task Commits (TDD)

1. **RED** — `db07d8c` (test): 10 failing unit tests.
2. **GREEN** — `02753bf` (feat): normalizer + service; 10 unit tests pass; typecheck 0.
3. **Route + DB test** — `5c6b01e` (feat): repo + route + boot + 4 real-Postgres integration tests.

## Decisions Made

See key-decisions frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] spend bucketed by transaction_date, not confirmed_at**

- **Found during:** Task 2 (overview-repo)
- **Issue:** The key_link implied bucketing the rollup by confirmed_at, but the grid (D-12 "matching") buckets the month by transaction_date; bucketing by confirmed_at would mis-assign a Jan tx confirmed in Feb.
- **Fix:** Bucket by transaction_date, keep confirmed_at IS NOT NULL as the confirmed filter (the partial index still narrows to confirmed rows).
- **Verification:** Integration test monthly real = [18000,21000,14000] matches the seeded transaction_date months.
- **Committed in:** `5c6b01e`

---

**Total deviations:** 1 auto-fixed (1 bug).
**Impact on plan:** Makes the timeline real numbers match the spendings grid exactly.

## Issues Encountered

- infisical/Tailscale down → integration tests run with DATABASE_URL_APP + DATABASE_URL_WORKER sourced from the api container (see [[project_infisical_down_db_workaround]]).

## User Setup Required

None.

## Next Phase Readiness

- overview-repo + planned service ready for 11-05 (overspent+reserves reuse overview-repo) + 11-09 (Planned section UI).
- **Verification caveat:** `make test` (infisical-wrapped) not run; 14 tests run directly (10 unit + 4 integration) green.

---

_Phase: 11-budget-overview_
_Completed: 2026-06-28_
