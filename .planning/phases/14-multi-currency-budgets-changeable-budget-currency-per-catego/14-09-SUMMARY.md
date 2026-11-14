---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 09
subsystem: budgeting
tags: [cashflow, cushion, scheduled, income, fx]
key-files:
  created:
    - packages/budgeting/test/application/twin-budgets-fixture.ts
    - packages/budgeting/test/application/cashflow-multi-currency.test.ts
    - packages/budgeting/test/application/cushion-income-multi-currency.test.ts
  modified:
    - packages/budgeting/src/application/compute-cashflow-projection.ts
    - packages/budgeting/src/application/compute-scheduled-monthly.ts
    - packages/budgeting/src/application/get-cushion-summary.ts
    - packages/budgeting/src/application/recompute-income-under-planned-task.ts
requirements-completed: [D-02, D-08]
---

# 14-09 Summary: application-layer SQL sites convert at read time

- Inline `budgeting.fx_convert(..., ${budgetCurrency}::text, ...)` with bound params (application must not import adapters, so fx-sql.ts fragments are not used here).
- compute-cashflow-projection: this-month spend + unanswered drafts converted at each row's date (COALESCE 0 for a missing pair); limit rows now carry normal/cushion currency and convert at today's rate via the existing `fxOne` (sumWalletsToCurrency) before `budgetAt` reads them; wallets already went through sumWalletsToCurrency. Stale "no FX" comment rewritten.
- compute-scheduled-monthly: trailing spend by month converted at each row's date.
- get-cushion-summary: Σ cushion_amount converted from cushion_currency at today.
- computeIncomeVsPlanned: Σ normal_amount converted from normal_currency at today.

## Verification
- Twin fixture (throwaway testcontainer): one budget holds EUR, its twin the same money in PLN at the seeded rates; every read must match. RED (9f54772b + bec96209, after making stored converted cents = original so a raw read differs between twins): 5 fail. GREEN: 5 pass (projection JSON identical, pending points, scheduled monthly, cushion required 135000 = 150 EUR × 4.5 × 2, planned 90000 both).
- packages/budgeting/test/application + tasks: 308 pass / 0 fail. `grep -c amount_converted_cents` = 0 in all four files; no "no FX" left in the projection. tsc + eslint clean.

## Deviations
- The plan's income-under-planned emit/resolve scenario is obsolete: since 260731 the INCOME_UNDER_PLANNED task reads the cash-flow projection (covered by the twin projection test); `computeIncomeVsPlanned.plannedCents` is tested directly.

## Self-Check: PASSED
