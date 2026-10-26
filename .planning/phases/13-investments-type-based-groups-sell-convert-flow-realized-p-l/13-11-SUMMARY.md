---
phase: 13-investments-type-based-groups-sell-convert-flow-realized-p-l
plan: 11
subsystem: web
tags: [sell, delete, row-actions, deploy]
key-files:
  created:
    - apps/web/src/components/budgeting/wallets-tab/sell-sheet.tsx
    - apps/web/src/hooks/use-sell-holding.ts
    - apps/web/test/investments/sell-sheet.test.tsx
    - apps/web/test/investments/investment-row-sheet-actions.test.tsx
    - apps/web/e2e/features/investments-sell.feature
  modified:
    - apps/web/src/components/budgeting/wallets-tab/holding-sheet.tsx
    - apps/web/src/components/budgeting/wallets-tab/investment-row-sheet.tsx
    - apps/web/src/components/budgeting/wallets-tab/investment-row.tsx
    - apps/web/src/components/budgeting/wallets-tab/investments-section.tsx
    - apps/web/src/components/budgeting/wallets-tab/holding-delete-confirm.tsx
    - apps/web/src/hooks/use-delete-holding.ts (renamed from use-archive-holding.ts)
    - apps/web/test/investments/{holding-sheet,investment-row}.test.tsx
    - apps/web/e2e/{steps/investments.steps.ts,page-objects/InvestmentsPo.ts}
requirements-completed: [D-01, D-02, D-04, D-06, D-17, D-20]
---

# 13-11 Summary: Sell + Delete in the web

- `HoldingFormFields` = `HoldingSheet` in a `destination` mode (type picker + type fields only; amounts/prices/currency hidden; "Quantity bought" for tracked/metals; no deposit type; emits the new-holding payload). One source of truth for type fields without lifting ~25 state vars.
- `SellSheet`: stacked steps (left → destination radiogroup with arrow keys → received with currency chip / fixed for Existing → date ≤ today), live preview mirroring 13-01 (quantity / amount / deposit D-20), received prefilled from today's value at today's rate (`/fx/rate`), errors errLeftTooHigh / errReceived / errFuture / errFx / errSave, one POST via `useSellHolding` (refetch, no optimistic rewrite).
- Rows: swipe panel Sell (neutral) · Edit · Delete (ACTION_W 204); desktop hover Sell + Delete. One SellSheet mounted by the section.
- Delete → `useDeleteHolding` (DELETE /investments/:id, optimistic + rollback, invalidates holdings prefix + overview); confirm uses `deleteHolding.*` erase-history copy.

## Verification
- Vitest: sell-sheet 8/0, row actions 3/0, holding-sheet 34/0; investments dir 145+ pass; tsc + eslint clean.
- `make build-web`: buildId → `2026-10-26 10:56:48` (then rebuilt again for the fix below); served page chunk contains `investment-sell-`, `sell-submit`, `holding-form-destination`.
- Live E2E (new `@investments-sell` scenario, budget-dev): "Selling part of a deposit books its interest and restarts the rest" — chromium + phone viewport 2/2: DB principal 650000 with deposit_start_date = today; Deposit header shows realized +500.

## Deviations
- [Rule 1 bug, found by the live E2E] The create form auto-opens its Type list; embedded as the sale destination, that modal Radix list held focus and swallowed every keystroke in "Value left" (unit tests stubbed the fields so they missed it). Fixed: no auto-open in destination mode; regression test added; PO keeps plain `fill` (no retry masking).
- HoldingFormFields implemented as a mode of HoldingSheet rather than a state-lifting extraction (same single source of truth, far smaller diff).
- Received/preview conversion assumes the holding's buy and value currency are the same (true for every current type); ponytail note in code.

## Self-Check: PASSED
