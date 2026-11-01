---
phase: 13-investments-type-based-groups-sell-convert-flow-realized-p-l
reviewed: 2026-10-26T00:00:00Z
depth: standard
files_reviewed: 50
files_reviewed_list:
  - apps/api/src/boot.ts
  - apps/api/src/routes/investments.ts
  - apps/migrator/post-migration.sql
  - apps/web/src/components/budgeting/wallets-tab/history-section.tsx
  - apps/web/src/components/budgeting/wallets-tab/holding-delete-confirm.tsx
  - apps/web/src/components/budgeting/wallets-tab/holding-sheet.tsx
  - apps/web/src/components/budgeting/wallets-tab/investment-row-sheet.tsx
  - apps/web/src/components/budgeting/wallets-tab/investment-row.tsx
  - apps/web/src/components/budgeting/wallets-tab/investment-type-header.tsx
  - apps/web/src/components/budgeting/wallets-tab/investments-section.tsx
  - apps/web/src/components/budgeting/wallets-tab/sell-sheet.tsx
  - apps/web/src/hooks/use-adjust-holding.ts
  - apps/web/src/hooks/use-create-holding.ts
  - apps/web/src/hooks/use-delete-holding.ts
  - apps/web/src/hooks/use-holding-history.ts
  - apps/web/src/hooks/use-investments.ts
  - apps/web/src/hooks/use-sell-holding.ts
  - apps/web/src/hooks/use-type-summary.ts
  - apps/web/src/hooks/use-update-holding.ts
  - apps/web/src/lib/investment-icons.ts
  - apps/web/src/lib/investment-type-groups.ts
  - apps/web/src/lib/investment-types.ts
  - apps/worker/src/worker.ts
  - drizzle/0087_investment_history.sql
  - packages/budgeting/src/application/get-overview-wealth.ts
  - packages/identity/src/adapters/persistence/better-auth.ts
  - packages/investments/src/adapters/persistence/history-repo.ts
  - packages/investments/src/adapters/persistence/history-schema.ts
  - packages/investments/src/adapters/persistence/holding-repo.ts
  - packages/investments/src/adapters/persistence/instrument-repo.ts
  - packages/investments/src/adapters/persistence/investments-schema.ts
  - packages/investments/src/application/adjust-holding.ts
  - packages/investments/src/application/create-holding.ts
  - packages/investments/src/application/history-queries.ts
  - packages/investments/src/application/list-holdings.ts
  - packages/investments/src/application/reverse-history-entry.ts
  - packages/investments/src/application/sell-holding.ts
  - packages/investments/src/application/update-holding.ts
  - packages/investments/src/contracts/api.ts
  - packages/investments/src/contracts/factory.ts
  - packages/investments/src/domain/contributions.ts
  - packages/investments/src/domain/holding.ts
  - packages/investments/src/domain/portfolio-metrics.ts
  - packages/investments/src/domain/sell-booking.ts
  - packages/investments/src/ports/history-repo.ts
  - packages/investments/src/ports/holding-repo.ts
  - packages/platform/src/demo/manifest.ts
  - packages/tenancy/src/adapters/persistence/schema.ts
findings:
  critical: 4
  warning: 10
  info: 6
  total: 20
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-10-26
**Depth:** standard
**Files Reviewed:** 50
**Status:** issues_found

## Summary

I reviewed the Phase 13 ledger: the sell, adjust, undo and delete use cases, the history repo, migration 0087, the Overview hybrid, and the web sheets and hooks. Tenant isolation holds. `withTenantTx` sets exactly one tenant, tenant equals budget, and every commit patch is scoped by `budget_id`. Bookings commit in one transaction.

The atomicity stops at the request boundary, though:

- The edit sheet fires a full-row PATCH and a ledger booking at the same time, and the two race.
- Deleting a holding computes several undo patches from the same stale state, so the last one overwrites the others.
- The DTO boundary accepts negative quantities and amounts on the new booking routes.
- Undoing a deposit sale checks the "latest entry" by effective date, but the restore is snapshot-based and depends on the order the sales were booked.

Each of these four can leave the holding row and the ledger out of step.

## Critical Issues

### CR-01: Edit sheet races a full-row PATCH against the ledger booking (lost update of cost/quantity)

**File:** `apps/web/src/components/budgeting/wallets-tab/holding-sheet.tsx:710-767`, `packages/investments/src/application/update-holding.ts:17-35,113-118`, `packages/investments/src/adapters/persistence/holding-repo.ts:141-152`
**Issue:** `handleSave` fires `updateMut.mutate(...)` (PATCH) and `adjustMut.mutate(...)` (POST /adjust, kinds buy/add/withdraw/value_change) at the same time, without awaiting either. `updateHolding` reads the row (`findById`) in one transaction. It then writes back the WHOLE row in another transaction (`buy_price_cents`, `quantity`, `current_price_cents` from `merged` = `input ?? current`). If the adjust commit lands between the PATCH's read and its write, the PATCH puts back the stale cost, quantity and value. The history entry stays live, so cost and contributions no longer match the holding. A later undo then subtracts deltas from the wrong base and can even throw `would_go_negative`. This breaks the "PATCH never changes cost/quantity" invariant. The `use_adjust` guard only compares against the value read in the same request, so it cannot catch this.
**Fix:** Do both fixes:

1. Sequence the calls on the client: `await updateMut.mutateAsync(...)`, then call adjust.
2. Stop the PATCH from writing ledger-owned columns at all:

```ts
// holding-repo.update: never touch buy_price_cents / quantity for non-possessions
UPDATE budgeting.investments SET name = ..., ui_type = ..., /* no buy_price_cents, quantity */
 current_price_cents = CASE WHEN ${patchHasCurrent} THEN ${...} ELSE current_price_cents END
```

Or do the read and the write in one transaction with `SELECT ... FOR UPDATE`.

### CR-02: deleteHolding overwrites patches when several conversions touch the same counterparty

**File:** `packages/investments/src/application/history-queries.ts:156-175`, `packages/investments/src/application/reverse-history-entry.ts:38-108`
**Issue:** For each transfer row of the deleted holding, `planLegUndo` re-reads the counterparty from the DB (`findById`) and returns an ABSOLUTE patch (`buyPriceCents`, `quantity`, `currentPriceCents`). Suppose holding H converted into D twice. That gives two patches for D, both computed from D's current state. `commit` applies them in order, so the second overwrites the first, and only one conversion is actually reversed. Both legs are soft-deleted anyway, so D keeps value and cost that no longer exist in the ledger. Repeated partial conversions (broker to Erste) are the documented real-data case. `createdByThis` also evaluates to false for each leg, because the other convert_in has a different transfer id, so a holding that was created by conversions is never deleted either.
**Fix:** Group legs by holding and fold their deltas into one patch: apply `reverseEntry` repeatedly on an in-memory copy of the holding. Then emit one patch, or delete the holding when nothing is left. Add a test: H→D twice, delete H, and assert D is restored or deleted.

### CR-03: Negative and zero quantities/amounts accepted on the booking routes and persisted

**File:** `packages/investments/src/contracts/api.ts:205,215-238`, `packages/investments/src/domain/sell-booking.ts:80-90`, `packages/investments/src/application/adjust-holding.ts:64-112`
**Issue:** `numericString` and `centsInput` only bound the magnitude (`Math.abs(n) <= 1e15`). As a result:

- `adjust{kind:"buy", addQuantity:"-0.5", paidCents:"-1000"}` reduces quantity and cost and books a negative contribution. That is a sale with no realized gain.
- An `addQuantity` equal to `-quantity` divides by zero in `buyMore`. Big throws a plain Error, so the route returns 500.
- `sell.destination.quantityBought` has the same problem.
- `adjust{kind:"value_change", newValueCents:"-5"}` stores a negative value.
- `adjust{kind:"withdraw"}.receivedCents` has no `> 0` refine, unlike `sellHoldingSchema`. A received amount of 0 or less makes `flowCents = -received` zero or positive, so a withdrawal RAISES contributions.

**Fix:** Add positive refinements at the boundary, and guard the domain functions:

```ts
const positiveNumeric = numericString.refine((v) => Number(v) > 0, "must_be_positive");
const nonNegCents = centsInput.refine((v) => /^\d+$/.test(String(v)), "cents_non_negative_int");
// buy: addQuantity: positiveNumeric, paidCents: nonNegCents
// existing: quantityBought: positiveNumeric.optional()
// withdraw: receivedCents: nonNegCents.refine(v => Number(v) > 0)
// value_change/add: newValueCents: nonNegCents
```

Also add `if (big(i.addQuantity).lte(0)) throw new RangeError("qty_out_of_range")` in `buyMore`.

### CR-04: Deposit sale undo restores a principal snapshot, but its "latest entry" guard orders by effective_date, not booking order

**File:** `packages/investments/src/application/reverse-history-entry.ts:53-63`, `packages/investments/src/adapters/persistence/history-repo.ts:216`, `packages/investments/src/application/sell-holding.ts:179-197`
**Issue:** A deposit partial sale stores `prior_principal` and `prior_start_date`, and undo restores them. That only works if no later booking has happened. The guard checks `live[live.length-1].id === leg.id`, but `listForHolding` sorts by `effective_date, created_at`. Effective dates are user-picked and may be backdated, so they don't reflect booking order. Example:

1. Sale A is booked with date 10-20. It restores to 100k from 01-01.
2. Sale B is booked afterwards with date 09-01. It is computed from A's result, 50k from 10-20.
3. A sorts last, so undoing A passes the guard. It restores 100k from 01-01 while B stays live.

The principal is now silently wrong, and B's realized gain and flow still count. Sale B also moves `deposit_start_date` back before the current start, which re-accrues interest that was already realized.
**Fix:** For the deposit guard, compare against the most recent booking by `created_at`, not by effective date (e.g. `live.reduce(max by createdAt)`). In `sellHolding`, reject deposit sales dated before `src.depositStartDate` with a RangeError, `before_deposit_start`.

## Warnings

### WR-01: Non-integer or exponent cents strings cause 500s via BigInt

**File:** `packages/investments/src/application/sell-holding.ts:144,176`, `packages/investments/src/application/adjust-holding.ts:66,96`
**Issue:** `centsInput` accepts `"12.5"` and `"1e3"`, because `Number()` is finite for both. `BigInt("12.5")` throws a SyntaxError, which is not a RangeError, so the route answers `serverError` (500) and sends noise to Sentry.
**Fix:** Validate cents as `/^-?\d+$/` (or `z.coerce.bigint()`) at the schema. Then catch SyntaxError and map it to 422.

### WR-02: Path ids are not validated as UUIDs, so a bad id gives a 500

**File:** `apps/api/src/routes/investments.ts:233,339-398`
**Issue:** `:id` and `:entryId` go straight into `${...}::uuid` casts. A malformed id raises a Postgres cast error and becomes a 500 instead of a 404 or 422.
**Fix:** Run `z.string().uuid().safeParse(c.req.param(...))` and return 404 when it fails.

### WR-03: Client and server disagree on shape and type key for holdings with null ui_type

**File:** `packages/investments/src/domain/holding.ts:53-72`, `apps/web/src/lib/investment-types.ts:160-206`, `packages/investments/src/adapters/persistence/history-repo.ts:231`, `packages/investments/src/domain/portfolio-metrics.ts`
**Issue:**

- **Shape:** the server's `isQuantityHolding(h.uiType)` sees null and returns false, so an `equities` holding with qty 1 is "amount". The web `holdingShape` derives "stocks" from `holdingType` and calls it "quantity". The sell sheet then sends `{quantity}` and gets `left_shape_mismatch`.
- **Type key:** realized is keyed `COALESCE(ui_type,'other')` on the server and by `deriveUiType` on the client, so the realized gain shows under the wrong header.

`createHoldingSchema` still allows `uiType` to be null, so new rows can hit this after migration 0087.
**Fix:** Use one derivation on both sides. Move `deriveUiType` into the shared contract and use it in `holdingShape`, `realizedByType` (or the use case) and `typeWeights`. Alternatively, make `uiType` required on create.

### WR-04: Web falls back to "PLN" for currency; server falls back to budget currency

**File:** `apps/web/src/components/budgeting/wallets-tab/sell-sheet.tsx:53-54`, `packages/investments/src/application/sell-holding.ts:128-129,264`
**Issue:** For a holding with no buy or price currency, the client shows and sends PLN, while the server uses `budgetCurrency`. For an "existing" destination this produces `currency_mismatch`, which the sheet shows only as the generic "errSave". For "out", it books realized at the PLN→budget rate on an amount that is really in budget currency.
**Fix:** Pass `budgetCurrency` into `ccyOf` on the client (`h.buyCurrency ?? h.currentPriceCurrency ?? budgetCurrency`). Map `currency_mismatch` to its own message.

### WR-05: Edit still allows changing buy currency or crossing shapes, which desyncs the ledger

**File:** `packages/investments/src/application/update-holding.ts:24-35`, `packages/investments/src/application/reverse-history-entry.ts:71-86`
**Issue:**

- **Buy currency:** the `use_adjust` guard blocks buy price and quantity, but PATCH can still change `buyCurrency`. That reinterprets the whole cost basis in another currency, while history `cost_currency`/`flow_currency` keep the old one.
- **Type change:** PATCH can change `uiType` from an amount type to a quantity type (e.g. broker to stocks). `holdingShape` then flips. Undoing an earlier withdraw (`valueDelta`, no `qtyDelta`) now runs the quantity branch, which ignores `valueDeltaCents`, so the value is never restored.

**Fix:** Refuse a `buyCurrency` change on non-possessions with `use_adjust`. Either refuse a `uiType` change that flips `holdingShape`, or store the shape on each history row and reverse with the stored shape.

### WR-06: Inline row value edit bypasses the ledger and the "what happened" choice

**File:** `apps/web/src/components/budgeting/wallets-tab/investments-section.tsx:193-200,497`
**Issue:** `saveInlineValue` PATCHes `currentPriceCents` directly. No `value_change` entry is written, and the user is never asked add/withdraw/value_change as D-03 requires. The History section silently misses value moves, and a real deposit or withdrawal typed inline never affects contributions or realized.
**Fix:** Route the inline edit through `useAdjustHolding` with `kind: "value_change"`, or open the edit sheet's "What happened?" step when the value changes.

### WR-07: A null flow currency silently disables the whole contributions history

**File:** `drizzle/0087_investment_history.sql:115-132`, `packages/investments/src/application/create-holding.ts` (entry with `flowCurrency: nh.buyCurrency`), `packages/investments/src/adapters/persistence/history-repo.ts:289-297`, `packages/investments/src/domain/contributions.ts:50-54`
**Issue:** Start, buy and add entries copy `buy_currency`, which can be NULL (`buyCurrency` is optional on create). `listFlows` then maps the currency to `""`. `rate("", ...)` rejects and becomes null, and `at()` returns null for every date on or after that entry. The Overview then quietly falls back to snapshot cost for every point, with no log.
**Fix:** Default flow and cost currency to the budget currency when writing (backfill: `COALESCE(i.buy_currency, i.current_price_currency, b.default_currency)`). In `contributions.ts`, log or skip unknown currencies instead of nulling the whole series.

### WR-08: Overview hybrid replaces accurate snapshot cost with backfilled Start approximations

**File:** `drizzle/0087_investment_history.sql:115-132`, `packages/budgeting/src/application/get-overview-wealth.ts:256-290`
**Issue:**

- **Cost:** the Start entry is dated at `created_at` but carries TODAY's cost.
- **Archived holdings:** they get no Start entry.
- **Boundary:** it is the earliest `created_at` of any active holding.

So right after migration, every past point since that date subtracts today's cost instead of the snapshot's stored `investment_cost_basis_cents`, and archived holdings' contributions are missing while their historic value is still counted. The "without contributions" line is distorted until the user backfills by hand (D-07). This literally follows D-08 and D-09, but it is a visible regression of existing data.
**Fix:** Either date backfilled Start entries at migration time (so the boundary is the migration date and snapshot cost covers the past), or start the hybrid at the first non-`start` entry. Confirm the choice with the user.

### WR-09: Optimistic overlay never clears after a failed reorder or type-order save

**File:** `apps/web/src/components/budgeting/wallets-tab/investments-section.tsx:163-176,339-363`
**Issue:** `committed` and `committedOrder` clear only once server data matches them. If `setOrderMut` or `reorderMut` fails, the hook rolls back the cache, but the overlay still overrides it. The UI keeps showing an order that was never saved until the component remounts.
**Fix:** Clear the overlay in the mutation's `onError`, e.g. `setOrderMut.mutate(next, { onError: () => setCommittedOrder(null) })`, and do the same for `reorderMut`.

### WR-10: One failed FX lookup turns the whole type summary into a 500

**File:** `packages/investments/src/application/history-queries.ts:76-96`
**Issue:** For rows booked under an older budget currency, `rateAsOf` is awaited inside the loop. One rejection fails the whole summary, so every header loses realized gain and the D-14 portfolio total breaks.
**Fix:** Catch per row. Skip or flag that row (e.g. a `stale: true` field) instead of failing the endpoint.

## Info

### IN-01: valueOf mutates the source Holding

**File:** `packages/investments/src/application/sell-holding.ts:115-125`
**Issue:** `valueOf` overwrites `h.currentPriceCents` and `h.currentPriceCurrency` on the shared object. That is harmless today, but it is a trap for any later reuse of `src` or `d`.
**Fix:** Compute into local variables and pass a copy to `holdingValue`.

### IN-02: Sell quantity rounding can sell everything and archive the holding

**File:** `packages/investments/src/application/sell-holding.ts:156-163`
**Issue:** `sellQty.toFixed(8)` rounds half-up. A `left` with more than 8 decimals (e.g. `0.000000004`) rounds the sell up to the full holding, which then gets archived.
**Fix:** Reject `left.quantity` with more than 8 decimals, or round `left` first and derive `sellQty` from the rounded value.

### IN-03: setTypeOrder builds the Postgres array literal by string join

**File:** `packages/investments/src/adapters/persistence/history-repo.ts:273`
**Issue:** `{${order.join(",")}}` is only safe because the route enum-validates the keys. A future caller passing free text could break the array literal.
**Fix:** Bind the values as an array parameter, e.g. `sql.join` into `ARRAY[...]::text[]`.

### IN-04: Undo rounds current_price_cents (numeric(24,6)) to whole cents

**File:** `packages/investments/src/application/reverse-history-entry.ts:72-75`
**Issue:** Undo loses sub-cent precision on amount holdings.
**Fix:** Do the arithmetic with Big on the numeric string.

### IN-05: Overview history dates use the UTC day, while entry dates are the user's local day

**File:** `packages/budgeting/src/application/get-overview-wealth.ts:257`
**Issue:** An entry dated "today" can be missing from a snapshot captured just after local midnight.
**Fix:** Use the user's timezone for `dayOf`, as `UserTimezoneProvider` does.

### IN-06: Saving the type order drops saved positions of hidden types

**File:** `apps/web/src/components/budgeting/wallets-tab/investments-section.tsx:339-345`
**Issue:** `moveTypeBlock(blocks.map(...))` saves only the types that are currently visible. A type hidden under D-14 loses its slot and comes back at the end of the list.
**Fix:** Merge the new order into the full saved `typeOrder`, keeping the unknown and hidden keys in place.

---

_Reviewed: 2026-10-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
