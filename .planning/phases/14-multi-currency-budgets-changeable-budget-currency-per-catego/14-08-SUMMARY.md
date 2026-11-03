---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 08
subsystem: budgeting
tags: [overview, home, fx, d-02, d-08]
key-files:
  created:
    - packages/budgeting/test/adapters/multi-currency-fixture.ts
    - packages/budgeting/test/adapters/overview-repo-multi-currency.test.ts
    - packages/budgeting/test/adapters/budget-home-summary-multi-currency.test.ts
  modified:
    - packages/budgeting/src/adapters/persistence/fx-sql.ts
    - packages/budgeting/src/adapters/persistence/overview-repo.ts
    - packages/budgeting/src/adapters/persistence/budget-home-summary-repo.ts
    - packages/budgeting/src/ports/budget-home-summary-repo.ts
requirements-completed: [D-02, D-08]
---

# 14-08 Summary: Overview + budget home read-time conversion

- fx-sql.ts gains `budgetCurrency(budgetId)`, `ledgerAmountIn(target, alias?)` (sql.identifier, no sql.raw) and `budgetToday(budgetId, now)` (bound serverNow() AT TIME ZONE budget tz); `limitRateDate` accepts a SQL `today`.
- overview-repo: monthlySpendByCategory / dailySpend sum `ledgerAmountIn(budgetCurrency)` (incl. the scheduled FILTER sums); monthlyPlannedByCategory LATERAL converts normal/cushion/needs from their own currency at `LEAST(cm.month_end, today)` (COALESCE 0 for a missing pair; needs stays NULL when NULL).
- budget-home-summary-repo: sumCurrentMonthSpend + topOverspentCategories spend converted; limits converted at `LEAST(month_end, today)`. Header + port comments reworded (no column name).
- Shared test fixture (1999 dates, test clock 1999-06-15): A PLN 1000 (needs/wants), B EUR 200, T EUR 2; EUR↔PLN rates on 05-20, 06-10, 06-20.

## Verification
- RED (55ad159a): planned 120000 vs 180000/190000; spent 1999998 (stored, deliberately wrong) vs 14000; home overspend 999799 vs 3100.
- GREEN: both files 7/0 — P at 4.0, C at 4.5 (not the later 9.9), EUR switch → spent 3500, planned 40000, home over 800; back to PLN exact. adapters + overview + ledger + categories/transactions routes + 0104 schema → 307 pass / 0 fail; 0 leftover seeded FX rows.
- Perf (largest dev budget d30ee8ca, monthlyPlanned + monthlySpend + dailySpend 2022-10…2026-11, median of 5, as app_role): before 96.6 ms (baseline worktree) → after 149.1 ms (< 500 ms gate).
- Guard no longer lists overview-repo / budget-home-summary files.

## Deviations
- [Rule 1 – test bug] Phase 14 DB tests (this plan's fixture, read-time-conversion, categories/transactions route tests) changed the budget currency and cleaned up as postgres. In one-process runs `investment-limit-mode-none.test.ts` repoints DATABASE_URL_* at a testcontainer and never restores it, so the dev superuser password fails there. All now use app_role (UPDATE default_currency + DELETE grants exist); fx-convert-fn's perf probe skips when the superuser is unreachable. Commit 3b6b063f.

## Self-Check: PASSED
