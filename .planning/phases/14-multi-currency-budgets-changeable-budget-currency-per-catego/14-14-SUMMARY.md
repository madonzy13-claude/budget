---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 14
subsystem: web
tags: [reserves, tasks, i18n, d-12, d-16]
key-files:
  created:
    - apps/web/src/lib/reserve-lines-format.ts
    - apps/web/test/lib/reserve-lines-format.test.ts
    - apps/web/test/components/budgeting/task-banner-row-lines.test.tsx
    - apps/web/e2e/features/reserves-multi-currency.feature
    - apps/web/e2e/steps/reserves-multi-currency.steps.ts
  modified:
    - apps/web/src/components/budgeting/task-banner-row.tsx
    - apps/web/src/components/budgeting/reserves-tab/reserves-totals-footer.tsx
    - apps/web/src/components/budgeting/reserves-tab/reserves-table-client.tsx
    - apps/web/src/hooks/use-reserves-summary.ts
    - apps/web/test/components/reserves-totals-footer.test.tsx
    - apps/web/e2e/features/tasks.feature
    - apps/web/e2e/steps/tasks.steps.ts
    - apps/web/e2e/page-objects/ReservesPo.ts
requirements-completed: [D-12, D-16]
---

# 14-14 Summary: per-currency reserve copy and reserves tab

- `formatReserveLines(lines, locale)`: `centsToBare` + " CCY", "(≈ … CCY)" for an equiv, joined by `Intl.ListFormat` conjunction (and / i / і). No Number()/parseFloat.
- Task banner: RESERVE_TOPUP with `payload.lines` → `{amount}` = the list (withdraw template too); legacy payloads unchanged.
- Reserves tab: rows format in `row.currency`; footer adds `reserves-footer-line-<CCY>` "needed / in wallets CCY" lines when reserves/wallets span currencies (single-currency unchanged). Hook types extended.
- There is no reserves-tab "message" component in the code any more (the task banner is the single nudge surface), so the message part of the plan maps to the banner.

## Verification
- Vitest RED (formatter/banner: module missing; footer: no lines) → GREEN; test/components + test/lib 1957 pass / 26 skipped / 0 fail; tsc clean.
- `make build-web`; `@tasks-redesign` chromium + mobile → 46 passed (incl. "Top up reserve by 120 PLN and 15 EUR (≈ 64 PLN)" and the EUR/USD footer lines).
- Served bundle (web container `.next/static`): "reserves-footer-line-" in 1 chunk, "ListFormat" in ≥1.

## Deviations
- Copy uses the bare formatter ("120 PLN"), matching UI-SPEC §6's example, not "120.00 PLN".

## Self-Check: PASSED
