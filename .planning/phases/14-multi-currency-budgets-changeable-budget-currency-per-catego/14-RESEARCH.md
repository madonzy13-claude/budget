# Phase 14: Multi-currency budgets - Research

**Researched:** 2026-11-03
**Domain:** Multi-currency money re-expression over an append-ish Postgres ledger (Bun/Hono/Drizzle, RLS), reserve engine, tasks, web
**Confidence:** HIGH on codebase facts (all grep/DB verified this session), MEDIUM on reserve-per-currency settlement design (semantics of D-11/D-12 need one user confirmation, see Open Questions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: The owner can change the budget currency at any time, including after transactions exist. Both locks go: the route guard (`apps/api/src/routes/budget-identity.ts` `currency_locked` 409) and the Better Auth org path (`packages/tenancy/src/adapters/persistence/better-auth-org.ts`). The stale "immutable via trigger" comment in the tenancy schema is corrected.
- D-02: After a change, ALL amounts are shown in the new currency, converted at historical rates (each amount at its own date's rate). No total may mix currencies.
- D-03: Transactions never change currency on their own. A transaction entered in the old budget currency keeps its original amount and currency and renders with its currency suffix — the same way foreign-currency transactions render today (`FxAmount`). To change a transaction's currency, the user edits that transaction.
- D-04: Each spending category has a currency. At creation it defaults to the budget currency of that moment.
- D-05: A plain transaction entered in a category takes that category's currency by default (quick entry and the transaction slider default to the category's currency, not the budget's).
- D-06: On a budget currency change, existing categories keep their currency; categories created afterwards default to the new budget currency.
- D-07: A category's currency can be changed after it has transactions. Its LIMIT converts at today's rate (e.g. 1000 PLN → ~233 EUR). Its existing transactions keep their own currency and simply show it as a suffix; new transactions default to the new currency.
- D-08: When a category's currency differs from the budget currency, its limit counts toward budget totals, plans and reserves at: the CURRENT month: the latest available rate; a PAST month: the last rate available within that month (frozen — past months never move).
- D-09: Reserve wallets can be in any currency (unlock: `wallet-row.tsx` `isReserveSection` read-only currency; `update-wallet.ts` `reserve_currency_mismatch`; any equivalent check on create).
- D-10: The reserve need is per currency: each category's reserve is held in that category's currency, so the total need is one amount per currency.
- D-11: Reserve wallets in a currency cover that currency's need first (so FX moves do not touch it). Only the remainder is converted at today's rate and covered by / counted against wallets in other currencies.
- D-12: The reserve message and the RESERVE_TOPUP / withdraw task state the shortfall or surplus per currency, e.g. "Top up 120 PLN and 15 EUR". Where a currency has no wallet of its own, show the equivalent in the covering wallet's currency: "15 EUR (≈ 64 PLN)".
- D-13: Single-currency reserves stay allowed; FX moves will raise top-up/withdraw tasks more often, which the user accepts. If a tolerance already exists before a task fires, reuse it; otherwise propose one.
- D-14: Existing bug fixed in this phase: the reserve-wallet total (`reserves-summary-repo.ts`) sums RESERVE wallets across currencies with no FX.

### Claude's Discretion
- Strategy for re-expressing stored amounts (read-time vs converted column; prefer read-time or derived cache over rewriting ledger rows).
- Whether category limits get a real per-category currency column or reuse `category_limits.normal_currency` / `cushion_currency`.
- How wealth snapshots and investment history are re-expressed.
- Behaviour when an FX rate is missing: never fail a whole summary; fall back to the most recent prior rate and mark it stale.
- A tolerance for reserve tasks driven by FX noise (D-13).
- Migration of existing data: every existing category gets the budget's current currency.

### Deferred Ideas (OUT OF SCOPE)
- Cross-rate fallback through a third currency for pairs with no history.
- Currencies beyond the 8 with FX history (USD EUR PLN GBP UAH CHF NOK SEK).
- New FX providers; changing how investments themselves are priced.
</user_constraints>

<phase_requirements>
## Phase Requirements

No REQ-IDs mapped. Decisions D-01..D-14 are the contract; each is mapped to a test in Validation Architecture.
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- TDD red -> green -> refactor; failing test BEFORE implementation (backend loops + routes too). Claude runs `make test` / E2E itself before asking the user.
- Money via Dinero/big.js, never float; `Money` converts to `{amount_cents BIGINT, currency CHAR(3)}` only at adapter boundary. Drizzle/SQL ONLY in `src/<context>/adapters/persistence/` (several application files already hold raw SQL via `tx.execute`; follow the nearest precedent, do not widen it).
- Integration tests: real Postgres, no DB mocks. E2E = Gherkin `.feature` + Page Objects + fresh user (`createFreshUser`), base URL `https://budget-dev.madonzy.com`, never localhost. 80% domain coverage in bunfig, do not lower.
- Hand-authored migration SQL MUST be registered in `drizzle/meta/_journal.json` (next idx 104, `when` > 1783730000000). Grants on `expense_ledger` belong in `apps/migrator/post-migration.sql` (REVOKE there wipes column grants every migrate). Beware FORCE RLS on a JOINed table silently dropping INSERTs in migrations.
- api/web/worker run from prebuilt images: rebuild + restart (`make restart-<svc>` under infisical) before saying done; verify the SERVED bundle. New i18n keys in en/pl/uk JSON need a web rebuild.
- Run plans INLINE (memory: gsd-executor subagents cap ~50k). Never `git push` unasked. Never say "draft" to users (use "unconfirmed scheduled payment").
- typescript pinned 5.9.3, next 16.4.2, better-auth 1.7.15: do not bump.
- Held-back / forbidden: no float money, no moment/dayjs (Temporal), no Prisma.

## Summary

The ledger already stores everything needed for read-time conversion: `currency_original`, `amount_original_cents`, `transaction_date`. `amount_converted_cents` is ONLY "original converted into the budget currency at write time" with no column saying which currency, so after a budget-currency change every `SUM(amount_converted_cents)` (about 20 sites, listed below) silently mixes currencies. The ledger is NOT strictly append-only: `app_role` has column UPDATE on `amount_converted_cents, fx_rate, fx_as_of, currency_original, amount_original_cents...` (post-migration.sql:706-715) and `worker_role` on the converted trio (migration 0100); only `id/tenant_id/budget_id/created_at` are immutable. Rewriting converted amounts on a currency change is therefore *possible* but wrong: it destroys history on a second change (A -> B -> A) and cannot serve per-category currency.

**Recommendation (Q1): read-time conversion inside Postgres** through one `STABLE` SQL function `budgeting.fx_convert(cents bigint, from text, to text, on_date date) RETURNS bigint` over `budgeting.fx_rates` (PK index `(base, quote, date)`, no RLS, SELECT already granted to app_role/worker_role). Measured on the biggest dev budget (862 rows; 547,233 fx rows, 57 pairs, ~9.6k rows/pair, jit off): 671 rows grouped by category/month in **23 ms** with an index-backed scalar subquery. SAME query without a cast: **78.9 s** (seq scan of 548k rows x 671 loops) because `fx_rates.base/quote` are `char(3)` and `currency_original` is `text`, so `base = l.currency_original` becomes `(base)::text = ...` and cannot use the index. Cast the text side to `bpchar`. This is the single most dangerous trap in the phase. Keep writing `amount_converted_cents` on create/edit (column is NOT NULL, workers write it) but make NO read path trust it; enforce with an architecture grep-guard test.

Limits need no new currency column for per-month semantics: `category_limits.normal_currency/cushion_currency` ARE populated (route fills them from budget default at write; 0 rows today differ from the budget currency) and the SCD-2 segment model carries the currency per month. `needs_amount/wants_amount` belong to `normal_currency`; `cushion_amount` and the legacy `cushion_amount_cents` belong to `cushion_currency`. Add ONE new column, `categories.currency`, as the "default for new transactions / current currency" and the target of the reserve engine. Reserves: the engine already works per category in plain bigint cents, so make the loader hand it each category's amounts in that category's CURRENT currency, and change only the result aggregation (`internalCents` -> per-currency map) plus a new pure `settleReserveByCurrency` function (D-11) and a multi-line task payload (D-12). No tolerance exists today (`surplus === 0n` exact compare); own-currency lines are FX-free so need none, only the cross-currency remainder gets a dead-band (proposal below).

**Primary recommendation:** Land in this order, lock removal LAST: (0) RED tests + migration 0104 (`categories.currency`, `category_reserve_adjustments.currency`, `fx_convert()`), (1) category currency, (2) read-time conversion at every aggregation site behind an architecture guard, (3) per-currency reserves/tasks/wallet unlock, (4) category-currency change + web defaults, (5) remove both currency locks + re-express wallet snapshots + cache bust. Removing the locks before (2) would let users change currency into mixed totals.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Convert ledger amounts to a target currency at date | Database (SQL fn over fx_rates) | API (FxRateCacheRepo for TS paths) | Sums must stay in SQL; fx_rates is tiny reference data with a PK index |
| Convert limits (D-08 rate date) | Database (same fn, rate date = LEAST(month_end, today)) | API app layer for engine inputs | Limits are SCD-2 rows read in SQL already |
| Per-category reserve (category currency) | API domain (reserve-engine, bigint cents) | DB loader | Engine is pure; loader supplies single-currency inputs per category |
| Cross-currency reserve settlement (D-11) | API domain (new pure fn) | — | Pure, unit-testable, uses today's rate |
| Reserve task payload/message | API (task repo payload) | Browser (task-banner-row formatting, i18n) | Payload carries structured per-currency lines; web formats with Intl |
| Budget currency change | API route (owner-only) + tenancy repo | Browser (settings form), worker (snapshots keep old currency) | Same route, lock removed; side effects: recompute tasks, cache bust |
| FX coverage for new pairs | Worker (fx-pairs-sql 8x8 cross join) | — | Already covers every pair among the 8 currencies; no change |
| Transaction suffix rendering (D-03) | Browser (`FxAmount`) | API list route sets `currencyConverted` | Already renders foreign rows; only the label currency source changes |

## Standard Stack

No new packages. Everything exists: Drizzle `sql` tag, big.js, Dinero via `Money`, pg, bun:test, Vitest, Playwright + playwright-bdd. `Intl.ListFormat` (built in) for "A and B" task copy in en/pl/uk.

### Package Legitimacy Audit
No external packages are installed by this phase. slopcheck not applicable. **Packages removed: none. Flagged: none.**

## Architecture Patterns

### System Architecture Diagram

```
 transaction entry (quick-entry / slider)         budget currency PATCH (owner)
   default ccy = category.currency (D-05)           remove locks (D-01) -> updateIdentity
        |                                                 |
        v                                                 v
 expense_ledger  --- currency_original, amount_original_cents, transaction_date (immutable truth)
 (amount_converted_cents kept, NOT read)           tenancy.budgets.default_currency  (target)
        |                                                 |
        +---------------+---- target ccy (budget | category) ----+
                        v
          budgeting.fx_convert(cents, from, to, on_date)  --> budgeting.fx_rates (PK base,quote,date)
                        |   (prior-rate fallback, NULL if none -> row skipped + flag)
   +--------------------+-----------------------------+------------------------------+
   v                    v                             v                              v
 spend per day/cat/month  limits per month        wallets/snapshots              reserve loader
 (budget ccy)             fx_convert(limit,        (convert per row,             spend -> category ccy,
 [spendings, overview,    segment_ccy, budget,     snapshot.currency ->          limits -> category ccy
  home, cashflow, ...]    LEAST(month_end,today))  current budget, at date)      adjustments -> category ccy
                                                                                      |
                                                                          reserve-engine (unchanged math)
                                                                                      |
                                                                  need[ccy] per currency  +  wallets[ccy]
                                                                                      v
                                                                  settleReserveByCurrency (D-11, today's rate)
                                                                                      v
                                                  RESERVE_TOPUP payload.lines[] (D-12) -> task-banner-row (Intl.ListFormat)
```

### Recommended structure (additions only)
```
drizzle/0104_multi_currency.sql            # categories.currency + backfill, adjustments.currency + backfill, fx_convert()
packages/budgeting/src/domain/reserve-settle.ts          # pure settleReserveByCurrency (D-11/12/13)
packages/budgeting/src/adapters/persistence/fx-sql.ts    # exported SQL fragments: fxConvert(), limitRateDate()
packages/budgeting/test/ledger/read-time-conversion.test.ts
apps/api/test/architecture/no-raw-converted-sum.test.ts  # grep guard
apps/web/e2e/features/multi-currency.feature (+ page objects/steps)
```

### Pattern 1: SQL conversion function (the one place rounding lives)
```sql
-- 0104. LANGUAGE sql so the planner can inline; STABLE (reads fx_rates).
CREATE OR REPLACE FUNCTION budgeting.fx_convert(cents bigint, src text, dst text, on_date date)
RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN src = dst THEN cents
    ELSE round(cents * COALESCE(
      (SELECT r.rate FROM budgeting.fx_rates r
        WHERE r.base = src::bpchar AND r.quote = dst::bpchar AND r.date <= on_date
        ORDER BY r.date DESC LIMIT 1),                       -- most recent prior == cache-only provider
      (SELECT r.rate FROM budgeting.fx_rates r
        WHERE r.base = src::bpchar AND r.quote = dst::bpchar
        ORDER BY r.date ASC LIMIT 1)))::bigint               -- rates start 2000-01-01; only pre-2000 or unknown pair hits this
  END $$;
```
`round(numeric)` is half-away-from-zero, identical to `new Big(x).times(rate).round(0)` (big.js ROUND_HALF_UP = away from zero) used by create-transaction.ts:138, so refunds (negative) match too. NULL result (no pair at all) must be handled by the caller: `COALESCE(SUM(...),0)` skips the row; surface `fx_unavailable` the way `get-all-budgets-aggregate.ts` already does. Do NOT fabricate rate 1 (CacheOnlyFxProvider header: "a silent 1 books a foreign amount at par, a bug this codebase has already paid for once"). [VERIFIED: EXPLAIN ANALYZE on dev DB, 2026-11-03]

### Pattern 2: D-08 limit rate date
`rate_date = LEAST(month_end, :today)` where `:today` is a bound parameter from `serverNow()` (NOT `current_date`; the gated test clock lives in `serverNow()`, `reserve-event-loader-repo.ts` already uses it). Current month: latest rate <= today. Past month: latest rate <= that month's last day = "last rate available within that month", frozen. Future months (projection): today's rate. [VERIFIED: matches the fn's `date <= on_date` semantics]

### Pattern 3: reserve engine stays single-currency per category
Loader converts per category into the category's CURRENT `categories.currency`: spend at each tx date; limit segments from segment currency at that month's D-08 date; adjustments from their own `currency` at `occurred_at::date`. Engine math untouched. Only `internalCents` aggregation changes to `Map<currency, bigint>` (`reserve-engine.ts:441-451`, `ReservePositionsResult`). `setUserDefined` event likewise carries `Map<currency,bigint>` (D-14), `surplus` becomes per currency.

### Anti-Patterns to Avoid
- **Rewriting `amount_converted_cents` on a currency change** (UPDATE grant exists, tempting): lossy on A->B->A, races with workers, cannot serve category currency. Do not.
- **Caching converted cents per (row,target)**: 23 ms for the largest budget; a cache adds invalidation for no gain.
- **`base = l.currency_original` without `::bpchar`**: 79 s instead of 23 ms.
- **`current_date` inside SQL for D-08**: breaks the test clock; pass `today` as a parameter.
- **Converting a total instead of each row**: D-02 requires each amount at its OWN date's rate.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ledger row conversion | per-site rate lookups / TS loops over rows | `budgeting.fx_convert()` | one rounding rule, one fallback, index-backed |
| TS conversion of wallets/incomes/limits already in memory | new converter | `sumWalletsToCurrency` (`compute-budget-wealth-now.ts:100`) + `CacheOnlyFxProvider` | exists, binary search in memory (`fx-rate-cache-repo.ts`) |
| Rate fallback/stale | custom | `CacheOnlyFxProvider.rateAsOf` / SQL fn prior-rate | same semantics both sides |
| Month SCD-2 limit resolution | new query | `category-limit-repo.effectiveForMonths` (extend to return currency) | one query for all months, RLS-safe |
| Localized "A and B" | string concat | `Intl.ListFormat` per locale | pl/uk conjunctions differ |
| Money math | float | big.js / bigint cents | CLAUDE.md |

## Runtime State Inventory (budget currency change is a migration of meaning)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `expense_ledger.amount_converted_cents/fx_rate` (budget-at-write currency, no ccy column); `budget_wealth_snapshots` (cap/inv/cost cents + `currency`, one per capture); `investment_history.*_budget_cents + budget_currency`; `category_limits.*_currency` (budget-at-write); `category_reserve_adjustments.delta_cents` (NO currency, budget-at-write); `tasks.payload_json.currency` (RESERVE_TOPUP etc.) | Ledger: none (read-time). Snapshots: convert on read per row (`currency` col exists). Investment history: already converts when `budget_currency` differs (`history-queries.ts:127-140`), reuse. Limits: segment currency already stored; backfill nothing. Adjustments: ADD `currency` column, backfill = budget default. Task payload: recompute task right after change |
| Live service config | none (FX rates are currency-pair data, independent of budget currency) | none |
| OS-registered state | none | none |
| Secrets/env vars | none | none |
| Build artifacts | web SW precache / persisted react-query cache hold old-currency JSON; api/web/worker prebuilt images | web: query-key invalidate for the budget on currency change + `make build-web`/`build-api` + restart; SW is cache-first (see Pitfall 6) |

Verified this session on dev DB: 0 limit rows, 0 RESERVE wallets, 0 snapshot rows whose currency differs from their budget's `default_currency`, so "all existing categories get the budget's current currency" is a consistent backfill. Re-run these three counts inside the migration test (they are cheap guards).

## Common Pitfalls

### Pitfall 1: char(3) vs text index defeat
**What goes wrong:** conversion subquery seq-scans `fx_rates` (547k rows) per ledger row: 78.9 s measured.
**Why:** `fx_rates.base/quote` are `char(3)`; `currency_original` is `text`.
**How to avoid:** cast `::bpchar` on the text side (inside `fx_convert`). Plan a perf test: largest fixture, assert < 500 ms (as `app_role`, RLS GUCs set, per CLAUDE.md perf note).

### Pitfall 2: a missed `SUM(amount_converted_cents)` mixes currencies silently
**How to avoid:** architecture test (see Validation) that fails if any non-allowlisted file under `packages/*/src` / `apps/*/src` references `amount_converted_cents` outside INSERT/UPDATE column lists. Allowlist: create/edit/materialise/worker writers, `expense-ledger-draft-schema.ts`.

### Pitfall 3: D-08 vs overspend noise
Spend converted at each tx date, limit at one month rate, so a category at 100% of its PLN limit can read slightly over/under in EUR. Accepted by D-08; the category-currency view (reserve engine) is exact. Do not "fix" with a per-month rate for spend.

### Pitfall 4: `serverNow()` vs `current_date`
D-08 "current month" must use the test-clock-aware now. Bind `today`.

### Pitfall 5: `expense_ledger` column grants
New ledger columns are NOT needed (read-time). If a plan adds one anyway, `post-migration.sql` REVOKE re-runs every migrate and wipes it; re-grant in post-migration.sql, not only the numbered file. `category_reserve_adjustments` is INSERT-only for app_role (table-level INSERT covers a new column; give it a DEFAULT so existing INSERT statements keep working until updated).

### Pitfall 6: stale cache after a currency change
Web has persisted query cache + cache-first Serwist routes (memory: cache-first nav, SW server-data routes). After PATCH default_currency the client must invalidate every budget-scoped query (summary, spendings, overview, wealth, reserves, tasks). Add a Vitest test for the settings mutation's `onSuccess` and an E2E that reloads offline-first and still shows the new currency.

### Pitfall 7: reserve-wallet fixture assumptions
`update-wallet.ts:89-93` blocks RESERVE currency != budget. Any other code that assumes `wallets.currency == budget` for RESERVE wallets (reserves-summary-repo, cashflow-projection wallet sums at `compute-cashflow-projection.ts:249`) must convert. Grep `wallet_type = 'RESERVE'` once more during implementation.

### Pitfall 8: stale test
`packages/budgeting/test/ledger/edit-transaction-currency-lock.test.ts` describes a "lock to budget currency" behaviour that R6 (edit-transaction.ts ~135, "row keeps the currency and amount it was paid in") superseded. Check whether it is skipped/red before relying on it; D-03 needs the R6 behaviour.

## Question-by-question findings (file:line verified)

### Q1 Conversion strategy
- Schema: `expense-ledger-draft-schema.ts:44-60` columns; no converted-currency column. `packages/platform/src/db/expense-ledger.ts` stale (confirmed per CONTEXT; do not touch).
- Append-only reality: `post-migration.sql:15-17` revokes UPDATE/DELETE then `:706-715` grants column UPDATE to app_role (incl. amount_converted_cents); `0100` + `:714` to worker_role (converted trio + deferred_at). So conversion columns are updatable but must not be the mechanism.
- Size: max 862 ledger rows/budget (6,458 total in dev); fx_rates 547,233 rows, 57 pairs. `FxRateCacheRepo` loads a whole pair (<=~10k rows) once and binary-searches in memory (`fx-rate-cache-repo.ts:63-98`, TTL 60 s, 64 pairs max) so TS paths are cheap too.
- Rate semantics parity: `CacheOnlyFxProvider` = exact date else most-recent prior (stale) else throw. SQL fn `date <= on_date ORDER BY date DESC LIMIT 1` is the same.
- **Recommendation:** SQL `fx_convert()`; every ledger-reading query projects `fx_convert(l.amount_original_cents, l.currency_original, <target>, l.transaction_date)`. Parity gate: on dev DB, for budgets whose currency never changed, `SUM(fx_convert(...))` must equal `SUM(amount_converted_cents)` within the small set of rows whose write-time rate was a stale fallback; assert exact equality on a fixture and report the dev-DB delta in the plan summary.

Aggregation sites and the change (all `[VERIFIED: grep amount_converted_cents]`):

| Site | Today | Change |
|------|-------|--------|
| `transaction-repo.ts` spendByDayForMonth (~408), spendByCategoryForMonth (~445), spendByCategoryByMonth (~488) | SUM(converted) | `SUM(fx_convert(..., budgetCcy, date))`; ByMonth gets a `target: 'budget' \| 'category'` option (category = JOIN categories.currency) for the reserve loader |
| `transaction-repo.ts` list/get/search (~74,130,330, `search-transactions.ts`) | returns stored converted + route labels with CURRENT budget ccy (`routes/transactions.ts:~365`, `getBudgetCurrency`) | project fx_convert into `amount_converted_cents` and keep `currencyConverted = current budget ccy`; `FxAmount` already shows original+suffix when `currencyOriginal != currencyConverted` (D-03 free) |
| `get-spendings-summary.ts` | spend via repo, limits via `effectiveForMonth` | limits converted per D-08; engine overspend (category ccy) converted to budget ccy at month rate for display |
| `overview-repo.ts` :58-63, :240-245 (+limits LATERAL :150-180) | SUM(converted), `cl.normal_amount` raw | fx_convert on spend and on `cl.normal_amount/cushion_amount/needs_amount` using `cl.normal_currency`/`cushion_currency`, rate date `LEAST(cm.month_end, :today)` |
| `budget-home-summary-repo.ts` :97, :160, limits :62/:177 | same | same |
| `compute-cashflow-projection.ts` :294, :323 (+limits :287, wallets :249) | SUM(converted) | same; comment :583 "no FX" becomes false |
| `compute-scheduled-monthly.ts` :63 | SUM(converted) | fx_convert |
| `get-cushion-summary.ts` (~:129 limits, converted ~?) | cushion_amount raw | convert by `cushion_currency` at D-08 date |
| `recompute-income-under-planned-task.ts` :260-268 | Σ normal_amount over today's limits | convert per row at today's rate |
| `reserve-fit-repo.ts` :129-270 (ranking by converted, sums) | stored converted | fx_convert (budget ccy; it is a budget-level chart) |
| `reserve-event-loader-repo.ts` + `reserves-summary-repo.ts` | see Q3 | see Q3 |
| `get-overview-planned.ts`, `get-overview-overspent.ts`, `get-all-budgets-aggregate.ts` | comments claim "no FX" | inputs now correct; aggregate already FX-converts budget -> display ccy; fix comments |
| `get-overview-wealth.ts` + `wealth-snapshot-repo.ts` | snapshots in capture-time ccy | see Q4 |
| `compute-upcoming-by-category.ts`, scheduled engine | already FX-convert per rule currency | target currency = budget; no change besides per-category display |
| `budget-template-repo.ts` :207-242 | writes limits with currency | fill currency from category.currency |
| `category-repo.ts:540` purge list | n/a | n/a |

### Q2 Limits
- `category_limits.normal_currency/cushion_currency` NOT NULL, populated by `routes/category-limits.ts:37-64` (fallback = workspace `default_currency`), written by `category-limit-repo.ts:86-122,245-269`, selected by effective lookups, but `effectiveForMonths` consumers (reserve loader, spendings summary) read only amounts, so currency is ignored on read. Dev data: 0 mismatches vs budget.
- Per-month model exists: SCD-2 (`effective_from/to`, advisory lock per category, `setLimit` is MONTH-scoped: shrink/resume/insert). `needs_amount/wants_amount` sum to `normal_amount` => `normal_currency`. `cushion_amount_cents` is the legacy parallel column => `cushion_currency`.
- **Recommendation:** reuse the existing currency columns for per-month truth (no limit-table schema change), add `categories.currency` for "current". Extend `CategoryLimitRepo.effectiveForMonths` row to `{planned, cushion, noLimit, normalCurrency, cushionCurrency}` and convert in the loader/summary with D-08. On category currency change (D-07) add a repo method that converts the segment covering the current month and all FUTURE segments to the new currency at today's rate in one tx (existing `setLimit` is single-month, so reusing it per month would leave later segments in the old currency); past segments untouched (their old currency + month-last rate = frozen D-08 for free).
- Every `setLimit` caller must now pass `category.currency` (route fallback changes from workspace currency to category currency).

### Q3 Reserve engine
- `reserve-engine.ts`: per category fold over events in bigint cents (`:99-135,298-311,441-451`); `internalCents` = Σ R over active categories; `surplus = userDefined - internal`. Currency-agnostic already.
- Loader (`reserve-event-loader-repo.ts:101-262`) composes `spendByCategoryByMonth`, `effectiveForMonths`, `sumReserveWalletAmounts` (cross-currency bug D-14: `reserves-summary-repo.ts:19-26` sums `current_balance*100` for ALL RESERVE wallets), adjustments, category flags (add `currency`).
- Tolerance today: NONE. `recompute-reserve-topup-task.ts:112` `if (surplus === 0n) resolve`; any non-zero emits. Emit upserts payload in place (`task-repo.ts:264-286`, partial unique index on budget_id). Triggers: set-wallet-balance, update-wallet, adjust-category-reserve, archive-category, create-transaction, edit, confirm-draft, set-category-limit, toggle-budget-mode, plus the HOURLY reconciliation sweep (header lines 11-17) which will pick up FX drift.
- Payload today `{shortfall_cents, direction, currency}` (`ports/task-repo.ts:62-68`). Web: `task-banner-row.tsx:70-93` formats `shortfall_cents` with `payload.currency`; i18n `tasks...` keys in `apps/web/messages/{en,pl,uk}.json` ("Top up reserve by {amount}", "Reserve has {amount} extra", ~:1999-2003).
- **Recommendation (D-10..D-13):**
  1. Loader supplies single-currency inputs per category (Pattern 3); adjustments get `currency` (migration 0104, backfill budget default).
  2. `ReservePositionsResult` gains `needByCurrency`, `walletsByCurrency`, `settlement`; keep `internalCents/userDefinedCents/surplusCents/direction` as budget-currency totals (each need converted at today's rate) so existing readers (aggregate, cashflow, push) keep compiling.
  3. New pure `settleReserveByCurrency({need, wallets, rate(from,to), budgetCcy, tolerance})`: `d[c] = wallets[c] - need[c]`; own-currency first (D-11, FX-free); then net remaining shortages against surpluses of OTHER currencies at today's rate; per-currency output lines `{currency, cents, direction}`; for a short currency with no own RESERVE wallet attach `equiv: {currency: coveringWalletCcy, cents}` (D-12 "15 EUR (≈ 64 PLN)"; covering wallet = largest RESERVE wallet balance, ASSUMED).
  4. Payload: `{shortfall_cents, direction, currency, lines: [{currency, shortfall_cents, direction, equiv?}]}`. Legacy trio kept so old clients/push do not break. Refresh by existing upsert.
  5. Tolerance (D-13): own-currency lines exact (no FX noise, no tolerance). Only the cross-currency REMAINDER (converted) is suppressed when `< max(1 whole unit of budget ccy, 0.5% of total need)` [ASSUMED values, flag to user]. Hourly sweep re-evaluates, no hysteresis needed.
  6. Unlock D-09: delete the `reserve_currency_mismatch` guard (`update-wallet.ts:89-93`), make the currency cell editable in `wallet-row.tsx:785-798` (drop the `isReserveSection` read-only branch + the `currencyReadOnlyAria` i18n key usage), check create-wallet path (no equivalent guard found by grep, verify). Wallet currency change must call `recomputeReserveTopupTask` (already listed for update-wallet).
  7. Web: reserves-table rows show each category's reserve in ITS currency; footer totals (`reserves-totals-footer.tsx`) one line per currency (+ budget-currency equivalent); task copy via `Intl.ListFormat`.

### Q4 Wealth snapshots / investment history
- `budget_wealth_snapshots` (`budget-wealth-snapshots-schema.ts:32-44`): `capitalization_cents`, `investment_value_cents`, `investment_cost_basis_cents`, `currency` (NOT NULL) per row. `get-overview-wealth.ts:17-18` states "No FX in this service". `seriesForRange/openingBefore` (`wealth-snapshot-repo.ts:44-82`) used only by overview-wealth (+ one test).
- **Recommendation:** pass `targetCurrency` into `seriesForRange/openingBefore` and project `fx_convert(x, s.currency, :target, s.captured_at::date)` for all three amount columns (nullable cost basis stays NULL). New captures keep being written in the new budget currency (worker unchanged). Update the "no FX" comment. A->B->A is lossless because stored amounts are never rewritten.
- `investment_history`: `history-queries.ts:127-140` already converts `realizedBudgetCents/soldCostBudgetCents` from `row.budgetCurrency` to the current budget currency at the sale date, skipping rows on missing rate. Lines ~46-51 do the same for the asset valuation rows. No change beyond a regression test.
- `get-all-budgets-aggregate.ts`: converts each budget's figures from `default_currency` to the user's display currency; correct as long as per-budget inputs are in `default_currency` (which Q1/Q4 guarantee). Add a test with one budget that changed currency.

### Q5 Category currency
- Schema: `categories` has no currency (`categories-schema.ts`); add `currency char(3) NOT NULL` in 0104 with a 3-step migration: ADD nullable, `UPDATE ... SET currency = b.default_currency FROM tenancy.budgets b WHERE b.id = categories.tenant_id` (tenant_id = budget id throughout), then SET NOT NULL. Beware FORCE RLS: `categories` has tenant policy; migration runs as migrator/postgres-owner role, verify rows actually updated (`SELECT count(*) WHERE currency IS NULL` must be 0 afterwards) per memory `project_migration_rls_data_loss`. Register in `_journal.json` (idx 104).
- Domain/contracts: `domain/category.ts`, `application/create-category.ts` (default = budget currency at creation, D-04), `contracts/api.ts:142-160` (`createCategorySchema` optional `currency`, `updateCategorySchema` `currency`), `routes/categories.ts` DTO returns `currency`. Validate against the 8-currency set (reuse the picker list constant; do not accept arbitrary `^[A-Z]{3}$`, FX has no pairs for others).
- Web: `category-slider.tsx` is the live add/edit form (CategoryEditForm/FormSheet DEAD per memory); add a currency picker (reuse `CurrencyPicker`) that appears for add + edit; edit triggers the D-07 limit conversion and shows the converted preview. `transaction-slider.tsx:209,252` default `currencyOrig` from `budgetCurrency` -> `category.currency`; `quick-entry-input.tsx` (spendings-grid) likewise; server default in `create-transaction.ts:101` `?? budgetCurrency` -> category currency fallback.
- D-06 is free: categories already store their own currency; only creation default reads the budget's current currency.

### Q6 Locks and FX coverage
- Route lock: `budget-identity.ts` PATCH (~:195-200) `hasTransactions -> 409 currency_locked`; also catch-block `/immutable|locked|constraint/` (~:108 in the sibling snippet) maps errors to `currency_locked`. Remove both.
- Better Auth lock: `better-auth-org.ts:14-53` `assertCurrencyChangeAllowed`, hook `beforeUpdateOrganization` (~:100-136). Remove the check (hook may stay as a no-op or be deleted); update/delete `packages/tenancy/test/default-currency-immutable.test.ts`.
- No DB trigger exists (`post-migration.sql` has no default_currency trigger); the comment `tenancy/.../schema.ts:30` "immutable via post-migration trigger" is stale: fix (D-01).
- Web: `budget-identity-section.tsx:24,34,78,145-150` (`hasTransactions` read-only branch, `currency_locked` toast), `settings-tab-client.tsx:46-75`, `settings-accordion.tsx:60,149,200`, `lib/settings-progress.ts:23` (that one is a progress item "has a transaction", unrelated: keep the field). Keep `hasTransactions` in the API response (settings progress uses it); only stop gating the currency select. Remove `currency_locked_tooltip` usage; i18n keys can stay or be pruned in en/pl/uk together.
- Add server validation: `default_currency` must be one of the 8 (today only `^[A-Z]{3}$` at `tenancy/schema.ts:46` and `budgets.ts`).
- Post-change side effects in the PATCH handler (precedent: "budgets PATCH route (default_currency change -> income FX baseline)" in `recompute-income-under-planned-task.ts:30`): recompute INCOME_UNDER_PLANNED, RESERVE_TOPUP (payload.currency), cushion task; run inside/after `updateIdentity`.
- FX coverage: `fx-pairs-sql.ts` unions ledger->budget, wallet->budget AND a CROSS JOIN of all 8x8 currencies, so any new budget-currency pair is already fetched (verified dev DB: 7 bases -> PLN, 9,632 rows each, max date today). History backfill covers 8 currencies from 2000-01-01 (`FX_HISTORY_FROM`). **No worker change.** Out-of-8 currency is rejected by the new validation (deferred: cross-rate).

### Q7 Test landscape
- Backend: `packages/budgeting/test/{adapters,application,ledger,overview,reserves,tasks}`; DB-backed with `DATABASE_URL_APP` swapping `@db:` -> `@localhost:` (see `reserve-event-loader-repo.test.ts:14-24`), run via `make test` = `infisical run ... bun test --timeout 120000 packages apps/api/test tests` (infisical required; if down use `docker compose exec db psql` fallback for reads, memory `project_infisical_down_db_workaround`). API routes: `apps/api/test/routes/{budget-identity,categories,category-limits,transactions,reserves,reserves-adjust,reserve-fit,...}.test.ts` (every route needs >=1 integration test). FX: `cache-only-fx-provider.test.ts`, `fx-rate-cache-*.test.ts`, `apps/api/test/.../fx*.test.ts`. Architecture tests: `apps/api/test/architecture/` (dep-cruiser test is the pattern for the new grep guard).
- Web: Vitest (`cd apps/web && bunx vitest run`), component tests for category-slider, transaction-slider, task-banner-row, wallet-row, budget-identity-section.
- E2E: `apps/web/e2e/features/*.feature` + `steps/` + `page-objects/` (existing: `reserves.feature`, `reserve-rebalance.feature`, `tasks.feature` with `@tasks-redesign`, `wallet-currency-gap.feature`, `spendings.feature`, `editable-dots.feature`, `category-usage-spent.feature`). New `multi-currency.feature`. Seeding: tasks.steps.ts builds payloads directly (shortfallCents), extend for `lines`. FX in E2E: seed `fx_rates` (worker role, exact UTC date) per memory `project_e2e_fx_cache_live_api`.
- Minimal "no total mixes currencies" fixture: ONE budget in PLN with category Food (PLN) limit 1000 PLN, tx A 100 PLN on D1, tx B 10 EUR on D2 (seed fx_rates PLN->EUR and EUR->PLN at D1, D2, and a later date with DIFFERENT rates so ordering errors show). Then PATCH budget currency to EUR. Expected: category spend EUR = round(100*PLNEUR@D1) + 10 (not 110, not 100*rate@today); the list shows A as "100 zł" and B as "10 €"; month total is in EUR; flipping back to PLN restores the original exact PLN total (lossless). Add a USD wallet + snapshot row for wealth.

### Q8 Slicing, dependencies, risk

| Plan | Contents | Depends on | Notes |
|------|----------|-----------|-------|
| 14-00 | RED tests: fx_convert fn + perf, architecture guard, migration backfill counts; migration 0104 (+journal, post-migration if any grant), `fx-sql.ts` helpers | — | Wave 0 |
| 14-01 | `categories.currency` end-to-end backend (domain, create, contracts, routes, template apply, limit routes use category ccy) + `effectiveForMonths` returns currency (D-04, D-06) | 14-00 | |
| 14-02 | Ledger read-time conversion: transaction-repo (+list/search/route label), spendings-summary, overview-repo, home-summary, scheduled-monthly (D-02, D-03, D-08 for limits there) | 14-00,01 | parity test vs stored |
| 14-03 | Remaining aggregation sites: cashflow, cushion, income-under-planned, reserve-fit, template, aggregate comments; wealth snapshots re-expression (Q4) | 14-02 | guard test goes GREEN here |
| 14-04 | Reserves per currency: loader (category ccy), adjustments.currency, `settleReserveByCurrency`, payload lines, summary-repo by-currency (D-14), wallet unlock D-09, web task copy + reserves tab (D-09..D-13) | 14-01,14-02 | riskiest |
| 14-05 | Category currency change D-07 (limit conversion method) + web defaults D-05 (quick entry, slider, category slider) + FxAmount suffix E2E (D-03/05/07) | 14-01,14-02,14-04 (reserve recompute) | |
| 14-06 | Remove both locks, 8-currency validation, post-change recompute + client cache invalidation, settings UI, stale-comment fixes, E2E full path (D-01, D-02) | ALL above | MUST be last |

Riskiest: (1) missed aggregation site (mitigated by guard test); (2) `char(3)` cast perf trap; (3) reserve engine adjustments/limits across a category currency change; (4) D-07 multi-segment limit conversion; (5) task payload/UI for N currencies in 3 locales; (6) cache-first client showing old currency; (7) D-08 `today` bound param vs test clock.

## Code Examples

### SQL fragment helper (adapter-only)
```typescript
// packages/budgeting/src/adapters/persistence/fx-sql.ts
import { sql } from "drizzle-orm";
export const fxConvert = (
  cents: ReturnType<typeof sql>, src: ReturnType<typeof sql>,
  dst: ReturnType<typeof sql>, onDate: ReturnType<typeof sql>,
) => sql`budgeting.fx_convert(${cents}, ${src}, ${dst}, ${onDate})`;

// spend in the budget's current currency, each row at its own date's rate (D-02)
sql`SELECT category_id::text,
           to_char(transaction_date,'YYYY-MM') AS month,
           COALESCE(SUM(budgeting.fx_convert(amount_original_cents, currency_original,
                        ${budgetCcy}, transaction_date)),0)::text AS spent_cents
      FROM budgeting.expense_ledger
     WHERE tenant_id = ${tenantId}::uuid AND budget_id = ${budgetId}::uuid
       AND kind='SPENDING' AND confirmed_at IS NOT NULL AND deleted_at IS NULL
     GROUP BY 1,2`
```
Note: `budgetCcy` is read from `tenancy.budgets.default_currency` in the same tx (RLS GUC set by `withTenantTx`), never from the client.

### Limit with D-08 rate date
```typescript
sql`budgeting.fx_convert(cl.normal_amount, cl.normal_currency, ${budgetCcy},
                         LEAST(cm.month_end, ${today}::date))`
```

### Architecture guard
```typescript
// apps/api/test/architecture/no-raw-converted-sum.test.ts
// walk packages/*/src + apps/*/src, fail on /amount_converted_cents/ outside ALLOWLIST
// (writers: create/edit/materialise/scheduled-engine/draft repos, drafts schema, demo manifest/refresh)
```

## State of the Art

| Old | New | Impact |
|-----|-----|--------|
| `amount_converted_cents` = budget ccy at write | read-time `fx_convert` from original | budget ccy becomes a pure view setting |
| Single reserve number | per-currency need + settlement | tasks may carry several lines |
| Budget currency immutable after 1st tx | mutable | locks + stale comments removed |

**Deprecated/outdated:** `packages/platform/src/db/expense-ledger.ts` (stale column names, do not trust); "No FX on this path" comments in overview/planned/overspent/reserve-fit/wealth services; trigger comment in tenancy schema.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Covering wallet for "equiv" in D-12 = largest RESERVE wallet balance | Q3 | message shows a different currency than the user expects |
| A2 | Cross-currency remainder dead-band `max(1 unit, 0.5% of total need)` | Q3 | too many / too few tasks (user accepted more tasks, so low risk) |
| A3 | After a category currency change the engine expresses that category's whole history in the NEW currency (past spend at tx date, past limits at month-last rate, adjustments at their date) | Pattern 3 | R of a changed category differs slightly from a "frozen in old currency" reading |
| A4 | Greedy netting order of cross-currency shortages vs surpluses (by largest first) | Q3 | which currency line shrinks first; totals identical |
| A5 | Keep writing `amount_converted_cents` on create/edit (unchanged) | Q1 | none functionally; removing needs a NOT NULL change |
| A6 | Missing-rate rows are skipped in SUMs and flagged `fx_unavailable` (not failed) | Pattern 1 | understatement on a pair with no history (only possible outside the 8) |

## Open Questions

1. **D-11/D-12 netting semantics.** If PLN need 1000 vs PLN wallets 1200 (surplus 200 PLN) and EUR need 100 vs EUR wallets 80 (short 20 EUR): is the user told "Top up 20 EUR" or "nothing, the PLN surplus covers it" (D-11 "only the remainder is converted and covered by wallets in other currencies" reads as the latter, task resolves or shows the residual)? Recommendation: implement netting (matches D-11 text), cover with a golden test, ask user to confirm during plan review.
2. **Reserves tab layout** for categories in several currencies (per-row own currency + per-currency footer): confirm via UI-phase / quick user check; backend does not block on it.
3. **Past reserve history after D-07** (A3) is an engine-level approximation; confirm acceptable.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Postgres (docker `db`) | integration tests, EXPLAIN | yes | running, jit off | testcontainers |
| infisical | `make test`, restart-*, E2E | not probed (needed by Makefile) | - | `docker compose exec db psql -U postgres -d budget` for reads (memory) |
| bun / vitest / playwright | tests | project standard | per repo | - |

Missing blocking: none known. Rebuild api/web/worker images (`make build-api`, `make build-web`) to see changes; `TRACING_ENV` rule applies to any new recreating target (not expected).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (backend), Vitest 4 + happy-dom (web), Playwright-BDD (E2E) |
| Config | `bunfig.toml`, `apps/web/vitest.config.*`, `apps/web/playwright.config.ts` |
| Quick run | `infisical run --env=dev -- bun test packages/budgeting/test/ledger packages/budgeting/test/reserves` ; web: `cd apps/web && bunx vitest run <file>` |
| Full suite | `make test` ; `cd apps/web && bunx vitest run` ; `make test-e2e` ; `make ci-gate` |

### Phase Decisions -> Test Map

| Decision | Behavior | Type | Test (new file) | Command / note |
|----------|----------|------|-----------------|----------------|
| D-01 | PATCH default_currency 200 for owner with transactions; 403 non-owner; 422 for non-8 ccy; no `currency_locked`; better-auth hook allows | API integration | `apps/api/test/routes/budget-identity.test.ts` (update) + `packages/tenancy/test/default-currency-mutable.test.ts` (replaces `default-currency-immutable.test.ts`) | red first: current test asserts 409 |
| D-02 | The minimal fixture above: totals in new ccy at each row's own-date rate; flip back restores exact original; guard test finds no raw SUM | DB integration + architecture | `packages/budgeting/test/ledger/read-time-conversion.test.ts`, `apps/api/test/architecture/no-raw-converted-sum.test.ts`, `packages/budgeting/test/adapters/fx-convert-fn.test.ts` (parity with Big rounding incl. negatives, prior-rate fallback, char(3) index use via EXPLAIN/timing) | per-site: spendings summary, overview, home, cashflow, scheduled-monthly, cushion, reserve-fit |
| D-03 | list returns original amount/currency + `currencyConverted=current budget ccy`; row not mutated by the currency PATCH (SELECT unchanged) | API integration + Vitest | `apps/api/test/routes/transactions.test.ts` (add), `apps/web/test/foreign-amount.test.tsx` | ledger row bytes identical before/after PATCH |
| D-04 | create category defaults to budget ccy; explicit valid ccy accepted; non-8 rejected | API integration + unit | `apps/api/test/routes/categories.test.ts`, `packages/budgeting/test/application/create-category-currency.test.ts` | |
| D-05 | tx create without currency uses category ccy (server); slider/quick-entry default to category ccy | unit + Vitest + E2E | `create-transaction-category-currency.test.ts`, `apps/web/test/transaction-slider-default-currency.test.tsx`, `multi-currency.feature` scenario "quick entry in a EUR category" | |
| D-06 | after budget ccy change, existing categories unchanged, new category gets new ccy | API integration | `categories.test.ts` | |
| D-07 | category ccy change converts current+future limit segments at today's rate, past segments untouched, existing tx untouched, new tx default new ccy | DB integration + E2E | `packages/budgeting/test/application/change-category-currency.test.ts`, `multi-currency.feature` | 1000 PLN -> round(1000*rate) |
| D-08 | limit in other ccy: current month uses latest rate, past month last rate within that month, month never moves when later rates arrive | DB integration | `packages/budgeting/test/overview/limit-rate-date.test.ts` (seed fx_rates across two months; add a later rate; assert past month unchanged; use test clock for today) | |
| D-09 | RESERVE wallet may be created/updated in any ccy; web currency cell editable | API integration + Vitest + E2E | `update-wallet-reserve-currency.test.ts`, `apps/web/test/wallet-row-reserve-currency.test.tsx` | red: current guard returns `reserve_currency_mismatch` |
| D-10 | needByCurrency has one amount per category ccy, each category's R in own ccy | unit (engine/loader) | `packages/budgeting/test/reserves/reserve-need-by-currency.test.ts` (golden: PLN cat + EUR cat) | |
| D-11 | settlement: own ccy first; remainder netted at today's rate; FX move changes only the cross remainder | pure unit | `packages/budgeting/test/domain/reserve-settle.test.ts` (property: totals conserved; own-ccy line independent of rate) | |
| D-12 | payload `lines[]` + `equiv`; banner text "Top up 120 zł and 15 €" (+ "(≈ 64 zł)") in en/pl/uk | unit + Vitest + E2E | `recompute-reserve-topup-multi.test.ts`, `apps/web/test/task-banner-row-lines.test.tsx`, `tasks.feature` new scenario seeded with `lines` | |
| D-13 | no task for sub-tolerance cross remainder; own-ccy exact gap still emits | unit | `reserve-settle.test.ts` tolerance cases | values ASSUMED (A2) |
| D-14 | wallets in two ccy: total = Σ converted (was raw sum) | DB integration | `packages/budgeting/test/adapters/reserves-summary-by-currency.test.ts` | red first: current sum adds 100 PLN + 100 EUR as 200 |

### Sampling Rate
- Per task commit: the specific new test file + `bun test packages/budgeting/test/ledger`.
- Per wave merge: `make test` + `cd apps/web && bunx vitest run`.
- Phase gate: `make test`, Vitest, `make test-e2e` (multi-currency + reserves + tasks + spendings features), `make ci-gate`, `bun audit --audit-level=high`, plus a served-bundle check after `make build-web && make restart-web`.

### Wave 0 Gaps
- [ ] `fx-convert-fn.test.ts`, `read-time-conversion.test.ts`, `no-raw-converted-sum.test.ts` (RED before 0104 exists)
- [ ] migration 0104 + `_journal.json` entry; backfill count assertions
- [ ] seed helper for `fx_rates` rows in budgeting tests (worker role, exact dates)
- [ ] `multi-currency.feature` + page object methods (budget currency select, category currency picker, reserve wallet currency)
- [ ] Update/replace `default-currency-immutable.test.ts` and the stale `edit-transaction-currency-lock.test.ts`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged) | Better Auth |
| V3 Session Management | no | - |
| V4 Access Control | yes | owner-only currency change (existing `touchesIdentity` gate), RLS `tenant_id = ANY(app.tenant_ids)` on categories/adjustments; `fx_convert` is SECURITY INVOKER over RLS-free reference data |
| V5 Input Validation | yes | Zod: currency enum of the 8 on budget PATCH, category create/update, wallet update; bigint-as-string DTOs |
| V6 Cryptography | no | - |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via currency/date strings | Tampering | bind parameters only (`${x}`), enum-validated currency; never `sql.raw` (the one existing `sql.raw(SET LOCAL app.tenant_ids)` in `hasTransactions` sanitises the uuid, and goes away with the lock) |
| Cross-tenant read through the new SQL fn | Information disclosure | fn touches only `fx_rates` (no tenant data); ledger queries keep `tenant_id` predicate + RLS; run `make ci-gate` |
| Non-owner changing currency | Elevation | existing 403 gate; add test |
| Float money / fabricated rate 1 | Tampering | numeric/bigint only; no silent rate 1 |
| Query params containing money in traces | Disclosure | unchanged (params never recorded) |

## Sources

### Primary (HIGH, verified in this session)
- Repo code: `expense-ledger-draft-schema.ts`, `post-migration.sql:15-20,700-715`, `drizzle/0100`, `fx-rate-cache-repo.ts`, `cache-only.ts`, `fx-pairs-sql.ts`, `category-limit-repo.ts`, `category-limits-schema.ts`, `routes/category-limits.ts`, `reserve-engine.ts`, `reserve-event-loader-repo.ts`, `reserves-summary-repo.ts`, `get-reserve-positions.ts`, `recompute-reserve-topup-task.ts`, `task-repo.ts`, `task-banner-row.tsx`, `update-wallet.ts`, `wallet-row.tsx`, `budget-identity.ts`, `better-auth-org.ts`, `tenancy schema.ts`, `history-queries.ts`, `get-overview-wealth.ts`, `wealth-snapshot-repo.ts`, `create-transaction.ts`, `transaction-repo.ts`, `overview-repo.ts`.
- Dev Postgres (`docker compose exec db psql`): row counts, `\d` of fx_rates/category_reserve_adjustments/categories, EXPLAIN ANALYZE of conversion (78.9 s without cast, 23.5 ms with `::bpchar`), mismatch counts (0/0/0).
- `/home/claude/budget/CLAUDE.md`, MEMORY.md index.

### Secondary / Tertiary
- None (no external libraries involved; no web research needed).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (no new packages; everything exists)
- Architecture (read-time SQL conversion, limits via existing columns): HIGH (measured)
- Reserve per-currency semantics: MEDIUM (A1-A4, Open Question 1)
- Pitfalls: HIGH (two measured, rest read from code)

**CONTEXT canonical_refs verification:** all listed files exist and claims held, with these corrections: (a) the ledger is not strictly append-only (column UPDATE grants exist); (b) `category_limits` currencies are populated (not ignored on write, only ignored on read); (c) `edit-transaction-currency-lock.test.ts` describes superseded behaviour; (d) `category_reserve_adjustments` has no currency column (not mentioned in CONTEXT, needed for D-10); (e) there is NO DB trigger behind the "immutable via trigger" comment.

**Research date:** 2026-11-03
**Valid until:** 2026-12-03 (repo moves fast; re-grep `amount_converted_cents` before planning wave 2)
