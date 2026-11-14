---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
reviewed: 2026-11-04T10:15:00Z
depth: standard
files_reviewed: 99
files_reviewed_list:
  - apps/api/src/boot.ts
  - apps/api/src/routes/budget-identity.ts
  - apps/api/src/routes/budgets.ts
  - apps/api/src/routes/categories.ts
  - apps/api/src/routes/category-limits.ts
  - apps/api/src/routes/convert-to-category-currency.ts
  - apps/api/src/routes/transactions.ts
  - apps/migrator/post-migration.sql
  - apps/web/src/components/budgeting/category-slider.tsx
  - apps/web/src/components/budgeting/charts/diverging-bar-chart.tsx
  - apps/web/src/components/budgeting/charts/pie-chart.tsx
  - apps/web/src/components/budgeting/overview/limit-rebalance.tsx
  - apps/web/src/components/budgeting/overview/overspent-reserves-section.tsx
  - apps/web/src/components/budgeting/overview/planned-section.tsx
  - apps/web/src/components/budgeting/overview/reserve-fit-view.tsx
  - apps/web/src/components/budgeting/overview/reserve-rebalance.tsx
  - apps/web/src/components/budgeting/reserves-tab/reserves-table-client.tsx
  - apps/web/src/components/budgeting/reserves-tab/reserves-table-row.tsx
  - apps/web/src/components/budgeting/reserves-tab/reserves-totals-footer.tsx
  - apps/web/src/components/budgeting/spendings-grid/category-column.tsx
  - apps/web/src/components/budgeting/spendings-grid/column-header.tsx
  - apps/web/src/components/budgeting/spendings-grid/foreign-amount.tsx
  - apps/web/src/components/budgeting/spendings-grid/quick-entry-input.tsx
  - apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx
  - apps/web/src/components/budgeting/task-banner-row.tsx
  - apps/web/src/components/budgeting/transaction-slider.tsx
  - apps/web/src/components/budgeting/wallets-tab/wallet-row.tsx
  - apps/web/src/components/budgeting/wallets-tab/wallets-sectioned-list.tsx
  - apps/web/src/components/settings/budget-identity-section.tsx
  - apps/web/src/hooks/use-overview-planned.ts
  - apps/web/src/hooks/use-reserve-fit.ts
  - apps/web/src/hooks/use-reserves-summary.ts
  - apps/web/src/hooks/use-set-category-limit.ts
  - apps/web/src/hooks/use-spendings-summary.ts
  - apps/web/src/hooks/use-update-reserve-adjustment.ts
  - apps/web/src/hooks/use-update-wallet.ts
  - apps/web/src/lib/offline-write.ts
  - apps/web/src/lib/reserve-fit-rows.ts
  - apps/web/src/lib/reserve-lines-format.ts
  - drizzle/0104_multi_currency.sql
  - drizzle/0105_limit_converted_from.sql
  - packages/budgeting/src/adapters/persistence/budget-home-summary-repo.ts
  - packages/budgeting/src/adapters/persistence/budget-template-repo.ts
  - packages/budgeting/src/adapters/persistence/categories-repo.ts
  - packages/budgeting/src/adapters/persistence/categories-schema.ts
  - packages/budgeting/src/adapters/persistence/category-limit-repo.ts
  - packages/budgeting/src/adapters/persistence/category-limits-schema.ts
  - packages/budgeting/src/adapters/persistence/category-repo.ts
  - packages/budgeting/src/adapters/persistence/category-reserve-adjustments-repo.ts
  - packages/budgeting/src/adapters/persistence/category-reserve-adjustments-schema.ts
  - packages/budgeting/src/adapters/persistence/fx-sql.ts
  - packages/budgeting/src/adapters/persistence/overview-repo.ts
  - packages/budgeting/src/adapters/persistence/reserve-event-loader-repo.ts
  - packages/budgeting/src/adapters/persistence/reserve-fit-repo.ts
  - packages/budgeting/src/adapters/persistence/reserves-summary-repo.ts
  - packages/budgeting/src/adapters/persistence/transaction-repo.ts
  - packages/budgeting/src/adapters/persistence/wealth-snapshot-repo.ts
  - packages/budgeting/src/application/archive-category.ts
  - packages/budgeting/src/application/change-category-currency.ts
  - packages/budgeting/src/application/compute-cashflow-projection.ts
  - packages/budgeting/src/application/compute-scheduled-monthly.ts
  - packages/budgeting/src/application/create-category.ts
  - packages/budgeting/src/application/create-transaction.ts
  - packages/budgeting/src/application/find-category-by-id.ts
  - packages/budgeting/src/application/get-cushion-summary.ts
  - packages/budgeting/src/application/get-overview-overspent.ts
  - packages/budgeting/src/application/get-overview-planned.ts
  - packages/budgeting/src/application/get-overview-wealth.ts
  - packages/budgeting/src/application/get-reserve-fit.ts
  - packages/budgeting/src/application/get-reserve-positions.ts
  - packages/budgeting/src/application/get-reserves-summary.ts
  - packages/budgeting/src/application/get-spendings-summary.ts
  - packages/budgeting/src/application/list-categories.ts
  - packages/budgeting/src/application/recompute-income-under-planned-task.ts
  - packages/budgeting/src/application/recompute-reserve-topup-task.ts
  - packages/budgeting/src/application/rename-category.ts
  - packages/budgeting/src/application/reserves-summary-builder.ts
  - packages/budgeting/src/application/unarchive-category.ts
  - packages/budgeting/src/application/update-wallet.ts
  - packages/budgeting/src/contracts/api.ts
  - packages/budgeting/src/contracts/factory.ts
  - packages/budgeting/src/domain/category.ts
  - packages/budgeting/src/domain/fx-round.ts
  - packages/budgeting/src/domain/reserve-engine.ts
  - packages/budgeting/src/domain/reserve-month-conversion.ts
  - packages/budgeting/src/domain/reserve-settle.ts
  - packages/budgeting/src/ports/budget-home-summary-repo.ts
  - packages/budgeting/src/ports/categories-repo.ts
  - packages/budgeting/src/ports/category-limit-repo.ts
  - packages/budgeting/src/ports/reserve-event-loader-repo.ts
  - packages/budgeting/src/ports/reserves-summary-repo.ts
  - packages/budgeting/src/ports/task-repo.ts
  - packages/budgeting/src/ports/transaction-repo.ts
  - packages/platform/src/demo/manifest.ts
  - packages/shared-kernel/src/money.ts
  - packages/tenancy/src/adapters/persistence/better-auth-org.ts
  - packages/tenancy/src/adapters/persistence/schema.ts
findings:
  critical: 3
  warning: 9
  info: 4
  total: 16
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-11-04T10:15:00Z
**Depth:** standard (Phase 14 diff hunks from `7e52639f^..HEAD`)
**Files Reviewed:** 99
**Status:** issues_found

## Summary

The core read-time FX design holds up. `budgeting.fx_convert` and `convertCents` agree (both round half away from zero, both use the same prior/earliest fallback). Every `sql` fragment in `fx-sql.ts` binds its values as parameters or `sql.identifier` (no injection). RLS is preserved: 0104 restores `FORCE RLS` after the backfill, and the trigger runs as the inserting role. The closed-month conversion (`reserve-month-conversion.ts`) and the per-currency settlement (`reserve-settle.ts`) were traced and are internally consistent.

The defects sit where two currencies meet: a limit row's own currency versus the category's current currency, and the per-category "own currency" second pass versus figures that are only ever in the budget currency. Three of them give wrong money, and one of those can corrupt stored limits through a normal edit.

No structural (fallow) findings were provided.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: A past month's limit is shown and re-saved under the category's NEW currency (silent relabel, PLN 200 becomes EUR 200)

**File:** `apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx:952-963`, `packages/budgeting/src/application/get-spendings-summary.ts:445-466`
**Issue:** After a category changes currency (say PLN to EUR this month), the segments for earlier months keep `normal_currency = PLN`. That is by design (D-07/D-17). `getSpendingsSummary` returns those amounts unconverted in `limitOriginal` and names their currency in `limitCurrency`. But:
1. `editCatInitial` prefills the slider from `limitOriginal` (PLN amounts) and sets `currency: cat.currency` (EUR). The slider then shows "€200". On save it POSTs `normalCurrency: currency` (EUR) with those amounts. From the viewed past month onward (carry-forward unless `singleMonth`), the stored limit is overwritten with the same number in a different currency. No FX is applied, so the stored money is wrong.
2. The grid's `own` column does the same arithmetic. It sets `o = limits.original` (PLN), then `oActive = o.planned` (PLN), `oSpent` (EUR, from `spendByCategoryForMonthInCategoryCurrency`) and `cell.overageCents` (EUR). It computes `balanceCents = oActive - oSpent + oUsed` across two currencies and labels the result `currency: catCcy` (EUR).

**Fix:** The editor must work in the limit's own currency, or the limit must be converted to the category currency first. Minimal fix:
```ts
// spendings-grid-client.tsx
currency: s?.limitCurrency ?? cat.currency ?? budgetCurrency,
```
In `get-spendings-summary.ts`, when `l.normalCurrency !== catCcy`, convert `limits.original` into `catCcy` at the D-08 rate date before building `own`. Add a reproducer test: change the currency, open the previous month, and assert that the prefill currency equals `limitCurrency` and that `own.plannedCents` is in `own.currency`.

### CR-02: The Smart Investments "own currency" figures mix currencies

**File:** `packages/budgeting/src/application/get-overview-planned.ts:551-600` (reached through the second pass at 971-993)
**Issue:** In the `inCategoryCurrency` pass, `plannedResolved` rows are each in their own category's currency, but `monthlyIncome` is still summed into `ccy` (the budget currency). `otherPlannedByMonth` then adds planned cents from PLN, EUR, USD categories into one bigint, and `computeInvestmentSmartLimit(income − Σ others)` subtracts that mixed sum from a budget-currency income. When the Investments category is in a foreign currency, its `own.planned_*` figures are this meaningless number, labelled in the Investments currency. They feed the Overview labels and the limit-rebalance dialog, which saves "as is".
**Fix:** In the per-category pass, compute the smart limit in the budget currency (first-pass value) and convert that single result to the Investments category currency at today's rate. Alternatively, never take `own` for a smart Investments row:
```ts
const o = row.currency !== ccy && !(investWindow?.investment_limit_mode === "smart" && row.category_id === investWindow.category_id)
  ? byId.get(row.category_id) : undefined;
```

### CR-03: The limit write path accepts any currency, independent of the category's currency

**File:** `apps/api/src/routes/category-limits.ts:40-47`, `packages/budgeting/src/contracts/api.ts:209-216`, `packages/budgeting/src/adapters/persistence/category-limit-repo.ts:121-129`
**Issue:** Phase 14 restricts budget and category currencies to `FIAT_CURRENCIES` because anything else "could never be converted". `setLimitSchema.normalCurrency/cushionCurrency` still accept `^[A-Z0-9]{3,5}$`, and the route uses a caller-supplied value verbatim. The two currencies can also differ from each other. Consequences:
- A limit in `BTC`, `XYZ` or another non-category currency returns `NULL` from `fx_convert`. Every read path wraps it in `COALESCE(..., 0)`, so the limit silently becomes 0 in the Overview, home and spendings views.
- `changeCategoryCurrency` then finds no rate for that source and returns `no_rate` forever, so the category's currency can never change again.
- `sourceOf()` converts `cushion_amount` using `normal_currency` only. A segment whose `cushion_currency` differs gets its cushion converted at the wrong pair.
**Fix:** In this phase's model a limit is in its category's currency. Ignore or reject a body currency that differs:
```ts
normalCurrency: z.enum(FIAT_CURRENCIES).optional(),
cushionCurrency: z.enum(FIAT_CURRENCIES).optional(),
// route: after resolving the category
if ((normalCurrency && normalCurrency !== cat.currency) || (cushionCurrency && cushionCurrency !== normalCurrency))
  return c.json({ error: "currency_mismatch" }, 422);
```
(Amounts sent in another currency already have `amountsCurrency`.)

## Warnings

### WR-01: A non-integer `expectedCents` crashes the reserve adjust route with a 500

**File:** `apps/api/src/routes/budgets.ts:535-537`
**Issue:** The conversion runs before zod validation. `expectedCents: 1.5` or `1e21` becomes `String(...)` = "1.5" / "1e+21", and `BigInt("1.5")` throws `SyntaxError`, which nothing catches. The result is an unhandled 500 instead of a 422.
**Fix:** Parse with `reserveAdjustmentSchema` first, then convert `parsed.data.expectedCents`. Or guard with `Number.isSafeInteger(adjustBody.expectedCents)`.

### WR-02: Changing a category's currency in the slider is not atomic with the limit write

**File:** `apps/web/src/components/budgeting/category-slider.tsx:507-570`
**Issue:** The slider commits `PATCH /currency` first (which converts limits server-side), then sends `PATCH` category plus `POST /limits` in parallel. If either of those fails, the user sees "save failed", but the currency and converted limits are already committed. Retrying from the reopened slider then starts from a different basis.
**Fix:** Do the currency change and the limit write in one server call (e.g. accept an optional limit body on `PATCH /currency`, all in one `withTenantTx`). At minimum, invalidate and refetch after a partial failure so the UI shows the real state.

### WR-03: Unconvertible ledger rows silently vanish from every total except reserves

**File:** `packages/budgeting/src/adapters/persistence/transaction-repo.ts:80-87` (`spendSum`), `overview-repo.ts`, `budget-home-summary-repo.ts`, `compute-cashflow-projection.ts`, `compute-scheduled-monthly.ts`; `packages/budgeting/src/application/create-transaction.ts:108`
**Issue:** A transaction currency is still validated only as `^[A-Z]{3}$`, not against `FIAT_CURRENCIES`. If write-time FX succeeds (e.g. JPY against the budget currency), the row is stored. After a later budget or category currency change with no history for that pair, `fx_convert` returns NULL, and `COALESCE(SUM(...),0)` drops the payment from the spend, overview, home summary, projection and scheduled averages with no signal to the user. Only the reserve loader sets `fxUnavailable`.
**Fix:** Restrict `currencyOriginal` to `FIAT_CURRENCIES` in `create-transaction` / update (same rule as categories). Expose an `fx_unavailable` count on the summary DTOs so a dropped row is visible.

### WR-04: The wealth chart plots a fabricated 0 when a snapshot's currency has no pair

**File:** `packages/budgeting/src/adapters/persistence/wealth-snapshot-repo.ts:54-55, 88-89`
**Issue:** `COALESCE(fx_convert(...), 0)` turns "cannot convert" into "wealth was 0 that day". The chart then shows a crash to zero, and the growth baseline (first real snapshot) can pick that 0.
**Fix:** Return NULL and filter such points out in `get-overview-wealth` (or skip rows where the conversion is NULL in SQL).

### WR-05: The reserve task can be emitted with `shortfall_cents: "0"`

**File:** `packages/budgeting/src/application/recompute-reserve-topup-task.ts:119-134`
**Issue:** When every imbalance is in an unconvertible currency, `settlement.direction === null` but `lines` is non-empty. The task is not resolved; it is emitted with `shortfall = |surplus| = 0` and a direction copied from `lines[0]`, even when the lines point in mixed directions. The user sees "Top up 0 zł". Separately, `internalCents` in `get-reserve-positions.ts:352-355` leaves out unconvertible currencies without setting `fxUnavailable`.
**Fix:** If `settlement.direction === null`, emit only when the lines carry their own amounts, and render from `lines`, not the legacy trio. Set `fxUnavailable` when `settlement.unconvertible.length > 0`.

### WR-06: Converting needs and wants separately breaks needs + wants = normal

**File:** `apps/api/src/routes/category-limits.ts:63-69`, `packages/budgeting/src/adapters/persistence/category-limit-repo.ts:157-163`
**Issue:** `normal`, `needs` and `wants` each go through `convertCents` with half-up rounding. `round(n·r) + round(w·r)` can differ from `round((n+w)·r)` by 1 cent, so the stored split no longer sums to the limit (the 0061 invariant). Charts that derive wants = planned − needs drift by a grosz.
**Fix:** Convert `normal` and `needs`, then set `wants = normal − needs`. Convert `cushion`, then clamp needs to it when the split is cushion-bound.

### WR-07: Unarchive falls back to the budget currency (or a hardcoded "EUR") instead of the category's

**File:** `packages/budgeting/src/application/unarchive-category.ts:90-97`
**Issue:** With no archive-month limit, the zero/restore segments are written in `budgetCurrencyOf()`, or "EUR" when that dep is missing. When the category has its own currency, the restored limit currency differs from the category currency (see CR-03). The restored archive-month limit also keeps its old currency, while the category may have changed since.
**Fix:** Use the category's current currency (`category.currency`) for the fallback. Convert a restored archive-month limit into it, or let `changeCategoryCurrency` semantics apply.

### WR-08: Different code paths pick "today" for FX differently

**File:** `apps/api/src/routes/convert-to-category-currency.ts:46`, `packages/budgeting/src/application/recompute-income-under-planned-task.ts:265`, `get-cushion-summary.ts:126`, `apps/web/src/components/budgeting/category-slider.tsx:346`
**Issue:** `fx-sql.ts` states that `today` is "ALWAYS ... serverNow() in the budget timezone". The converter uses `new Date()` (ignores the gated test clock). The income/cushion tasks use `Temporal.Now.plainDateISO()` (host timezone). The slider preview uses the UTC date. Around midnight, or under the test clock, the preview, the server conversion and the task totals use different rates, and the "converted back exactly" guarantee of 0105 can show a mismatch between preview and saved value.
**Fix:** Use `serverNow()` plus the budget timezone everywhere, and send `date` from the server (or omit it so `/fx/rate` resolves it the same way).

### WR-09: Migration 0104 does not check that existing limit rows match the category currency

**File:** `drizzle/0104_multi_currency.sql:37-41`
**Issue:** Before this phase, `category_limits.normal_currency/cushion_currency` were write-only metadata. The old route fell back to `"USD"` when the workspace lookup failed, and unarchive used `"EUR"`. Reads now convert from those columns, so any legacy row with a wrong currency is suddenly FX-converted (e.g. PLN 200 read as USD 200, about 800 PLN). The migration backfills `categories.currency` from the budget but never reconciles the limit rows. (The dev DB has 0 mismatched rows today, but other environments, demo seeds and restored backups are not guaranteed.)
**Fix:** In 0104 (or a follow-up), normalise: `UPDATE budgeting.category_limits cl SET normal_currency = c.currency, cushion_currency = c.currency FROM budgeting.categories c WHERE c.id = cl.category_id AND (cl.normal_currency <> c.currency OR cl.cushion_currency <> c.currency) AND converted_from IS NULL`. Or at least `RAISE NOTICE` the count.

## Info

### IN-01: The transaction list returns a stale `fx_rate` next to a re-expressed amount

**File:** `packages/budgeting/src/adapters/persistence/transaction-repo.ts:68-71`
**Issue:** `converted_cents` is now in the budget's current currency, but `fx_rate` is still the write-time rate into the old budget currency. Any consumer that shows "rate × original" will be inconsistent after a currency change.
**Fix:** Drop `fx_rate` from the read DTO, or compute the effective rate alongside `cv`.

### IN-02: The reserve loader keeps a dead dependency

**File:** `packages/budgeting/src/adapters/persistence/reserve-event-loader-repo.ts:78-80`
**Issue:** `transactionRepo` stays in the deps "for wiring compatibility" but is unused.
**Fix:** Remove it from `ReserveEventLoaderRepoDeps` and from boot wiring.

### IN-03: Adjustment dates are rendered in the DB session timezone, not the budget's

**File:** `packages/budgeting/src/adapters/persistence/reserve-event-loader-repo.ts:165-167`
**Issue:** `to_char(occurred_at, 'YYYY-MM-DD')` uses the session timezone (UTC). For a budget in UTC+2, an adjustment made just after local midnight converts at the previous day's rate (and lands in the previous month at month edges; the month part predates this phase).
**Fix:** `to_char(occurred_at AT TIME ZONE b.timezone, ...)`.

### IN-04: The API casts its deps with `as never`

**File:** `apps/api/src/routes/budgets.ts:528-533`, `apps/api/src/routes/category-limits.ts:54-59`
**Issue:** `deps.budgeting as never` disables type checking at the boundary. A renamed `fxProvider` or `findCategoryById` would compile and then fail at runtime.
**Fix:** Type `Deps` as `Pick<BootedDeps["budgeting"], "findCategoryById" | "fxProvider">`.

---

_Reviewed: 2026-11-04T10:15:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

## Fix status (14-24, 2026-11-04)

CR-01, CR-02, CR-03 and WR-01 to WR-09 are fixed with tests; see 14-24-SUMMARY.md. WR-02 got the minimum fix (refetch after a partial failure); a single atomic call is deferred. IN-01 to IN-04 are open.
