---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 06
subsystem: budgeting
tags: [ledger, fx, read-time-conversion, guard]
key-files:
  created:
    - packages/budgeting/test/ledger/read-time-conversion.test.ts
    - apps/api/test/architecture/no-raw-converted-sum.test.ts
  modified:
    - packages/budgeting/src/adapters/persistence/transaction-repo.ts
    - packages/budgeting/src/ports/transaction-repo.ts
    - apps/api/src/routes/transactions.ts
    - apps/api/test/routes/transactions.test.ts
requirements-completed: [D-02, D-03]
---

# 14-06 Summary: ledger read-time conversion + architecture guard

- transaction-repo: `LEDGER_SELECT` (ledger JOIN budgets, LATERAL `fx_convert(original, currency_original, budget.default_currency, transaction_date)`) for findById / listForMonth → `amountConvertedCents` re-expressed, `currencyConverted` = current budget ccy, `fxUnavailable` (no pair → original amount in its own currency, never par). `spendSum(budgetId)` = `COALESCE(SUM(fx_convert(...)),0)` in spendByDay / spendByCategory / spendByCategoryByMonth (budget ccy read in-query from tenancy.budgets, never from the request).
- Route: `currency_converted` comes from the row (also on GET /:txId now); the per-request getBudgetCurrency label call removed from the list.
- Guard `no-raw-converted-sum.test.ts`: walks packages/*/src, apps/api/src, apps/worker/src; allowlist = writers (+ transaction-repo INSERT/UPDATE lines and the route's DTO key line). Comments reworded instead of allowlisted.
- `search-transactions.ts` does not read the column (uses legacy aliases) — untouched.

## Verification
- RED (3e027fca): Food total 1999998n vs expected 14500n / 3500n (stored converted read); route amount_converted_cents "10000" vs "2500"; guard listed transaction-repo, overview-repo, budget-home-summary, reserve-fit, cashflow, scheduled-monthly, get-overview-planned, ports, routes.
- GREEN: packages/budgeting/test/ledger + transactions route → 29 pass; fixture proves PLN 14500 → EUR 3500 (D1 rate, not LATER) → PLN 14500 exactly, ledger rows byte-identical (row_to_json) before/after. Guard still RED by design, now listing only overview-repo, budget-home-summary-repo, reserve-fit-repo, compute-cashflow-projection, compute-scheduled-monthly, get-overview-planned, ports/budget-home-summary-repo (plans 07-10).
- tsc budgeting + api clean; eslint clean.

## Deviations
- Budget currency switched in tests as postgres (migrator cannot see budgets under FORCE RLS).
- Converted value aliased `converted_cents` in SQL so the read path never names the stored column.

## Self-Check: PASSED
