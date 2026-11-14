---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 16
subsystem: budgeting
tags: [categories, currency, d-07, limits]
key-files:
  created:
    - packages/budgeting/src/application/change-category-currency.ts
    - packages/budgeting/test/application/change-category-currency.test.ts
    - apps/api/test/routes/categories-currency.test.ts
  modified:
    - packages/budgeting/src/ports/category-limit-repo.ts
    - packages/budgeting/src/adapters/persistence/category-limit-repo.ts
    - packages/budgeting/src/contracts/api.ts
    - packages/budgeting/src/contracts/factory.ts
    - packages/budgeting/package.json
    - apps/api/src/routes/categories.ts
requirements-completed: [D-07]
---

# 14-16 Summary: change a category's currency (D-07)

- `CategoryLimitRepo.changeCategoryCurrency` (one withTenantTx, same advisory lock as setLimit, `FOR UPDATE` on the category): today in budget tz from the bound serverNow; segments covering/after this month: one that started earlier is closed the day before the 1st (setLimit's convention) and continued from the 1st converted; later ones updated in place. Every amount column (normal, cushion, needs, wants, legacy cushion_amount_cents) via `convertCents` in TS, bound params. Missing rate → `no_rate`, nothing written. Audit row category currency before/after.
- Use case `changeCategoryCurrency` → Result; maps no_rate → `fx_rate_unavailable` (with `pair`), recomputes RESERVE_TOPUP + INCOME_UNDER_PLANNED best-effort after the change. Wired in factory; package export added.
- `changeCategoryCurrencySchema` (enum of 8); route `PATCH /categories/:id/currency` → 200 {category, limitsConverted}, 404, 422 validation / `fx_rate_unavailable` {pair}.

## Verification
- RED (ed34a158): "Cannot find module …/change-category-currency".
- GREEN: application 5/0 (no-op, ZZQ refused + unchanged, segments [PLN 1998-02-01..04-30 100000 | EUR 05-01..05-31 23330 | EUR 06-01.. 27996], ledger byte-identical, reserve rebuilt EUR 11665, new tx defaults EUR); route 4/0 (JPY 422, unknown 404, same 200, EUR 200). With categories, category-limits, reserves suites + route-coverage audit → 55/0. tsc budgeting/api clean.

## Deviations
- The rate is read inside the repo transaction (fx_rates lookup with fx_convert's fallback) instead of the FX port, keeping the change atomic with no new port wiring.
- Category currency is written by the limit repo (same transaction as the split) rather than a separate category-repo `setCurrency`.

## Self-Check: PASSED
