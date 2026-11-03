---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 15
subsystem: wallets
tags: [reserves, wallets, d-09, d-14]
key-files:
  created:
    - packages/budgeting/test/application/update-wallet-reserve-currency.test.ts
    - apps/web/e2e/features/reserve-wallet-currency.feature
    - apps/web/e2e/steps/reserve-wallet-currency.steps.ts
  modified:
    - packages/budgeting/src/application/update-wallet.ts
    - apps/web/src/components/budgeting/wallets-tab/wallet-row.tsx
    - apps/web/src/components/budgeting/wallets-tab/wallets-sectioned-list.tsx
    - apps/web/src/hooks/use-update-wallet.ts
    - apps/web/src/lib/offline-write.ts
    - apps/web/e2e/page-objects/WalletSectionsPo.ts
    - apps/api/test/routes/wallet-patch.test.ts
    - packages/budgeting/test/application/reserves-use-cases.test.ts
    - apps/web/test/components/wallet-row.test.tsx
    - apps/web/test/hooks/use-update-wallet.test.tsx
requirements-completed: [D-09, D-14]
---

# 14-15 Summary: reserve wallets in any currency

- API: `reserve_currency_mismatch` guard deleted from update-wallet; the existing RESERVE_TOPUP recompute already fires for was-or-is RESERVE wallets (covers a currency change). create-wallet had no guard (validates against supported_currencies only).
- Web: reserve rows render the same `.editable-dots` CurrencyPicker as other sections; ROW_FIELDS always includes currency (keyboard nav reaches it); the mismatch toast branch (list) and toast suppression (hook) removed. `currencyReadOnlyAria` key left for plan 20 to prune.
- Tests asserting the old guard (reserves-use-cases, wallet-patch ×3, wallet-row, use-update-wallet) inverted to the D-09 behaviour.

## Verification
- RED: update-wallet test → "reserve_currency_mismatch"; wallet-row inverted test failed (read-only span).
- GREEN: API tests 40/0; web test/components 1306 pass (+test/lib later 1957 incl. 14-14); tsc + eslint clean.
- Images rebuilt (`make build-api`, `build-worker`, `build-web`); `@reserve-wallet-currency` chromium + mobile 4/4 (currency change persists after reload; USD+EUR reserve section total > 200 in budget currency).
- Served bundle: `docker exec budget-web-1 grep -rl reserve_currency_mismatch /app/apps/web/.next/static | wc -l` → 0.

## Deviations
- E2E uses the fresh user's USD budget (USD + EUR wallets), not PLN.

## Self-Check: PASSED
