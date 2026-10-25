# Phase 13: Investments: type-based groups, sell/convert flow, realized P/L and contributions history - Context

**Gathered:** 2026-10-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Moving money between investments (sell, convert, buy with proceeds, withdraw) no longer distorts contributions or erases gains. Every holding keeps a dated history of changes; gain is tracked per investment **type** (fixed keys, never user-named groups) and survives sales. Custom groups are removed and replaced by automatic type groups.

The 8 scope points in `.planning/ROADMAP.md` → Phase 13 are LOCKED (groups = type, Sell/Withdraw/Delete row actions, realized gain stays with source type, contributions = in − out, edit asks "what happened", change type = correction, partial-sell row math, starting entry per holding). This file adds the decisions that resolve what the roadmap left open.

</domain>

<decisions>
## Implementation Decisions

### Withdraw flow

- **D-01:** Withdraw is NOT its own swipe icon. It is a third destination inside **Sell → "Where did the money go?"**: _New investment_ / _Existing investment_ / **Out of investments**. Same "how much is left" + "amount received" steps. Row swipe actions stay Sell / Edit / Delete.
- **D-02:** A withdrawal books like a sale: realized = received − cost of the withdrawn part (stays in the source type header); **contributions drop by the RECEIVED amount**.
- **D-03:** Edit → "Withdrew money" on a hand-valued holding is shorthand for Sell → Out of investments, with exactly the same booking. Example: broker 96k / cost 55k, edit to 80k + "Withdrew money" → cost −9.2k (55k×16/96), realized +6.8k in Broker header, contributions −16k, row stays +75%. One booking rule, two entry points. (Symmetrically, "Added money" raises cost and contributions by the amount.)
- **D-04:** Withdrawn money does NOT flow into a budget wallet; it just leaves investments.

### History & backfill

- **D-05:** A holding's history is a **History section inside the edit sheet**: a dated list (Start, Bought/Added, Sold, Withdrew, Value changed, Converted in/out). No separate history screen.
- **D-06:** Every Sell / Add / Withdraw entry has a **date picker (default today, past dates allowed)**. Entries can be **deleted** (P/L, realized and contributions recompute); there is no in-place editing (delete and re-enter).
- **D-07:** The user backfills real history (BOSSA - IKE, archived Exante – World / Interactive Brokers / Exante (GPW), Erste EUR/USD, the 8 "Tato …" deposits, crypto/metals buys/sells, the 24 Oct broker → Erste conversion) **in-app, through the normal flows with past dates**. No import script, no CSV.
- **D-08:** Overview "without contributions" line is **hybrid**: from a budget's first history entry onward, each point's contributions are computed from history entries up to that point's date (this removes the 24 Oct +275k jump and lets backdated entries reshape the line). Points **before** the first history entry keep their stored snapshot `investment_cost_basis_cents`. The user's synthetic proportional backfill of madonzy's snapshots from Oct 2023 must stay untouched.
- **D-09:** The automatic **Start** entry (roadmap point 8) is a normal, deletable entry dated at the **holding's `created_at`**, amount = current cost. It is never auto-replaced; the user deletes it by hand after entering real history.

### Type group display

- **D-10:** **Merge equity + ETF into one `stocks` form type** in this phase: one add-form option whose ticker search returns both stocks and ETFs (same live-price flow as today), and existing `equity` / `etf` rows are migrated to `stocks`. After the merge, **one group per form type** = 11 groups: stocks, crypto, treasury_bond, collectibles, real_estate, precious_metals, cash, savings, deposit, broker, other. (Possessions are wallets, already excluded from investments.)
- **D-11:** Legacy rows outside the picker (`reit`, `etb`, null `ui_type`) map once: reit → stocks, etb → treasury_bond, null → derived from `holding_type`. Dev DB has none; prod may.
- **D-12:** Groups are **draggable as blocks** (order saved per budget). Holdings reorder only **within** their type; cross-type drag is impossible (change type via Edit, roadmap point 6).
- **D-13:** **Every type with holdings gets a header**, even with a single holding, because the header is where realized gain lives.
- **D-14:** A type with realized gain but **no holdings left is hidden**. Its realized gain still counts in the portfolio total and shows again on the header if a holding of that type is added later.
- **D-15:** Header shows **value · total P/L (unrealized + realized)**, with realized as a small **sub-line** ("incl. realized +28k"). The mobile tap sum-up shows the split.
- **D-16:** Header **P/L % = total P/L ÷ all cost ever put into the type** (cost still held + cost of sold parts), i.e. the type's lifetime return; a sale does not move it. Example: A (30k, cost 17.2k) + B (50k, cost 40k) + realized 28.2k from a sold part with cost 37.8k → +51k ÷ 95k = **+53%**. Never ÷ cost still held (the inflated-% bug of the reverted ledger). Portfolio total uses the same rule.

### Currency on sell

- **D-17:** "Amount received" is entered in the **destination's currency** (what actually landed, e.g. 51,600 zł in PLN cash), prefilled with today's value of the sold part converted at today's rate. For _Out of investments_ it defaults to the source currency and is switchable.
- **D-18:** Realized gain is stored in **budget currency, frozen at the sale date**. Later FX moves never change a past realized gain.
- **D-19:** Contributions entries are stored in their **original currency** and **converted on read**, using the **FX rate as of each chart point's date** (historic `fx_rates`), so FX-only moves cancel out of the "without contributions" line and each point matches that day's wealth valuation. The live/today point uses today's rate.

### Claude's Discretion

- **Cost-side FX rate for the sold part** (budget currency): keep realized consistent with how unrealized P/L is computed at the moment of sale, so selling a row at 0% books ~0 realized. Document the chosen rule.
- Exact history entry kinds/labels, the schema for the history table, migration numbering, and how the portfolio total presents realized gain from hidden types.
- How "Converted in/out" entries pair source and destination (one transaction id vs two linked rows).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope

- `.planning/ROADMAP.md` → "Phase 13" — locked 8-point scope, partial-sell math with BTC and broker examples, prior-art warning
- `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md` — project constraints (Money VO, append-only ledger, RLS, TDD)

### Prior art (do not repeat)

- Commit `7b0664a` + migrations 0054–0058 — per-group-name gain ledger, reverted. Failure modes: "—" for empty groups, stale P/L inherited by same-name groups, inflated amounts on half-built groups. Fixed type keys + D-14/D-16 avoid all three.

### Existing investments UI / grouping

- `apps/web/src/components/budgeting/wallets-tab/INVESTMENTS-DND.md` — current flat-sortable DnD model (group membership inferred on drop; much of it goes away with type groups)
- `apps/web/src/lib/investment-types.ts` — `UI_TYPE_ORDER` picker list, ui_type → holding_type mapping (equity/etf merge lands here)

No external specs; requirements fully captured in the roadmap and decisions above.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `apps/web/src/components/budgeting/wallets-tab/holding-sheet.tsx` — add/edit form per type; Sell's "new investment" destination reuses the same type-specific form; History section (D-05) goes in the edit sheet.
- `apps/web/src/lib/investment-grouping.ts` — `groupAggregate` (current-state Σvalue−Σcost); becomes type-keyed and gains realized + lifetime cost (D-15/D-16).
- `packages/investments/src/application/list-holdings.ts` — enriched DTO with `costInBudgetCents` (buy_price×qty, FX buy-ccy → budget).
- `packages/budgeting/src/application/get-overview-wealth.ts` (`costOf(r)` in `pickAdj`) — today's "without contributions" = value − stored snapshot cost; becomes the hybrid of D-08.
- `packages/budgeting/src/application/compute-budget-wealth-now.ts`, `packages/budgeting/src/adapters/persistence/wealth-snapshot-repo.ts` — live point + 3h snapshot capture of cost basis (mig 0062).
- `fx_rates` table (historic daily rates) — source for D-19 point-date conversion.

### Established Patterns

- Hexagonal per package: Drizzle only in `adapters/persistence/`; `Money` → `{amount_cents BIGINT, currency CHAR(3)}` at the boundary. Quantity is `numeric(28,8)`.
- Append-only ledger + RLS (`pgPolicy` + FORCE RLS in post-migration.sql). Hand-authored SQL migrations must be registered in `_journal.json`.
- Optimistic mutations operate on a plain `HoldingDto[]` in `useInvestments`; the reverted ledger broke this by changing the cache shape. Keep the holdings cache an array and fetch realized/history separately.
- All writes go through `lib/offline-write.ts`.

### Integration Points

- `budgeting.investments.group_name` — removed / ignored (groups = type); `sort_order` stays for within-type order, plus a new per-budget type-group order (D-12).
- `archive-holding.ts` / `update-holding.ts` — Sell (sold completely) and Edit "what happened" hook in here.
- Overview wealth chart and the 3h worker snapshot — contributions from history (D-08, D-19).

</code_context>

<specifics>
## Specific Ideas

- Worked example to use as a test fixture: Broker 96k / cost 55k → keep 30k → cost 17.2k, row +12.8k (+75%), realized +28.2k if 66k received.
- BTC example: 0.4 BTC @25k, now 60k; sell 0.1 for 6k → 0.3 BTC +10.5k (+140%), realized +3.5k in Crypto header.
- Group % fixture: A(30k/17.2k) + B(50k/40k) + realized 28.2k (sold cost 37.8k) → +51k, +53%.
- Withdraw-via-edit fixture: 96k/55k edited to 80k "Withdrew money" → cost 45.8k, realized +6.8k, contributions −16k.
- The real-data acceptance test is the 24 Oct broker → Erste move: entered as a conversion, it restores ~182k realized gain and the ~240k contributions, and the +275k Overview jump disappears.

</specifics>

<deferred>
## Deferred Ideas

- Withdraw directly into a budget wallet (auto-raise that wallet's balance), a cross-context link for its own phase.
- Remaining gray areas not discussed (planner decides or raises): Delete when a holding has history entries, Sell into an existing holding of a different type, Change-type UX details, how realized gain appears on Overview cards.

</deferred>

---

_Phase: 13-investments-type-based-groups-sell-convert-flow-realized-p-l_
_Context gathered: 2026-10-25_
