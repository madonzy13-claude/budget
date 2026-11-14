---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 11
subsystem: budgeting
tags: [reserves, fx, d-10, d-17, replay]
key-files:
  created:
    - packages/budgeting/test/reserves/currency-fixture.ts
    - packages/budgeting/test/reserves/reserve-need-by-currency.test.ts
    - packages/budgeting/test/reserves/reserve-replay-currency-change.test.ts
  modified:
    - packages/budgeting/src/domain/reserve-engine.ts
    - packages/budgeting/src/adapters/persistence/reserve-event-loader-repo.ts
    - packages/budgeting/src/ports/reserve-event-loader-repo.ts
    - packages/budgeting/src/application/get-reserve-positions.ts
requirements-completed: [D-10, D-17]
---

# 14-11 Summary: per-currency reserve replay

- Engine: optional `categoryCurrency` / `defaultCurrency` input; `internalByCurrency` output (Σ R of active categories per category currency). Diff = types + the final aggregation only (17+/2−); op1–op4 untouched.
- Loader: spend now one row per payment (ordered transaction_date, created_at, id) with `native = fx_convert(..., category.currency, transaction_date)`; categories return `currency`; adjustments return `currency` + occurred date and convert at that date. Per (category, month) limit: same currency → as before; open month in another currency → today's rate (D-08); CLOSED month in another currency → D-17 path (txs into the month currency at their dates, effective limit by cushion history, `convertClosedMonthResult` + `toEngineMonthEvents` override that month's limit + spend). Rates via a memoised in-tx lookup with fx_convert's semantics. Missing pair → row skipped, `fxUnavailable: true`. `transactionRepo.spendByCategoryByMonth` no longer used here.
- get-reserve-positions passes the currencies to the engine and returns `internalByCurrency`, `categoryCurrency`, `fxUnavailable`.

## Verification
- RED (e8dd5ed3): 5 fail (R 14000 vs golden 3780; E reserve 1400 vs 7850; no fxUnavailable).
- GREEN: 5/0 — D-10 {PLN 20000, EUR 7850}; D-17 golden 37.80 EUR (arithmetic in the test header), unchanged after a later 0.10 rate, native M3 overspend 216000 with reserve drawn to 0, ZZQ payment skipped + flagged.
- reserves + domain + adapters + tasks + application + reserves/reserves-adjust/spendings-summary routes → 654 pass / 0 fail.
- Perf, largest dev budget (get-reserve-positions, median of 5): 69.6 ms (baseline) → 72.2 ms.

## Finding for the user (data, not code)
- Budget d30ee8ca (all PLN) internal reserve moved 1,312,097 → 1,399,136 cents. Cause: 2 ledger rows whose stored fields disagree — `currency_original = PLN, amount_original = 1000.00 / 300.00` but `amount_converted = 4369.50 / 1170.39` at fx_rate 1 (2026-09-30 "tato", 2026-10-16 "dima podatki"; no audit rows). Read-time conversion trusts the original amount + currency (D-03), so these now count as 1000 / 300 PLN. Either the originals are right (old totals were inflated) or the rows were paid in a foreign currency and the currency field is wrong. Raised in plan 21's parity report.

## Deviations
- Rate lookups go through a small in-loader SQL query (no FX port injected): no new deps at the 6 wiring sites; same fallback semantics as fx_convert.

## Self-Check: PASSED
