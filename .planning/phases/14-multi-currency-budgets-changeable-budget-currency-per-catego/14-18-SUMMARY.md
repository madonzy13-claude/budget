---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 18
subsystem: web
tags: [spendings-grid, currency, d-05, d-08]
key-files:
  created:
    - apps/web/test/components/budgeting/transaction-slider-default-currency.test.tsx
    - apps/web/test/components/budgeting/spendings-grid/quick-entry-category-currency.test.tsx
    - apps/web/test/components/budgeting/spendings-grid/column-header-limit-currency.test.tsx
    - apps/web/test/components/budgeting/spendings-grid/foreign-amount.test.tsx
    - apps/web/e2e/features/transaction-currency-default.feature
    - apps/web/e2e/steps/transaction-currency-default.steps.ts
  modified:
    - apps/web/src/components/budgeting/transaction-slider.tsx
    - apps/web/src/components/budgeting/spendings-grid/quick-entry-input.tsx
    - apps/web/src/components/budgeting/spendings-grid/column-header.tsx
    - apps/web/src/components/budgeting/spendings-grid/category-column.tsx
    - apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx
    - apps/web/e2e/page-objects/SpendingsPo.ts
requirements-completed: [D-05, D-08]
---

# 14-18 Summary: category-currency entry defaults + foreign limit display

- Grid category list carries `currency`; TransactionSlider defaults `currencyOrig` to the category's currency (create mode re-defaults on category switch while the currency field is untouched; edit keeps the row's currency). QuickEntryInput gets `currency` (column category) and posts/queues it.
- ColumnHeader: when `limitCurrency ≠ budgetCurrency` (normal mode, limited) the limit denominator renders via `FxAmount` in its own currency and a muted `grid.limitEquivalent` "≈ {budget-currency amount}" line (testid `column-limit-equivalent`).

## Verification
- Vitest RED (450f602e): 4 fail (slider PLN vs EUR, quick entry posted budget ccy, no ≈ line); FxAmount characterization passed already (D-03 behaviour existed). GREEN 7/7; test/components/budgeting 753 pass / 18 skipped / 0 fail; tsc web clean.
- `make build-web` → served buildId 2026-11-03 15:00:33; `@transaction-currency-default` chromium + mobile 4/4 passed; spendings `@phase8` 22 passed (`.last-run.json` passed).

## Deviations
- E2E scenario 3 (open the slider from a column) dropped: no UI path opens the create slider prefilled per column; slider default is covered by Vitest.
- A full chromium run was also triggered by mistake while locating the tag (output discarded); the reported numbers are from the tagged runs.

## Self-Check: PASSED
