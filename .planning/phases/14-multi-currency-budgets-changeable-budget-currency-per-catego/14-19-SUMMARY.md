---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 19
subsystem: api/tenancy
tags: [budget-currency, d-01, locks]
key-files:
  created:
    - packages/tenancy/test/default-currency-mutable.test.ts
  deleted:
    - packages/tenancy/test/default-currency-immutable.test.ts
  modified:
    - apps/api/src/routes/budget-identity.ts
    - apps/api/src/routes/budgets.ts
    - packages/tenancy/src/adapters/persistence/better-auth-org.ts
    - packages/tenancy/src/adapters/persistence/schema.ts
    - apps/api/test/routes/budget-identity.test.ts
    - packages/budgeting/test/ledger/edit-transaction-currency-lock.test.ts
requirements-completed: [D-01]
---

# 14-19 Summary: budget currency changeable any time (backend)

- Route: `hasTransactions → 409 currency_locked` guard and the `/immutable|locked|constraint/` → currency_locked catch mapping removed; owner-only gate unchanged; `hasTransactions` still in GET (settings progress). `default_currency` validated as `z.enum(FIAT_CURRENCIES)` on PATCH and on budget create (budgets.ts).
- Better Auth: `assertCurrencyChangeAllowed` + the `beforeUpdateOrganization` currency hook deleted. Tenancy schema comment no longer claims immutability.
- After a currency change: cushion + income-under-planned (existing runners, cushion now also triggered by currency) and RESERVE_TOPUP (`recomputeReserveTopup`) recompute best-effort.
- edit-transaction-currency-lock.test.ts: assertions already encoded R6 (row keeps its currency); only the stale header was rewritten.

## Verification
- RED (test commit): owner PATCH with transactions → **409** (expected 200); JPY → 200; Better Auth export still present.
- GREEN: budget-identity + budgets routes 33/0; ledger + architecture 39/0 (with the route file); `bun test packages/identity packages/tenancy` → **97 pass / 0 fail** (was 99: four lock tests removed, two mutable tests added). `grep -rn currency_locked apps/api/src packages/tenancy/src` → nothing.
- `make build-api` + `make build-worker` → healthy. The live owner PATCH on budget-dev is exercised end to end by plan 20's `@budget-currency-change` E2E.

## Deviations
- Invalid currency returns **400** (this route's zValidator default), not 422; the test asserts 400.
- The end-to-end re-expression after a real PATCH (ledger byte-identical, totals in EUR, back to PLN lossless) is proven at the repo/use-case level in plans 06/08/09/12/13 and live in plan 20, not duplicated in the route test (which uses in-memory deps).

## Self-Check: PASSED
