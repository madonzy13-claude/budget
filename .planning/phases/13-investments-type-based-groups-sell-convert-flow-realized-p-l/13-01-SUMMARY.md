---
phase: 13-investments-type-based-groups-sell-convert-flow-realized-p-l
plan: 01
subsystem: investments-domain
tags: [tdd, booking, big.js]
key-files:
  created:
    - packages/investments/src/domain/sell-booking.ts
    - packages/investments/test/domain/sell-booking.test.ts
  modified: []
requirements-completed: [D-02, D-03, D-06, D-18, D-20]
---

# 13-01 Summary: Booking math

Pure booking module: `sellAmountHolding`, `sellQuantityHolding`, `realizedInBudget`, `buyMore`, `addMoney`, `mergeIntoAmountHolding`, `sellDepositPart`, `reverseEntry`. big.js half-even, bigint cents, no drizzle/FX imports.

- Cost-side FX rule documented in header: sold cost + received both at sale-date rate → 0% sale books 0 realized.
- Reversal rule: subtract entry's own deltas from current state; later changes survive.
- All CONTEXT fixtures pinned to the cent (broker 96k/55k, withdraw-via-edit, BTC, FX freeze, D-20 deposit, undo incl. later-changed holding + delete-then-re-enter).

## Commits
- ab94a3ce test(13-01) RED
- 9f2943b1 feat(13-01) GREEN

## Verification
`bun test packages/investments/test/domain` → 74 pass / 0 fail; `tsc --noEmit` clean; eslint clean.

## Deviations
None.

## Self-Check: PASSED
