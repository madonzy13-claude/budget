---
phase: 11-budget-overview
plan: 03
subsystem: api
tags: [budgeting, overview, cards, fx, bigint, tdd, hono, rls]

# Dependency graph
requires:
  - phase: 11-budget-overview
    provides: budget_wealth_snapshots table (11-01) — not read here but the primitive feeds the 11-07 cron
  - phase: 09-investments-wallet
    provides: investments.listHoldings (valueInBudgetCents, FX→budget ccy)
  - phase: 07-tasks-queue
    provides: get-cushion-summary (cushion math)
provides:
  - "computeBudgetWealthNow(deps) — shared wealth-now primitive (Σ all wallets FX→default_ccy + investment value); reused by 11-06 live point + 11-07 cron"
  - "sumWalletsToCurrency(items, target, fx, asOf) — shared FX-sum helper"
  - "getOverviewCards(deps) — 5-card summary in default_currency (D-11)"
  - "GET /budgets/:id/overview/cards (bigint→string at boundary, T-11-05 tenantIds 404 guard)"
  - "createOverviewCardsRepo().listWalletsWithType — wallet read with wallet_type"
affects: [11-06, 11-07, 11-08, 11-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Compute-on-read overview metric in default_currency (NOT display_currency)"
    - "Reuse the spendings grid (get-spendings-summary) as the canonical after-reserves overspent source"

key-files:
  created:
    - packages/budgeting/src/application/compute-budget-wealth-now.ts
    - packages/budgeting/src/application/get-overview-cards.ts
    - packages/budgeting/src/adapters/persistence/overview-cards-repo.ts
    - apps/api/src/routes/overview-cards.ts
    - packages/budgeting/test/overview/compute-budget-wealth-now.test.ts
    - packages/budgeting/test/overview/get-overview-cards.test.ts
    - apps/api/test/routes/overview-cards.test.ts
  modified:
    - apps/api/src/routes/budgets.ts
    - apps/api/src/boot.ts
    - packages/budgeting/package.json
    - packages/investments/package.json

key-decisions:
  - "Overspent card sourced from get-spendings-summary (overspentCents = overage − reserveUsed, archived flag) — the exact after-reserves formula D-10 demands 'matching the spendings grid', and archived exclusion D-06 — no new overspent query."
  - "computeBudgetWealthNow returns ONLY {capitalization, investment_value, currency} (the cron/wealth contract); getOverviewCards calls it for those two cards and reuses sumWalletsToCurrency on a single wallet read for the SPENDINGS/RESERVE partition."
  - "investment_value reuses investments.listHoldings.valueInBudgetCents (already FX→budget ccy, archived already excluded by the repo) — no second valuation path."
  - "Service returns bigint cents; the route is the single bigint→string boundary."

patterns-established:
  - "Shared FX-sum helper sumWalletsToCurrency for all default_ccy wallet aggregations in the overview"

requirements-completed: [SC2, SC6, D-07, D-08, D-09, D-10, D-11]

# Metrics
duration: 75 min
completed: 2026-06-28
---

# Phase 11 Plan 03: Overview Cards + computeBudgetWealthNow Summary

**5-card Overview summary (available-to-spend, capitalization, this-month overspent, cushion real-months, available reserves) in budget default_currency, plus the shared `computeBudgetWealthNow` primitive — TDD red→green→refactor, 8 unit + 3 real-DB integration tests green.**

## Performance

- **Duration:** ~75 min
- **Completed:** 2026-06-28
- **Tasks:** 4 (RED, GREEN, route+DB-test, REFACTOR)
- **Files modified:** 11

## Accomplishments

- `computeBudgetWealthNow`: Σ all wallets (FX→default_ccy) + investment value; reused by 11-06/11-07.
- `getOverviewCards`: 5 cards in default_currency — SPENDINGS/RESERVE partition, capitalization via the primitive, cushion real-months from get-cushion-summary, after-reserves overspent top-N + count from the spendings grid (archived excluded, D-06).
- `GET /budgets/:id/overview/cards` — bigint→string at the boundary; tenantIds 404 guard (T-11-05).
- Boot wiring reuses existing services (summaryRepo meta, getCushionSummary, getSpendingsSummary) + a holdings-valuation port over investments.listHoldings.

## Task Commits (TDD)

1. **RED** — `c75415c` (test): 8 failing unit tests (modules absent).
2. **GREEN** — `23d5a04` (feat): primitive + cards service; 8 unit tests pass; typecheck 0.
3. **Route + DB test** — `007de14` (feat): repo + route + boot wiring + 3 real-Postgres integration tests.
4. **REFACTOR** — done within GREEN: `sumWalletsToCurrency` extracted + reused by both the primitive and the cards partition (no separate commit).

## Files Created/Modified

See key-files frontmatter.

## Decisions Made

See key-decisions frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] overspent card reuses get-spendings-summary, not topOverspentCategories**

- **Found during:** Task 2 (overspent card)
- **Issue:** The plan's INTERFACES said reuse `summaryRepo.topOverspentCategories`, but that query computes spent − limit only (no reserve_used) and does NOT exclude archived — it cannot satisfy the must_have "after-reserves … matching the spendings grid (D-10)" + archived-excluded (D-06).
- **Fix:** Sourced the overspent card from `get-spendings-summary` (overspentCents = overage − reserveUsed; archived flag), filtered to !archived && overspent>0, top-N + count.
- **Verification:** Unit test "overspent card uses after-reserves overspent, excludes archived" passes.
- **Committed in:** `23d5a04`

**2. [Rule 3 - Blocking] missing package exports (enumerated exports map)**

- **Found during:** GREEN + Task 3
- **Issue:** @budget/budgeting + @budget/investments enumerate every export subpath; the new modules + list-holdings weren't listed → "Cannot find module".
- **Fix:** Added compute-budget-wealth-now, get-overview-cards, overview-cards-repo (budgeting) + list-holdings (investments) to `exports`.
- **Committed in:** `23d5a04`, `007de14`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking).
**Impact on plan:** Both necessary for correctness. The overspent-source change makes the card match D-06/D-10 exactly.

## Issues Encountered

- **infisical/Tailscale down** → integration tests can't get DB URLs from `make test`. Worked around by sourcing `DATABASE_URL_APP` + `DATABASE_URL_WORKER` from the running api container env and rewriting `@db:`→`@localhost:`. Both vars are required (the FX cache repo uses workerPool()). This applies to every Phase-11 integration test (11-04/05/07).

## User Setup Required

None.

## Next Phase Readiness

- computeBudgetWealthNow ready for 11-06 (live point) + 11-07 (cron).
- getOverviewCards + route ready for 11-08 (cards UI).
- **Verification caveat:** `make test`/`make ci-gate` (infisical-wrapped) couldn't run; tests were run directly with container-sourced DB URLs (8 unit + 3 integration green).

---

_Phase: 11-budget-overview_
_Completed: 2026-06-28_
