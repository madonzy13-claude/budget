---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 20
subsystem: web/settings
tags: [budget-currency, dialog, i18n, d-01, d-02, d-03, d-06]
key-files:
  created:
    - apps/web/test/components/settings/budget-identity-currency.test.tsx
    - apps/web/e2e/features/budget-currency-change.feature
    - apps/web/e2e/steps/budget-currency-change.steps.ts
  modified:
    - apps/web/src/components/settings/budget-identity-section.tsx
    - apps/web/messages/en.json
    - apps/web/messages/pl.json
    - apps/web/messages/uk.json
    - apps/web/test/components/settings/budget-identity-rows.test.tsx
    - apps/web/test/i18n/multi-currency-keys.test.ts
    - apps/web/e2e/page-objects/SettingsPo.ts
requirements-completed: [D-01, D-02, D-03, D-06]
---

# 14-20 Summary: budget currency change in Settings

- Owner: picker always enabled (`budget-currency-picker`), read-only only for members; `hasTransactions` prop kept optional for callers (settings progress), no longer gates.
- Pick → AlertDialog (`budget-currency-dialog`) with the plan-04 copy; Cancel ("Keep {current}") reverts, no request; Confirm → PATCH, `invalidateQueries({ predicate: key includes budgetId })` + `["active-budgets"]`, toast `currency_saved`, router.refresh(); error → toast `identity.currency_save_failed` (new key, en/pl/uk) and the picker stays on the current currency.
- Pruned `settings.identity.currency_locked_tooltip` and `bdp.tab.wallets.row.currencyReadOnlyAria` from en/pl/uk (readers gone here and in plan 15); parity test asserts they are absent.

## Verification
- Vitest RED (5 cases + rows test + parity) → GREEN: test/components/settings + test/i18n + wallet-row 218/218.
- `make build-web` (twice — the second carries the testid); served bundle: "budget-currency-picker" 1 chunk, "currency_locked" 0.
- `@budget-currency-change` chromium + mobile **8/8**: switch to EUR keeps the USD spending with "$" and the USD limit with "≈" line, survives reload; a category added after takes EUR, Food stays USD; EUR → USD round trip shows no sign again; cancel changes nothing. This is also the live owner-PATCH check for plan 19.

## Deviations
- Fresh E2E users have a USD budget, so the round trip is USD → EUR → USD (not PLN). Exact lossless totals are proven at repo level (plans 06/08).
- Added one i18n key (`currency_save_failed`) — the UI-SPEC's "existing" failure toast did not exist.

## Self-Check: PASSED
