---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 13
subsystem: budgeting
tags: [reserves, dto, d-02, d-10]
key-files:
  created:
    - packages/budgeting/test/reserves/reserve-dtos-by-currency.test.ts
  modified:
    - packages/budgeting/src/application/get-reserve-positions.ts
    - packages/budgeting/src/application/get-reserves-summary.ts
    - packages/budgeting/src/application/reserves-summary-builder.ts
    - packages/budgeting/src/application/get-spendings-summary.ts
requirements-completed: [D-02, D-10, D-12, D-16]
---

# 14-13 Summary: per-currency reserve DTOs

- Positions expose `rateToBudget` (today's rate per reserve/wallet currency).
- Reserves summary rows carry `currency`; totals add `needByCurrency`, `walletsByCurrency` (alphabetical), `lines` (settlement order, bigint → string); `usedCents` / `usedThisMonthCents` now convert each category at today's rate instead of a raw cross-currency sum. Legacy internal/userDefined/surplus stay (budget ccy, from plan 12).
- Spendings summary: reserveUsed / reserveAvailable (end reserve) / overage from engine cells convert from the category currency at the plan-07 rate date of the viewed month.
- Overview cards read `totals.internalCents`, which is already the converted budget-currency total (asserted in the summary test) — no code change.

## Verification
- RED (test commit before feat): row lacked currency/totals; spendings reserveUsed "1000" (EUR raw) vs "4200".
- GREEN: 2/2 (EUR row 6850 EUR, needs [EUR 6850, PLN 20000], wallets [PLN 20000], line EUR 6850 ≈ PLN 29455, internal 49455, used 4300; April reserveUsed 4200 at 4.20). packages/budgeting/test + apps/api/test/routes → 1473 pass / 1 fail (baseline scheduled-payments case). tsc budgeting/api/web clean.

## Deviations
- DTO asserted through the application use case (DB-backed) rather than a new reserves route case; the route is a pass-through and its existing tests pass.

## Self-Check: PASSED
