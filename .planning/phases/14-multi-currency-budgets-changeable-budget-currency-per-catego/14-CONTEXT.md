# Phase 14: Multi-currency budgets - Context

**Gathered:** 2026-11-03
**Status:** Ready for planning
**Source:** Decisions taken with the user in conversation (2026-11-03), plus a code map of every place that assumes one budget currency.

<domain>
## Phase Boundary

The budget currency stops being fixed. It can change at any time, and every total re-expresses itself in the new currency at historical rates, while each transaction keeps the currency it was entered in. Spending categories each carry a currency, and reserve wallets may be in any currency; the reserve need and its top-up/withdraw tasks are stated per currency.

Out of scope: new FX providers, currencies beyond the 8 with history (USD EUR PLN GBP UAH CHF NOK SEK), and changing how investments themselves are priced.

</domain>

<decisions>
## Implementation Decisions

### Budget currency

- D-01: The owner can change the budget currency at any time, including after transactions exist. Both locks go: the route guard (`apps/api/src/routes/budget-identity.ts` `currency_locked` 409) and the Better Auth org path (`packages/tenancy/src/adapters/persistence/better-auth-org.ts`). The stale "immutable via trigger" comment in the tenancy schema is corrected.
- D-02: After a change, ALL amounts are shown in the new currency, converted at historical rates (each amount at its own date's rate). No total may mix currencies.
- D-03: Transactions never change currency on their own. A transaction entered in the old budget currency keeps its original amount and currency and renders with its currency suffix — the same way foreign-currency transactions render today (`FxAmount`). To change a transaction's currency, the user edits that transaction.

### Category currency

- D-04: Each spending category has a currency. At creation it defaults to the budget currency of that moment.
- D-05: A plain transaction entered in a category takes that category's currency by default (quick entry and the transaction slider default to the category's currency, not the budget's).
- D-06: On a budget currency change, existing categories keep their currency; categories created afterwards default to the new budget currency.
- D-07: A category's currency can be changed after it has transactions. Its LIMIT converts at today's rate (e.g. 1000 PLN → ~233 EUR). Its existing transactions keep their own currency and simply show it as a suffix; new transactions default to the new currency.

### Limits in another currency

- D-08: When a category's currency differs from the budget currency, its limit counts toward budget totals, plans and reserves at:
  - the CURRENT month: the latest available rate;
  - a PAST month: the last rate available within that month (frozen — past months never move).

### Reserves

- D-09: Reserve wallets can be in any currency (unlock: `wallet-row.tsx` `isReserveSection` read-only currency; `update-wallet.ts` `reserve_currency_mismatch`; any equivalent check on create).
- D-10: The reserve need is per currency: each category's reserve is held in that category's currency, so the total need is one amount per currency.
- D-11: Reserve wallets in a currency cover that currency's need first (so FX moves do not touch it). Only the remainder is converted at today's rate and covered by / counted against wallets in other currencies.
- D-12: The reserve message and the RESERVE_TOPUP / withdraw task state the shortfall or surplus per currency, e.g. "Top up 120 PLN and 15 EUR". Where a currency has no wallet of its own, show the equivalent in the covering wallet's currency: "15 EUR (≈ 64 PLN)".
- D-13 (user, 2026-11-03): Single-currency reserves stay allowed; FX moves will raise top-up/withdraw tasks more often, which the user accepts — a user who wants fewer tasks keeps reserve wallets in several currencies. NO tolerance / dead-band anywhere: every shortfall or surplus, including the converted cross-currency remainder, is exact (today's `surplus === 0n` behaviour), and the calculation must be exact.
- D-15 (user, 2026-11-03): Reserves NET across currencies. A surplus in one currency covers a shortfall in another at today's rate; only the net remainder can raise a top-up/withdraw task (e.g. PLN +200 surplus, EUR −30 short ≈ −130 PLN → no top-up; net +70 PLN surplus).
- D-16 (user, 2026-11-03): The "≈" equivalent for a currency with no reserve wallet of its own is shown in the BUDGET currency.
- D-17 (user, 2026-11-03): After a category's currency changes, its reserve is in the NEW currency, rebuilt by the per-month replay:
  - each past month is computed in the currency the category had IN THAT MONTH (limit in that currency; spending converted to it at each transaction's date — exactly as the month read at the time);
  - only the month's RESULT converts to the category's current currency: a LEFTOVER at that month's closing rate (last rate within the month); an OVERSPEND at the rate on the date(s) of the transaction(s) that pushed spending past the limit (a transaction straddling the limit: only the part above it uses its date);
  - manual reserve adjustments convert at their own date's rate;
  - months after the change are native, no conversion. Closed months never move (past rates only).
- D-14: Existing bug fixed in this phase: the reserve-wallet total (`reserves-summary-repo.ts`) sums RESERVE wallets across currencies with no FX.

### Claude's Discretion

- Strategy for re-expressing stored amounts: convert at read time from `amount_original_cents` + `currency_original` + date (the FX cache already does per-date binary search), versus adding a converted-currency column and re-converting on change. Pick what keeps every aggregation correct with the least risk; the ledger is append-only, so prefer read-time conversion or a derived cache over rewriting ledger rows.
- Whether category limits get a real per-category currency column or reuse `category_limits.normal_currency` / `cushion_currency` (stored today but ignored on read).
- How wealth snapshots and investment history (stored in the budget currency at capture time, with a `currency` / `budget_currency` column) are re-expressed.
- Behaviour when an FX rate is missing: never fail a whole summary; fall back to the most recent prior rate and mark it stale, as the cache adapter already does.
- Migration of existing data: every existing category gets the budget's current currency.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Ledger and FX

- `packages/budgeting/src/adapters/persistence/expense-ledger-draft-schema.ts` — real ledger schema: `currency_original`, `amount_original_cents`, `amount_converted_cents`, `fx_rate`, `fx_as_of` (no column for the converted currency). `packages/platform/src/db/expense-ledger.ts` is STALE — do not trust its column names.
- `packages/budgeting/src/application/create-transaction.ts`, `edit-transaction.ts` — FX at write time.
- `packages/shared-kernel/src/ports/fx-provider.ts`; `packages/budgeting/src/adapters/fx/cache-only.ts` (API, never fetches; stale fallback; throws `NoFxRateAvailable`); `frankfurter.ts` (worker); `fx-rate-cache-repo.ts` (per-pair history, binary search); `fx-rates-schema.ts`.
- `apps/worker/src/handlers/fx-history-backfill.ts`, `fx-daily-fetch.ts`, `fx-pairs-sql.ts` — coverage and which pairs are refreshed.
- `packages/budgeting/src/application/compute-budget-wealth-now.ts` — `sumWalletsToCurrency`, the existing per-row conversion helper.

### Aggregations that sum converted cents raw (must change)

- `packages/budgeting/src/adapters/persistence/transaction-repo.ts` (spendByDayForMonth, spendByCategoryForMonth, spendByCategoryByMonth)
- `packages/budgeting/src/application/get-spendings-summary.ts`
- `packages/budgeting/src/adapters/persistence/reserve-event-loader-repo.ts`, `domain/reserve-engine.ts`, `reserve-fit-repo.ts`
- `packages/budgeting/src/adapters/persistence/overview-repo.ts`, `budget-home-summary-repo.ts`
- `packages/budgeting/src/application/compute-cashflow-projection.ts`, `compute-scheduled-monthly.ts`
- `packages/budgeting/src/application/get-cushion-summary.ts`, `recompute-income-under-planned-task.ts`
- `packages/budgeting/src/application/get-overview-wealth.ts`, `get-all-budgets-aggregate.ts`
- `packages/budgeting/src/adapters/persistence/reserves-summary-repo.ts` (D-14 bug)
- `apps/api/src/routes/transactions.ts` (~365: labels converted amounts with the CURRENT budget currency)

### Categories, limits, reserves

- `packages/budgeting/src/adapters/persistence/categories-schema.ts`, `category-limits-schema.ts`, `category-limit-repo.ts` (effectiveForMonth ignores currency), `apps/api/src/routes/categories.ts`, `category-limits.ts`, `packages/budgeting/src/contracts/api.ts`, `domain/category.ts`, `application/create-category.ts`
- `apps/web/src/components/budgeting/category-slider.tsx` (the live add/edit form), `transaction-slider.tsx`, `quick-entry-input.tsx`, `spendings-grid/foreign-amount.tsx`
- `packages/budgeting/src/application/recompute-reserve-topup-task.ts`, `get-reserve-positions.ts`, `update-wallet.ts`, `apps/web/src/components/budgeting/wallets-tab/wallet-row.tsx`

### Budget currency UI

- `apps/web/src/components/settings/budget-identity-section.tsx`, `apps/api/src/routes/budget-identity.ts`, `packages/tenancy/src/adapters/persistence/workspace-repo.ts` (`hasTransactions`)

### Project rules

- `CLAUDE.md` — TDD-first, Money via Dinero/big.js, no float money, Drizzle only in adapters, append-only ledger, E2E as Gherkin + Page Objects, test against https://budget-dev.madonzy.com.
- Memory: `project_reserves_rewrite_model.md` (per-category depleting reserve, replay on read), `project_reserve_topup_task_freshness.md`, `project_wealth_cost_basis.md`, `project_avg_cost_rates.md`, `project_drizzle_journal_registration.md`, `project_migration_rls_data_loss.md`.

</canonical_refs>

<specifics>
## Specific Ideas

- Message format for the reserve task: "Top up 120 PLN and 15 EUR"; equivalent in brackets when the currency has no wallet: "15 EUR (≈ 64 PLN)".
- After a change of budget currency PLN → EUR, a PLN transaction of 100 shows as "100 zł" in the grid, while category and month totals are in EUR at each transaction's own date's rate.

</specifics>

<deferred>
## Deferred Ideas

- Cross-rate fallback through a third currency for pairs with no history.
- Currencies beyond the 8 with FX history.

</deferred>

---

_Phase: 14-multi-currency-budgets_
_Context gathered: 2026-11-03 from conversation decisions_
