---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 03
subsystem: domain
tags: [reserves, fx, d-17, pure]
key-files:
  created:
    - packages/budgeting/src/domain/reserve-month-conversion.ts
    - packages/budgeting/test/domain/reserve-month-conversion.test.ts
  modified: []
requirements-completed: [D-17]
---

# 14-03 Summary: D-17 closed-month result conversion

- `convertClosedMonthResult`: LIFO stack of above-limit portions (payment pushes its part above max(L, S_before); refund pops most recent first); overage = Σ convertCents(portion, rateOn(date)) each rounded alone; leftover = convertCents(max(L − S, 0), closeRate); limit = convertCents(L, closeRate). noLimit → all 0.
- `toEngineMonthEvents`: normal = cushion = limit; spend = limit + overage | limit − left; noLimit passes through — the unchanged engine reproduces the converted cell exactly.

## Verification
- RED (6e90b1f1): "Cannot find module '../../src/domain/reserve-month-conversion'".
- GREEN: 9 cases (leftover, straddle 900, two-over 700, LIFO refund 300, refund under limit 750, noLimit, per-portion rounding, 30-case invariant, real-engine round trip). `packages/budgeting/test/domain` 241 pass / 0 fail; eslint + tsc clean.

## Deviations
None.

## Self-Check: PASSED
