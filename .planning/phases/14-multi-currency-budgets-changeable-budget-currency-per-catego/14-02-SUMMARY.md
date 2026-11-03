---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 02
subsystem: domain
tags: [reserves, fx, pure]
key-files:
  created:
    - packages/budgeting/src/domain/fx-round.ts
    - packages/budgeting/src/domain/reserve-settle.ts
    - packages/budgeting/test/domain/fx-round.test.ts
    - packages/budgeting/test/domain/reserve-settle.test.ts
  modified: []
requirements-completed: [D-11, D-13, D-15, D-16]
---

# 14-02 Summary: settleReserveByCurrency + convertCents

- `convertCents(cents, rate)`: Big with explicit `Big.roundHalfUp` (global RM=2 from money.ts does not leak) — TS twin of SQL `fx_convert` rounding.
- `settleReserveByCurrency`: d[c] = wallets − need (own ccy first, D-11); convert each to budget at today's rate; net = Σ (exact, D-13, compared with 0n only); opposite side consumed from same-sign lines (budget first, then alphabetical); partly consumed foreign line shows `max(1, own-ccy remainder)` — display only, net exact; equiv in budget ccy for a currency with no RESERVE wallet (D-16); missing rate → `unconvertible` + own line, excluded from net; lines ordered wallet-currencies first, each group alphabetical.
- Exports `ReserveSettlement`, `ReserveSettlementLine`, `ReserveDirection`, `SettleReserveInput` for plans 12/13.

## Verification
- RED (d31b61d4): "Cannot find module '../../src/domain/fx-round'" / "'../../src/domain/reserve-settle'".
- GREEN: 15 pass / 0 fail (D-15 golden 7000n, D-12/D-16 golden EUR 1500 ≈ 6400 PLN, partial consumption both sides, display floor, missing rate, conservation, source guard). eslint (incl. local/no-float-money) + tsc clean.

## Deviations
- Partial foreign remainder converts back with today's reverse rate; when the reverse pair has no rate it divides by the forward rate (Big, half-up) instead of failing.

## Self-Check: PASSED
