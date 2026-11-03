---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 10
subsystem: budgeting
tags: [reserve-fit, wealth, fx, guard]
key-files:
  created:
    - packages/budgeting/test/adapters/reserve-fit-wealth-multi-currency.test.ts
  modified:
    - packages/budgeting/src/adapters/persistence/reserve-fit-repo.ts
    - packages/budgeting/src/adapters/persistence/wealth-snapshot-repo.ts
    - packages/budgeting/src/application/get-overview-wealth.ts
    - packages/budgeting/src/application/get-overview-planned.ts
    - packages/budgeting/src/application/get-overview-overspent.ts
    - packages/budgeting/test/adapters/multi-currency-fixture.ts
requirements-completed: [D-02]
---

# 14-10 Summary: last read paths + architecture guard GREEN

- reserve-fit-repo: `CROSS JOIN LATERAL (SELECT COALESCE(ledgerAmountIn(budgetCurrency, "l"), 0) AS cents)` — oneOffPage ranks/keyset-paginates on it (id tie-break kept), largeTransactions ROW_NUMBER + ORDER on it, excludedSpendByCategory sums it.
- wealth-snapshot-repo: each amount column `fx_convert(col, s.currency, budget's current ccy, captured_at::date)` in seriesForRange/openingBefore (cost basis NULL stays NULL); stored snapshots untouched.
- Stale "no FX / stored in the budget currency" comments rewritten in get-overview-wealth / -planned / -overspent.
- `no-raw-converted-sum` guard now passes with only the writer allowlist.

## Verification
- RED (a64fe146): 3 fail (ranking used stored cents, excluded sum, wealth raw).
- GREEN: 3/0 — EUR 30.00 ≈ 120.00 PLN ranks above 100.00 PLN, excluded sum 12000, wealth PLN [100000, 112500] / EUR [25000, 25000], openingBefore 25000 in EUR.
- guard + overview + adapters + packages/investments/test → 593 pass / 0 fail. tsc + eslint clean.

## Deviations
- Wealth repo reads the target currency from tenancy.budgets in-query instead of a new `targetCurrency` parameter — same result, no port/fake signature change, target never from a caller.
- Aggregate + investment-history regression cases not added as new tests: aggregate consumes the per-budget services (now in default_currency) and history-queries already converts from `budget_currency`; the investments suite (in the run above) passes unchanged. Re-checked end-to-end in plan 21.

## Self-Check: PASSED
