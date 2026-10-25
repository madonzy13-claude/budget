# Phase 13: Investments type groups, sell/convert, realized P/L, contributions history - Research

**Researched:** 2026-10-25
**Domain:** Investments bounded context (hexagonal TS/Bun, Drizzle+Postgres RLS) + Overview wealth contributions + wallets-tab web UI
**Confidence:** HIGH (all findings from reading this repo; no new libraries)

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** Withdraw is NOT its own swipe icon. Third destination inside Sell -> "Where did the money go?": New investment / Existing investment / **Out of investments**. Same "how much is left" + "amount received" steps. Row swipe actions stay Sell / Edit / Delete.
- **D-02** Withdrawal books like a sale: realized = received - cost of withdrawn part (stays in source type header); **contributions drop by the RECEIVED amount**.
- **D-03** Edit -> "Withdrew money" on hand-valued holding = shorthand for Sell -> Out of investments, same booking. Example: broker 96k / cost 55k, edit to 80k + "Withdrew money" -> cost -9.2k (55k x 16/96), realized +6.8k in Broker header, contributions -16k, row stays +75%. One booking rule, two entry points. ("Added money" raises cost and contributions by the amount.)
- **D-04** Withdrawn money does NOT flow into a budget wallet.
- **D-05** History = **History section inside the edit sheet**: dated list (Start, Bought/Added, Sold, Withdrew, Value changed, Converted in/out). No separate screen.
- **D-06** Every Sell / Add / Withdraw entry has a **date picker (default today, past allowed)**. Entries can be **deleted** (P/L, realized, contributions recompute); **no in-place editing**.
- **D-07** User backfills real history **in-app through normal flows with past dates**. No import script, no CSV.
- **D-08** Overview "without contributions" line is **hybrid**: from a budget's first history entry onward, each point's contributions computed from history entries up to that point's date. Points **before** the first history entry keep stored snapshot `investment_cost_basis_cents`. The synthetic proportional backfill of madonzy's snapshots from Oct 2023 must stay untouched.
- **D-09** Automatic **Start** entry is a normal deletable entry dated at holding's `created_at`, amount = current cost. Never auto-replaced.
- **D-10** **Merge equity + ETF into one `stocks` form type**; ticker search returns both; existing `equity`/`etf` rows migrate to `stocks`. One group per form type = 11 groups: stocks, crypto, treasury_bond, collectibles, real_estate, precious_metals, cash, savings, deposit, broker, other.
- **D-11** Legacy rows: reit -> stocks, etb -> treasury_bond, null ui_type -> derived from holding_type.
- **D-12** Groups draggable as blocks (order saved per budget). Holdings reorder only within their type; no cross-type drag.
- **D-13** Every type with holdings gets a header, even with one holding.
- **D-14** A type with realized gain but no holdings left is hidden. Its realized still counts in portfolio total and reappears on header if a holding of that type is added later.
- **D-15** Header shows **value . total P/L (unrealized + realized)**, realized as small sub-line ("incl. realized +28k"). Mobile tap sum-up shows the split.
- **D-16** Header **P/L % = total P/L / all cost ever put into the type** (cost held + cost of sold parts). Never / cost still held. Portfolio total uses same rule.
- **D-17** "Amount received" entered in **destination's currency**, prefilled with today's value of sold part at today's rate. For Out of investments defaults to source currency, switchable.
- **D-18** Realized gain stored in **budget currency, frozen at sale date**.
- **D-19** Contributions entries stored in **original currency**, **converted on read** with FX rate as of each chart point's date (historic `fx_rates`); live point uses today's rate.

### Claude's Discretion

- Cost-side FX rate for sold part (budget currency): keep realized consistent with how unrealized P/L is computed at sale, so selling a row at 0% books ~0 realized. Document rule.
- History entry kinds/labels, schema for history table, migration numbering, how portfolio total presents realized gain from hidden types.
- How "Converted in/out" entries pair source and destination.

### Deferred Ideas (OUT OF SCOPE)

- Withdraw directly into a budget wallet (auto-raise wallet balance).
- Not discussed, planner decides or raises: Delete when holding has history entries; Sell into existing holding of a different type; Change-type UX details; how realized gain appears on Overview cards.
  </user_constraints>

## Summary

All work is inside existing code: no new packages. Current model: `budgeting.investments` row = one holding with `group_name` (free text), `ui_type`, `holding_type`, `buy_price_cents`/`quantity`/`current_price_cents`, soft `archived_at`. `list-holdings` computes `costInBudgetCents` (buy_price x qty x current buy->budget rate) and value. Overview "without contributions" reads per-snapshot `investment_cost_basis_cents` (mig 0062), written by the 3h worker from `computeBudgetWealthNow` -> `holdingsValuation.investmentCostBasisCents` (boot.ts L456) = sum of `costInBudgetCents`. That is why selling A into B (24 Oct) jumps contributions: the new holding's full cost counts as new money and the sold holding's cost vanishes.

The fix is one new append-style table `budgeting.investment_history` (next migration **0087**) whose rows carry three independent quantities: a signed **external flow** (contributions, original currency), a **cost delta / sold cost** (for lifetime cost), and a frozen **realized gain** (budget currency). Contributions = sum of flows; converting between holdings writes flow 0 on both legs, which is the entire cure for the +275k jump. Booking math is pure (bigint/big.js) and is the TDD core.

**Primary recommendation:** Build in this order: (1) pure domain `sell-booking`/`contributions`/`type-group-pl` with fixtures from CONTEXT (TDD), (2) migration 0087 (history table + stocks merge + backfill Start rows), (3) repo+use-cases+routes (sell, add, value-change, delete-entry, history list, type-summary), (4) Overview hybrid contributions, (5) web: type groups, Sell sheet, edit "what happened", History section, group-order pref, (6) remove custom groups last, (7) E2E Gherkin + demo manifest.

## Architectural Responsibility Map

| Capability                                            | Primary Tier                                                                | Secondary                               | Rationale                                   |
| ----------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------- |
| Sell/withdraw/add booking math (cost split, realized) | API/Backend domain (`packages/investments/src/domain`)                      | -                                       | Money rules, pure, TDD; FX only via port    |
| History ledger persistence + backfill                 | Database + `adapters/persistence`                                           | -                                       | Drizzle only here; RLS tenant scoped        |
| Realized FX freeze at sale date                       | API application layer (FxProvider.rateAsOf at effective date)               | DB (stored)                             | D-18; CacheOnlyFxProvider reads `fx_rates`  |
| Contributions at chart point                          | `packages/budgeting` get-overview-wealth via new port                       | Investments adapter                     | D-08/D-19 per-point rate conversion on read |
| Type grouping, header math display                    | Browser (`lib/investment-grouping.ts` pure)                                 | API supplies realized/soldCost per type | UI pure helpers already Vitest-tested       |
| Type-group order                                      | Per-member `budget_members.ui_prefs` (existing PUT `/budgets/:id/ui-prefs`) | Browser                                 | No migration; Record<string,string[]> fits  |
| Sell/Edit flows, offline writes                       | Browser via `lib/offline-write.ts`                                          | API                                     | Project rule                                |

## Standard Stack

No new dependencies. Use what exists [VERIFIED: codebase]:

| Library                                       | Purpose                                                                              | Notes                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| big.js                                        | cost/realized math (already used in list-holdings/portfolio-metrics)                 | quantity numeric(28,8) as string                                             |
| bigint cents                                  | stored money                                                                         | `centsToMoney`/`moneyToCents` in compute-budget-wealth-now.ts reusable       |
| Drizzle schema + raw `sql` in repo            | persistence                                                                          | repo uses `tx.execute(sql...)`; schema file exists for types+RLS policy only |
| Zod v4                                        | contracts in `packages/investments/src/contracts/api.ts`                             |                                                                              |
| FxProvider (`CacheOnlyFxProvider` in API)     | `rateAsOf(from,to,date)` reads `budgeting.fx_rates`, falls back to most recent prior | historic per-date works; throws if no rate at all                            |
| TanStack Query hooks + `lib/offline-write.ts` | web writes                                                                           | keep holdings cache a plain `HoldingDto[]`                                   |
| bun:test / Vitest 4 / Playwright-bdd          | tests                                                                                | see Validation                                                               |

**Package Legitimacy Audit:** no external packages installed this phase. slopcheck not applicable. Removed: none. Flagged: none.

## Architecture Patterns

### System Architecture Diagram

```
UI (Sell sheet / Edit "what happened" / Add) --offline-write--> POST /budgets/:b/investments/:id/{sell|adjust}  (Zod)
        |                                                      |
        |                                       application: sellHolding / adjustHolding / deleteHistoryEntry
        |                                          |  1 load holding (+ FX rate asOf effective_date via FxProvider)
        |                                          |  2 PURE domain: splitSale(holding, keep, received) -> {newQty,newBuy,newCurrent,soldCost,realized,flow}
        |                                          |  3 ONE tx: update source holding, insert history rows (+ create/update dest holding for convert), shared transfer_id
        v                                          v
GET /investments (HoldingDto[] array, unchanged shape)     budgeting.investment_history (RLS, tenant_id)
GET /investments/type-summary  -> per ui_type {realizedBudgetCents, soldCostBudgetCents}  (reads history join holdings)
GET /investments/:id/history   -> entries for History section
        |
Overview: get-overview-wealth --(new port contributionsAsOf)--> history entries, convert each at rate(point date) -> value - contributions
          pre-first-entry points keep snapshot investment_cost_basis_cents (D-08 hybrid)
Worker 3h snapshot: unchanged (still stores Σ held cost as legacy fallback column)
```

### Recommended structure (additions)

```
packages/investments/src/domain/{sell-booking.ts, contributions.ts, type-group.ts}   # pure, TDD
packages/investments/src/ports/history-repo.ts
packages/investments/src/adapters/persistence/{history-repo.ts, history-schema.ts}
packages/investments/src/application/{sell-holding.ts, adjust-holding.ts, delete-history-entry.ts, list-history.ts, type-summary.ts}
drizzle/0087_investment_history.sql  (+ _journal.json idx 87, tag "0087_investment_history")
apps/migrator/post-migration.sql     # GRANT + FORCE RLS for new table (pattern at L779-792)
apps/web: sell-sheet.tsx, history-section.tsx, investment-type-header.tsx (replaces investment-group-header)
```

### History schema (recommended, resolves Discretion)

`budgeting.investment_history`:

- `id uuid pk`, `tenant_id`, `budget_id` (FK tenancy.budgets ON DELETE CASCADE), `holding_id uuid` (FK investments, no cascade; holdings are archived not deleted)
- `kind text CHECK IN ('start','add','sell','withdraw','value_change','convert_in','convert_out')`
- `effective_date date NOT NULL` (user picks; D-06), `created_at timestamptz`
- `qty_delta numeric(28,8)` (signed; null for amount holdings)
- `cost_delta_cents bigint` + `cost_currency char(3)`: signed change of the holding's held cost (buy ccy). Start/add +, sell/withdraw/convert_out -.
- `flow_cents bigint` + `flow_currency char(3)`: external contribution, signed, ORIGINAL currency (D-19). start/add +cost-or-amount; withdraw -received; **sell/convert_in/convert_out/value_change = 0**.
- `received_cents bigint` + `received_currency` (sell/withdraw/convert_in audit, D-17)
- `sold_cost_budget_cents bigint`, `realized_budget_cents bigint`, `budget_currency char(3)` (frozen at effective date, D-18; null otherwise)
- `transfer_id uuid` nullable: **pair convert legs with two rows sharing one `transfer_id`** (simpler queries, per-holding History list, each row RLS-scoped; deleting one leg must delete both -> delete by transfer_id).
- `deleted_at timestamptz` (soft delete keeps audit; every read filters `deleted_at IS NULL`). CLAUDE.md says append-only ledger; D-06 forces deletion, so soft-delete is the closest fit.
- Index `(budget_id, tenant_id, effective_date)` and `(holding_id)`.
- RLS: copy 0054 pattern exactly (ENABLE+FORCE RLS, policy `tenant_id = ANY(...app.tenant_ids)` to app_role, worker_role, GRANT). Put GRANT/FORCE in `apps/migrator/post-migration.sql`, policy in the SQL migration, and mirror with `pgPolicy` in the Drizzle schema file.

Type for a history row = **join to holding's current `ui_type`** (no denormalized type column). This makes "change type = correction keeps history" automatic and realized stays with the holding's type, including archived holdings.

### Booking rule (pure domain; the TDD core)

Two holding shapes:

- **Quantity holding** (tracked/metals/crypto: qty meaningful): sell `q` -> new qty = qty - q; buy price unchanged; sold cost = buy x q.
- **Amount holding** (qty = 1 manual: broker, savings, cash, other, collectibles, real_estate manual): keep value L of V -> f = L/V; new buy = buy x f; new current = L; sold cost = buy x (1-f). Fixture: 96k/55k keep 30k -> cost 17,187.5 (CONTEXT rounds to 17.2k), sold cost 37,812.5, received 66k -> realized +28,187.5 [CITED: 13-CONTEXT specifics].
- Edit "Withdrew money" = amount-holding sell with keep = new value, received = diff, flow = -received. Fixture 96k/55k -> 80k: cost 45,833.33, realized +6,833.33, flow -16k.
- Edit "Added money": buy += amount, current = new value, flow +amount, kind `add`.
- Edit "Value changed": only current price; kind `value_change`, all deltas 0.
- Sold completely: archive holding (existing `archived_at`) + sell entry; keep realized via history join.
- **Cost-side FX rule (recommended):** sold cost in budget ccy = soldCost(buy ccy) x rate(buyCcy->budgetCcy, as of effective_date); received in budget ccy = received x rate(receivedCcy->budgetCcy, as of effective_date). Both at the SAME date rate. For a same-day sale this equals list-holdings' current-rate cost, so a 0% row books ~0 realized; backdated sales stay frozen (D-18). Round once with big.js (banker's, existing global RM) to cents at the end.
- Convert (sell -> New/Existing investment): source `convert_out` row (realized, sold cost, flow 0) + dest `convert_in` row (cost_delta = +received in dest ccy, flow 0) sharing `transfer_id`. Destination cost basis = amount received (D-17 scope point 3): New -> create holding via normal create path with buy = received; Existing -> cost += received (quantity holding: also qty += purchased qty entered by user; avg buy price recomputed).
- Out of investments: `withdraw` row, flow = -received (D-02), realized as sale.

### Contributions

`contributions(asOfDate) = Σ_entries(effective_date <= asOfDate) convert(flow_cents, flow_currency -> budget ccy, rate asOf asOfDate)`. Memoize rate per (ccy, date); points share dates after bucket aggregation. Pure function over entries + a `rateFor(ccy,date)` callback -> unit-testable without DB.

### Type-group P/L (D-15/16)

`typePL = Σheld(value - cost) + realizedType`, `lifetimeCost = Σheld cost + soldCostType`, `% = typePL / lifetimeCost` (null if 0). Fixture: A(30k/17.2k)+B(50k/40k)+realized 28.2k sold cost 37.8k -> 51k / 95k = +53.7% (CONTEXT says +53%, assert with 0.5% tolerance or exact bigint then floor). Portfolio total uses same Σ across all 11 types incl. hidden ones (D-14). Server returns `{ [uiType]: { realizedBudgetCents, soldCostBudgetCents } }` from a separate endpoint; the holdings cache remains an array.

### Pattern: keep the holdings cache an array

Reverted ledger broke 4 optimistic mutations by changing cache shape (commit 7b0664a). Fetch `type-summary` and `history` under their own query keys; invalidate them (plus overview wealth key) on every sell/adjust/delete.

### Anti-Patterns

- Rebuilding group-name keyed ledger (reverted). Keys here are fixed `ui_type`.
- Dividing P/L by held cost (inflated %). Always lifetime cost.
- Computing contributions from stored snapshots after first entry; computing realized with today's rate for a backdated sale.
- Writing flow on convert legs (re-creates the +275k jump).
- Float math for money. Use bigint/big.js; domain has no Drizzle imports.

## Don't Hand-Roll

| Problem                 | Use Instead                                                                                                    | Why                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Historic FX             | `FxProvider.rateAsOf(from,to,date)` (CacheOnlyFxProvider reads `budgeting.fx_rates`, falls back to prior date) | exists; API never calls Frankfurter live. Throws `NoFxRateAvailable` when nothing -> surface 422, never default to 1 |
| Money <-> cents         | `centsToMoney`/`moneyToCents`, `Money.of`                                                                      | rounding path shared with wealth                                                                                     |
| Tenant tx               | `withTenantTx` returns a Result - check `isErr()` (silent no-op trap)                                          | memory                                                                                                               |
| Group order persistence | existing `/budgets/:id/ui-prefs` (merge)                                                                       | no table                                                                                                             |
| Drag-and-drop           | existing @dnd-kit flat sortable; simplify                                                                      |                                                                                                                      |
| Offline                 | `lib/offline-write.ts`                                                                                         | project rule                                                                                                         |

## Runtime State Inventory (migration/refactor phase)

| Category            | Items                                                                                      | Action                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stored data         | `investments.ui_type` values `equity`,`etf`,`reit`,`etb`,NULL rows; `group_name` free text | Data migration in 0087: equity/etf/reit -> `stocks`; etb -> `treasury_bond`; NULL -> derived from holding_type; keep `holding_type` untouched (price routing: equities vs etf both stay). Update CHECK `investments_ui_type_chk` (drop+add) to include `stocks`, drop legacy values.                                                                      |
| Stored data         | Start entries for every current non-archived holding                                       | Insert in 0087 (kind `start`, effective_date = `created_at::date`, cost_delta = buy x qty, flow = same, in buy ccy). Archived holdings get none. Possessions are wallets already (no rows in investments? verify `holding_type='possession'` rows excluded). Deposits: cost = principal. Holdings with null buy price: skip.                              |
| Live service config | none (Infisical secrets unchanged)                                                         | none - verified no external config keys on group names                                                                                                                                                                                                                                                                                                    |
| OS-registered state | none                                                                                       | none                                                                                                                                                                                                                                                                                                                                                      |
| Secrets/env         | none                                                                                       | none                                                                                                                                                                                                                                                                                                                                                      |
| Build artifacts     | Docker images: api/web/worker prebuilt; migrator no-ops on stale image                     | rebuild migrator+api+web+worker; new workspace subpaths need `exports` + Dockerfile COPY in EVERY Dockerfile if new package (we add none)                                                                                                                                                                                                                 |
| Demo account        | `packages/platform/src/demo/manifest.ts`                                                   | classify new table (copy mode; money cols scale consistently with `quantity: money4` scaling - history `qty_delta` must scale like quantity, money like money) AND add to the wipe-only/table list (L548 list); `checkManifest` aborts the nightly run otherwise. `group_name` column: leave column in place this phase (manifest unchanged), drop later. |
| Snapshots           | `budget_wealth_snapshots.investment_cost_basis_cents`                                      | untouched (D-08); keep worker writing it.                                                                                                                                                                                                                                                                                                                 |

## Custom-group call sites to remove (grep-complete)

- Web: `lib/investment-grouping.ts` (rewrite type-keyed), `investment-group-header.tsx` (+ `test/investments/investment-group-header.test.tsx`), `investments-section.tsx`, `group-combobox.tsx` (delete), `holding-sheet.tsx` (group field), `INVESTMENTS-DND.md` (rewrite), `e2e/steps/investments.steps.ts`.
- Domain/API: `domain/holding.ts` (`group`), `contracts/api.ts` (`group` in create schema + EnrichedHoldingDto), `create-holding.ts`, `update-holding.ts`, `list-holdings.ts` (`group`, `groupWeights`), `portfolio-metrics.ts` (`groupWeights`, weights using `h.group` at L157-190 -> key by `uiType`), `ports/holding-repo.ts` NewHolding.group, `holding-repo.ts` SQL (L84-91, 103, 139, 156, 200, 280), `apps/api/src/routes/investments.ts` serializeHolding, schema `groupName`.
- Other: `packages/platform/src/demo/manifest.ts` L316, `scripts/provision-uat-investments.ts`, migrations 0038/0054/0057 (history only).
- Decision: stop reading/writing `group_name`; keep the column (DROP in a later migration together with its manifest entry, because manifest has no-default and a half-removal aborts demo refresh).

## Equity+ETF merge touch points

`UI_TYPE_TO_HOLDING_TYPE` (contracts) and `investment-types.ts` `UiType`/`UI_TYPE_ORDER`: add `stocks -> "equities"` (ticker search asks for both asset classes: check `search-instruments` `type` filter and `InstrumentSearchInput` assetClass; stocks must search equity+etf). New rows with a found ETF instrument should set `holding_type` from the instrument's asset class (etf vs equities) so price routing stays correct; the CHECK on holding_type remains unchanged. Update `uiTypeSchema`, DB CHECK, i18n keys (EN/PL/UK: `apps/web/messages/*.json`, rebuild web).

## Common Pitfalls

1. **Zod `.partial()` keeps `.default()`** - new adjust/sell schemas must not inherit `quantity.default("1")` (already fixed for update via `.extend({quantity: optional})`).
2. **Hand-authored SQL must be in `drizzle/meta/_journal.json`** (idx 87, `when` > 1782742801012, tag `0087_investment_history`). Missing entry = migration silently never runs.
3. **FORCE RLS on a JOINed table silences INSERT** (memory): the Start-entry backfill INSERT...SELECT joins `investments`; run migration as migrator (owner/bypass) and verify rowcount equals non-archived holdings in an integration test. Statement separators `--> statement-breakpoint` as in 0054.
4. **`make migrate` no-ops on stale migrator image** - rebuild migrator before DB tests; DB tests need `infisical run`.
5. **Hybrid boundary**: D-08 "first history entry" is per budget = min(effective_date) over non-deleted entries. Start entries are dated `created_at`, so the boundary can sit BEFORE some old snapshots whose holdings predate nothing: after the Start backfill, points between boundary and now switch to history-based contributions which count only held-and-started holdings; archived holdings the user has not backfilled contribute 0. This is intended (D-07) but will visibly shift the line; E2E/UAT must assert only the 24 Oct jump disappears after backfill, not exact historic values.
6. **Deleting a history entry vs holding state**: deleting a `sell` row removes its realized/flow/sold-cost effect but cannot restore the holding's qty/cost/archived state. Recommended: delete only reverses ledger aggregates, UI confirm text says so; deleting a `start` row removes its flow and cost (user intent: replace with real history). OPEN QUESTION (see below). **SUPERSEDED by D-06:** delete = full undo (holding state restored from the entry's deltas).
7. **Deleted convert leg**: delete both legs by `transfer_id`.
8. **Rounding**: fixture 17.2k is rounded; assert exact bigint cents from the formula, not the prose number.
9. **Deposit holdings** are compute-on-read from principal; partial sell would change principal. Recommend: Sell on deposit = complete only (archive + realized = received - principal-cost? value at sale). Flag to planner/user. **SUPERSEDED by D-20:** partial deposit sell allowed; all interest becomes realized, remainder principal = cost = value left, start date = sale date.
10. **Rates for Out-of-investments received in non-budget ccy**: need rate asOf effective date; `NoFxRateAvailable` must return 422 with message, not 1.
11. **Query keys / invalidation**: sell must invalidate investments, type-summary, history, overview wealth + cards, tasks? (txn CRUD invalidates overview key; mimic).
12. **Docker staleness**: after FE/API edits `make dev-build`/`restart-*`; verify served bundle; worker must be force-recreated if snapshot code changes.
13. **Demo manifest column coverage** (`checkManifest`): forgetting the new table breaks the nightly refresh, not CI. Add a manifest test row in `demo-preflight.test.ts` style.
14. **iOS/DnD**: block-drag of type headers: reuse single flat SortableContext rule from INVESTMENTS-DND.md; cross-type holding drag is now impossible, so remove join-band geometry (`computeJoinBands`) and its tests rather than leave dead code.
15. **Offline writes**: sell is multi-row; send as ONE request (server tx) and rollback toast on failure; do not queue.

## Code Examples

Pure booking sketch (shape, not final):

```ts
// packages/investments/src/domain/sell-booking.ts  (no drizzle imports)
export function splitAmountHolding(i: {
  buyCents: bigint;
  valueCents: bigint;
  keepCents: bigint;
}) {
  // cost kept = buy * keep / value, round half-even once
  const keptCost = divRound(i.buyCents * i.keepCents, i.valueCents);
  return { keptCost, soldCost: i.buyCents - keptCost };
}
export const realized = (receivedBudget: bigint, soldCostBudget: bigint) =>
  receivedBudget - soldCostBudget;
```

Migration skeleton follows `drizzle/0054_investment_group_flows.sql` (table, index, ENABLE+FORCE RLS, `CREATE POLICY ... TO app_role, worker_role`, GRANT). Journal entry copies idx 86 block.

## State of the Art

Prior ledger (0054-0058, reverted 7b0664a) keyed gains by free-text `group_name` and stored raw legs with no frozen realized. Failure modes: dash % for empty groups, stale P/L inherited by same-name groups, inflated amounts on half-built groups, cache shape change. This phase: fixed type key (join on holding), D-14 hide rule, D-16 lifetime-cost denominator, separate endpoints. Memory note "Group P/L = current-state only - DO NOT rebuild" is superseded intentionally by CONTEXT D-14/D-16 (confirmed in 13-CONTEXT canonical refs).

## Assumptions Log

| #   | Claim                                                                             | Section        | Risk                                                                                            |
| --- | --------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------- |
| A1  | Soft-delete (`deleted_at`) acceptable for "entries can be deleted" vs hard delete | History schema | Low; audit-friendly                                                                             |
| A2  | Two-row `transfer_id` pairing preferred over single row                           | History schema | Low                                                                                             |
| A3  | Type-group order stored in per-member `ui_prefs` (not per budget for all members) | Architecture   | RESOLVED: per budget (`tenancy.budgets.investment_type_order`, plan 13-03) per D-12             |
| A4  | Deposit sell = complete only                                                      | Pitfalls       | SUPERSEDED by D-20 (user 261025): partial deposit sell allowed; remainder restarts at sale date |
| A5  | Deleting a sell entry does not restore holding qty/cost                           | Pitfalls       | SUPERSEDED by D-06 (user 261025): delete = full undo, qty/cost restored                         |
| A6  | New stocks rows pick holding_type (equities/etf) from instrument asset class      | Merge          | Low                                                                                             |
| A7  | Same-date rate on both sides for realized                                         | Booking rule   | Low; matches D-18                                                                               |

## Open Questions (RESOLVED)

1. **Delete semantic for sell/withdraw entries** (A5). Recommendation: ledger-only reversal + explicit confirm copy; do not auto-restore holding. Raise to user before planning the History section task.
   - RESOLVED: full undo (user, 261025; CONTEXT D-06). Deleting an entry subtracts its own stored deltas from the current holding state (quantity, cost, value; deposit sales restore stored prior principal + start date), the conversion destination loses what it received (both legs together), realized + contributions reverse; delete then re-enter does not double-count. Plans 13-01 (reverseEntry), 13-08 (reversal use-case), 13-13 (UI), 13-14 (E2E).
2. **Sell into an Existing holding of a different type** (deferred gray area). Recommend allow; realized stays with source type, dest cost += received, flow 0.
   - RESOLVED: allowed (UI-SPEC assumption 5; plan 13-07).
3. **Delete row action when holding has history**: recommend Delete = archive and keep entries (realized survives, D-14), with confirm saying history stays; hard purge only via account deletion (GDPR cascade: add the new table to the Phase 10-06 deletion list!).
   - RESOLVED: hard delete per the locked roadmap ("erases the holding and its history as if it never existed"), superseding the archive recommendation; partner legs of its conversions are deleted too (plan 13-08). New table added to the GDPR purge list (plan 13-03).
4. **Quantity entry for Existing/New investment destination** when tracked (buy qty/price from received).
   - RESOLVED: user enters "Quantity bought"; unit buy price = received / quantity (round half-even); amount destinations take buy = current = received (plans 13-07, 13-11).
5. **Realized on Overview cards**: deferred; do not touch cards this phase.
   - RESOLVED: deferred (CONTEXT Deferred Ideas); no plan touches Overview cards.

## Environment Availability

| Dependency                                                                                    | Needed                           | Status                                                          |
| --------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| Docker + compose stack                                                                        | integration/E2E (real Postgres)  | assumed up per project rule (never skip as "infra unavailable") |
| Infisical CLI                                                                                 | `make test`, DB tests, restart-* | required, per Makefile `$(INFISICAL)`                           |
| Playwright chromium                                                                           | E2E                              | `bunx playwright install chromium` if version bumped            |
| Not probed in this session (read-only research); planner Wave 0 should run `make test` smoke. |

## Validation Architecture

### Test Framework

| Property           | Value                                                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend            | bun:test (`make test` = `infisical run -- bun test --timeout 120000 packages apps/api/test tests`)                                                                                                                                                |
| Web unit/component | Vitest 4 + happy-dom: `cd apps/web && bunx vitest run <file>` (NOT `bun run test` from root)                                                                                                                                                      |
| E2E                | Playwright-bdd, `.feature` + Page Objects in `apps/web/e2e/{features,page-objects,steps}`, fresh user per scenario; `make test-e2e`; base URL https://budget-dev.madonzy.com; re-run `bddgen` after step changes; tag e.g. `@investments-history` |
| Quick              | `bun test packages/investments/test/domain` (<5s, pure)                                                                                                                                                                                           |
| Full               | `make test` + `cd apps/web && bunx vitest run` + `make test-e2e` + `make ci-gate`                                                                                                                                                                 |

### Decision -> Test Map

| Decision         | Behavior                                                                                                                                                          | Type                      | Command                                                                      | Exists                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| D-02/03          | amount-holding split: 96k/55k keep 30k, recv 66k -> cost 17,187.50, realized +28,187.50                                                                           | unit (tdd)                | `bun test packages/investments/test/domain/sell-booking.test.ts`             | Wave 0                                                                    |
| D-02             | BTC 0.4@25k now 60k sell 0.1 for 6k -> qty .3, realized +3.5k, row +140%                                                                                          | unit (tdd)                | same                                                                         | Wave 0                                                                    |
| D-03             | withdraw-via-edit 96k->80k: cost 45,833.33, realized 6,833.33, flow -16k, % stays +75%                                                                            | unit (tdd)                | same                                                                         | Wave 0                                                                    |
| D-16             | type % fixture 51k/95k                                                                                                                                            | unit (tdd)                | `bun test packages/investments/test/domain/type-group.test.ts`               | Wave 0                                                                    |
| D-14/15          | hidden type realized counts in portfolio total                                                                                                                    | unit                      | same                                                                         | Wave 0                                                                    |
| D-19/D-08        | contributions at date with per-date FX; convert legs flow 0; FX-only move cancels                                                                                 | unit (tdd, rate callback) | `bun test packages/investments/test/domain/contributions.test.ts`            | Wave 0                                                                    |
| D-08             | hybrid: pre-boundary uses snapshot cost; post uses history                                                                                                        | unit                      | `bun test packages/budgeting/test/application/get-overview-wealth*.test.ts`  | extend existing                                                           |
| D-18             | realized frozen at effective date rate (InMemoryFxProvider/fake)                                                                                                  | unit/use-case             | `bun test packages/investments/test/application/sell-holding.test.ts`        | Wave 0                                                                    |
| D-09/D-11/D-10   | migration 0087: Start rows == non-archived holdings; ui_type remap; CHECK                                                                                         | integration real PG       | `infisical run -- bun test apps/api/test/migrations/...` (new)               | Wave 0                                                                    |
| D-01/04          | sell routes: new/existing/out; tx atomic; transfer_id pair; RLS leak                                                                                              | integration               | `infisical run -- bun test apps/api/test/routes/investments-history.test.ts` | Wave 0                                                                    |
| D-06             | delete entry (both legs); date past allowed; future rejected?                                                                                                     | integration               | same                                                                         | Wave 0                                                                    |
| tenant isolation | history rows invisible cross-tenant                                                                                                                               | integration               | `make ci-gate` (add case)                                                    | extend                                                                    |
| D-10/12/13       | type grouping, order, header, no cross-type drop                                                                                                                  | Vitest                    | `cd apps/web && bunx vitest run test/investments`                            | rewrite `investment-grouping.test.ts`, `investment-group-header.test.tsx` |
| D-05/15          | History section, header sub-line, Sell sheet steps                                                                                                                | Vitest component          | same                                                                         | Wave 0                                                                    |
| All              | golden path: add holding, sell part to Out of investments, header shows realized, History lists entry, delete entry; sell->new investment contributions unchanged | E2E Gherkin               | `make test-e2e` (`@investments-history`)                                     | Wave 0                                                                    |
| Demo             | manifest covers new table                                                                                                                                         | bun:test                  | `bun test packages/platform/test/demo-preflight.test.ts`                     | extend                                                                    |

### Sampling

- Per task commit: quick domain test + touched Vitest file.
- Per wave: `make test` + web vitest.
- Phase gate: full suite + `make ci-gate` + `make test-e2e` green; Playwright live drive on phone viewport + all 3 locales (per memory: verify served bundle after rebuild).

### Wave 0 Gaps

- [ ] `packages/investments/test/domain/{sell-booking,contributions,type-group}.test.ts`
- [ ] `apps/api/test/routes/investments-history.test.ts` + migration test
- [ ] E2E `investments-history.feature`, `InvestmentsHistoryPo.ts`, steps (extend `InvestmentsPo.ts`)
- [ ] Update/replace group tests and `investments.steps.ts` group steps; `@skip` drag-into-group scenario removed

## Security Domain

| ASVS                | Applies               | Control                                                                                                                                                    |
| ------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V4 Access Control   | yes                   | tenant from `pickTenant` (never client); RLS policy on new table; `ci-gate` leak test                                                                      |
| V5 Input Validation | yes                   | Zod v4 schemas: dates `YYYY-MM-DD`, currency regex, `isSaneMagnitude` on all amounts, enum kinds, uuid ids; reject received <= 0, keep > value, qty > held |
| V6 Crypto           | no                    |                                                                                                                                                            |
| V2/V3               | no (existing session) |                                                                                                                                                            |

Threats: cross-tenant read/write of history (RLS+tenant filter, holding must belong to tenant - check `findById` tenant scope before booking); tampering via oversized numerics (bounded); IDOR on `transfer_id` delete (delete scoped by tenant_id); money PII in logs (never log amounts). GDPR: add `investment_history` to account-deletion cascade list and export.

## Sources

- Repo files read: 13-CONTEXT.md, `packages/investments/src/**` (holding.ts, list-holdings.ts, update/archive-holding.ts, contracts/api.ts, schema), `apps/api/src/routes/investments.ts`, `apps/api/src/boot.ts` L440-480, `packages/budgeting/src/application/{get-overview-wealth,compute-budget-wealth-now}.ts`, `adapters/fx/cache-only.ts`, `fx-rates-schema.ts`, `drizzle/0054,0086`, `_journal.json`, `demo/manifest.ts`, `INVESTMENTS-DND.md`, `investment-types.ts`, e2e layout, `git show 7b0664a --stat` [VERIFIED: codebase]
- No external web sources needed (no new libraries).

## Metadata

**Confidence:** stack HIGH, architecture HIGH (schema/booking are recommendations, A1-A7 flagged), pitfalls HIGH (from repo + memory).
**Research date:** 2026-10-25. **Valid until:** 2026-11-25.
