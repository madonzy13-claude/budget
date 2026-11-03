---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 07
subsystem: budgeting
tags: [limits, fx, d-08, spendings-summary]
key-files:
  created:
    - packages/budgeting/test/overview/limit-rate-date.test.ts
  modified:
    - packages/budgeting/src/ports/category-limit-repo.ts
    - packages/budgeting/src/adapters/persistence/category-limit-repo.ts
    - packages/budgeting/src/application/get-spendings-summary.ts
requirements-completed: [D-08]
---

# 14-07 Summary: D-08 limit conversion in the spendings summary

- Port: new `EffectiveLimit` type (`planned, cushion, needs, wants, noLimit, normalCurrency?, cushionCurrency?`) used by effectiveForMonth / effectiveForMonths; the Drizzle repo selects and returns `normal_currency` / `cushion_currency`. (getEffectiveLimit / listForCategory already returned them via CategoryLimitRow.)
- get-spendings-summary: rate date = min(last day of viewed month, today in budget tz from `deps.now ?? serverNow`); per limit currency ≠ budget, rate via FX port (memoised per currency) + `convertCents`; planned/needs/wants by normal rate, cushion by cushion rate; missing rate → 0 + `fxUnavailable: true` (never par, never throws). DTO adds `limitOriginalCents`, `limitCurrency`. Smart-Investments income asOf now uses the same clock. Reserve fields untouched (plan 12).

## Verification
- RED (e4767d34): 4 fail — plannedCents "50000" raw vs 220000/225000, no-pair row "50000" vs "0" (the repo-currency case already passed: repo extension was written first).
- GREEN: limit-rate-date 5/0 (past month at 4.40, current at 4.50, later rate 5.00 moves current only, ZZQ → 0 + flag). packages/budgeting/test/{application,adapters,overview} 507 pass / 0 fail. tsc budgeting/api/worker/web clean; eslint clean; `grep -c current_date get-spendings-summary.ts` = 0.

## Deviations
- `normalCurrency`/`cushionCurrency` optional on EffectiveLimit (absent = budget currency) so in-memory test fakes keep compiling; the Drizzle repo always sets them.
- Repo extension written before the RED test file (test still committed RED on the summary assertions).

## Self-Check: PASSED
