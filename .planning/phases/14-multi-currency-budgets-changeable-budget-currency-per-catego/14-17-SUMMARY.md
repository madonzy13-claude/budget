---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 17
subsystem: web
tags: [category-slider, currency, d-04, d-07]
key-files:
  created:
    - apps/web/test/components/budgeting/category-slider-currency.test.tsx
    - apps/web/e2e/features/category-currency.feature
    - apps/web/e2e/steps/category-currency.steps.ts
    - apps/web/e2e/page-objects/CategorySliderPo.ts
  modified:
    - apps/web/src/components/budgeting/category-slider.tsx
    - apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx
    - packages/budgeting/src/application/get-spendings-summary.ts
    - packages/budgeting/test/overview/limit-rate-date.test.ts
requirements-completed: [D-04, D-06, D-07]
---

# 14-17 Summary: category currency in the slider

- Currency field (CurrencyPicker in `.editable-dots`, `category-currency-picker`) right under the limit row; add defaults to the budget currency, edit to the category's. Planned/cushion readouts format in the form currency. Create posts `currency`; every limit POST sends `normalCurrency`/`cushionCurrency` = form currency.
- Edit + currency change: `/fx/rate` today → needs/wants/custom fields converted in integer math (half away from zero) as a live preview; hint `grid.categoryCurrency.changeHint` (`category-currency-hint`). Save: `PATCH /categories/:id/currency` first, then the existing rename + limit writes. No rate (route 503 or 422 `fx_rate_unavailable`) → `category-currency-error` in `text-destructive`, Save disabled.
- **Bug fixed on the way (Rule 1):** since plan 07 the summary's plannedCents is in the budget currency, so the editor would have re-saved a foreign category's limit converted. The summary now carries `limitOriginal {planned, cushion, needs, wants}` in the limit's own currency and the grid prefills the slider from it (+ `currency`).

## Verification
- Vitest RED (4 fail) → GREEN 4/4; test/components 1314 pass / 26 skipped. Summary test extended (limitOriginal) RED → GREEN; get-spendings-summary 29/0. tsc web/budgeting clean; hex count in category-slider 0 before / 0 after.
- api + web rebuilt; `@category-currency` chromium + mobile 4/4. Served bundle: "category-currency-picker" in 1 chunk.

## Deviations
- E2E checks that spendings entered AFTER the change are in EUR. "Old spending shows a suffix" does not apply here: an old USD row in a USD budget is in the budget currency, so it renders bare (D-03 suffix is relative to the budget currency, covered by 14-18's FxAmount test).
- Live check covered en (chromium + mobile); pl/uk copy is verified by the plan-04 key test, not a live run.

## Self-Check: PASSED
