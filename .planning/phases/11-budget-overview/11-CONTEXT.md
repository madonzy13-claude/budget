# Phase 11: Budget Overview Tab - Context

**Gathered:** 2026-06-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a new **first** pill to the Budget Detail Page — `overview` — that gives the family a budget-wide snapshot. Two parts:

1. **5 always-visible summary cards** (FX-converted to budget currency):
   - Available to spend — Σ balances of `SPENDINGS` wallets
   - Capitalization — Σ all wallets (net worth)
   - This-month overspent categories
   - Cushion — real months + total amount
   - Available reserves — Σ balances of `RESERVE` wallets
2. **Three collapsible chart sections** (collapsed by default), all scoped to one shared time-range selector (this month · last 3 months · this year · all · custom from→to):
   - **Planned** — category selector (default none): Planned-vs-Real timeline (budget-wide or per-category) + planned-avg-vs-real-avg (Y=category) + planned-recurring-per-month + planned-recurring-per-category
   - **Overspent** — total overspent in range + overspent-by-category bar
   - **Reserves** — reserves-by-category bar

**Explicitly OUT of scope (→ Phase 12):** the Financial-Wealth section (capitalization/investments toggle, grow/loss + invested + monthly-avg-grow stats, value time-series, month-over-month dynamics, per-type pie). It needs persisted snapshots and depends on Phase 9 investments web UI shipping — see Deferred Ideas.

This phase introduces the chart library (recharts) and the compute-on-read aggregation queries; both are reused by Phase 12.
</domain>

<decisions>
## Implementation Decisions

### Scope & Phasing

- **D-01:** The original single spec is **split into Phase 11 (budget-side) + Phase 12 (financial-wealth)**. Phase 11 ships everything that derives from the ledger and has no investments dependency; Phase 12 adds the wealth section that needs snapshots + live investments UI. Rationale: Phase 9 investments web UI is paused (not live), and the budget-side half delivers value independently.

### Performance / Data Model

- **D-02:** **Compute-on-read, no snapshot table, no cascade.** All Phase-11 metrics (available-to-spend, capitalization, overspent, cushion, reserves, planned-vs-real, recurring) are reconstructed per request from the append-only ledger + SCD-2 `category_limits` + wallets. There is NO `budget_snapshots` table and NO dependency-invalidation cascade machinery in this phase.
- **D-03:** **Caching = the app's existing persisted React-Query SWR.** The tab paints instantly from the persisted cache, revalidates in the background, and invalidates on any relevant mutation. This is how "blazing fast" + "cached shows instantly, then corrects" + "recalc when older data changes" are all satisfied — correctness is automatic because the ledger is the source of truth (a past edit is simply reflected on the next read; no stale aggregate can drift).
- **D-04:** **"Last 3h always live" is satisfied for free** — compute-on-read is always live. The "≤3h snapshot ticks" requirement only applies to the wealth value-over-time series and is therefore a **Phase 12** decision, not Phase 11.
- **D-05:** Reuse the `usePrefetchBudgetTabs` idle-prefetch pattern so the overview summary is warm before the pill is tapped.

### Archived categories (resolved a contradiction in the original spec)

- **D-06:** **Keep in history, drop from current.** An archived category still appears in charts/totals for past periods where it had activity (history stays accurate), but is excluded from the current-month cards (available-to-spend, this-month overspent) and forward-looking planned-average stats. Archiving means "no longer active," not "never existed." (The spec's "remove and recalculate" alternative was rejected — it would retroactively rewrite history.)

### Metric definitions

- **D-07:** **Capitalization = net worth = Σ ALL wallets** (SPENDINGS + RESERVE + CUSHION + investment holdings) converted to budget currency. (Phase 12's "investments" toggle = only investment-wallet holdings value.) Resolves the ambiguous spec phrase "sum of all wallets with investments."
- **D-08:** **Cushion card derives from the existing `get-cushion-summary` service** ({required_cents, actual_cents, shortfall_cents, target_months}). `total amount` = `actual_cents`; `real months` = `actual_cents ÷ (required_cents ÷ target_months)` = how many months the current buffer covers at the per-category monthly cushion limits. No new cushion formula — reuse the tested service. (Denominator is Σ category `cushion_amount`, i.e. "based on cushion limits in categories.")
- **D-09:** **Available to spend** = Σ `SPENDINGS` wallet balances (FX→budget ccy). **Available reserves** = Σ `RESERVE` wallet balances (FX→budget ccy). Same wallet-sum + FX pattern as `home-summary`, filtered by `wallet_type`.

### Charts

- **D-10:** **Chart library = recharts (latest stable)** — already the named pick in CLAUDE.md's stack table; nothing chart-related is installed yet (only `placeholder-chart.tsx`). Add the dep, build thin themed wrappers (Area/Line/Bar) per DESIGN.md.
- **D-11:** **Bucket granularity = adaptive, monthly-default.** Planned-vs-Real and per-category charts bucket by month (the natural unit since planned amounts are monthly). The `this month` range (and short custom spans ≤ ~62 days) switch to a daily cumulative real-vs-planned line so a single month isn't one dot. Longer ranges = monthly.
- **D-12:** Range selector presets: this month · last 3 months · this year · all · custom (from→to). All three sections share one selector. Sections + category selector default to collapsed/none.

### Claude's Discretion

- Pill label: **"Overview"** (user said "you can call it better" — Overview is the lowest-friction, clearest choice; planner may pick "Summary" if DESIGN copy prefers it).
- Whether the overview summary is one new endpoint (`GET /budgets/:id/overview-summary`) extending `get-budget-home-summary`, or a small set of endpoints (cards vs each chart's range query) — planner's call; cards can largely reuse `home-summary`.
- Exact index additions on the ledger to keep monthly-bucket aggregation fast.
- Empty/loading/error states styling within DESIGN.md.
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design & roadmap

- `.planning/ROADMAP.md` §"Phase 11" / "Phase 12" — phase goals + success criteria (the scope contract)
- `DESIGN.md` — UI source of truth (Binance dark canvas, single yellow accent, Inter/IBM Plex Sans); charts must theme to it

### Reusable services / endpoints (compute-on-read sources)

- `packages/budgeting/src/application/get-budget-home-summary.ts:93-250` — already returns spent-current-month, wallets-value (converted), top-overspent; the 5 cards largely reuse/extend this (`summaryRepo` methods: `getBudgetMeta`, `sumCurrentMonthSpend`, `listWalletsForBudget`, `topOverspentCategories`)
- `apps/api/src/routes/spendings-summary.ts:31-60` + `deps.budgeting.getSpendingsSummary` — current-month planned-vs-real per category (extend to multi-month for the timeline charts)
- `packages/budgeting/src/application/get-reserves-summary.ts` — per-category reserve balances + totals (Reserves section bar)
- `drizzle/0023_phase05_exclude_current_month_from_reserve.sql:27-167` — `budgeting.category_reserve_balance` view (per-category, excludes current month)
- `packages/budgeting/src/application/get-cushion-summary.ts` — cushion {required, actual, shortfall, target_months} (D-08)
- `packages/shared-kernel/src/ports/fx-provider.ts:3-9` — `FxProvider.rateAsOf(from,to,date)` for all currency conversions

### Models for the chart queries

- `drizzle/0009_breezy_karen_page.sql:14-26` — `category_limits` SCD-2 (normal_amount / cushion_amount, effective_from/to) — source of "planned"
- `drizzle/0011_plan_02_08_recurring.sql:4-24` — `recurring_rules` (MONTHLY/WEEKLY cadence) + `recurring_drafts` — source of "planned recurring per month / per category" (note: only MONTHLY+WEEKLY exist despite older roadmap text claiming daily/yearly)
- `categories.archived_at` — archived flag used for D-06

### BDP frame (where the pill plugs in)

- `apps/web/src/lib/bdp-tabs.ts:7-18` — `TAB_ORDER` + `isBdpTab` (add `"overview"` first; keep this in the non-client lib — server page calls `isBdpTab`)
- `apps/web/src/app/[locale]/(app)/budgets/[id]/[[...tab]]/page.tsx` — catch-all route + client carousel
- `apps/web/src/hooks/use-prefetch-budget-tabs.*` — idle prefetch wiring
- `apps/web/src/components/budgeting/placeholder-chart.tsx:1-27` — card frame to reuse; replace its body with real charts

### Investments (Phase 12 only — for reference)

- `drizzle/0038_phase09_investments.sql:59-65` — `instrument_price_snapshots` (daily, one row/instrument/day); `:70-88` `investments` holdings
- `apps/worker/src/handlers/investment-snapshot-daily.ts:27-86` — daily snapshot writer (extend for ≤3h cadence in Phase 12)
  </canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`get-budget-home-summary`** — covers 3 of the 5 cards already (spent, wallet value converted, top overspent). Extend rather than rebuild.
- **`category_reserve_balance` view + `get-reserves-summary`** — Reserves section + available-reserves card.
- **`get-cushion-summary`** — Cushion card (D-08), no new math.
- **`FxProvider.rateAsOf`** — one port for every conversion (parallelize distinct from→to pairs as home-summary does).
- **`placeholder-chart.tsx` card frame** — keep the themed card shell, swap the body.
- **`usePrefetchBudgetTabs` + persisted React-Query** — the whole SWR/caching story (D-03) is already established app-wide.

### Established Patterns

- Drizzle/queries live only in `packages/<context>/adapters/persistence/`; domain stays Drizzle-free; `Money` ↔ `{amount_cents, currency}` at the adapter boundary; **bigint→string at route boundary**.
- BDP tabs = client pushState carousel, zero per-nav RSC; shared tab consts must stay in the non-client `lib/bdp-tabs.ts`.
- SCD-2 `category_limits` — "planned" for a month = the version effective during that month (matters for multi-month timeline charts).

### Integration Points

- New pill prepended to `TAB_ORDER`; new overview component under the `[[...tab]]` carousel; new `overview-summary` query/endpoint(s); recharts dep added to `apps/web`.
- Multi-month aggregation queries are the main new backend surface — may want ledger indexes for (budget_id, category_id, month).
  </code_context>

<specifics>
## Specific Ideas

- "Blazing fast … cached and shown instantly and then changed once background request provides data. User eventually sees the most accurate info." → exactly the persisted-RQ-SWR + compute-on-read model in D-02/D-03; no bespoke cache layer.
- "Every snapshot must have ticks no rarer than every 3h, last 3h always up-to-date; once older data changes all later dependent data recalculated." → For Phase 11 this is automatic (compute-on-read is always live and always correct). The literal snapshot-tick cadence only matters for the Phase-12 wealth time-series.
- Section default state = collapsed; Planned category selector default = none; (Phase 12) financial-wealth toggle default = capitalization.
  </specifics>

<deferred>
## Deferred Ideas

- **Financial-Wealth section → Phase 12** (already roadmapped): capitalization/investments toggle, grow/loss + invested + monthly-avg-grow stats, value time-series, month-over-month dynamics chart, per-type pie (Phase 9 colors, tap/hover share %). Needs persisted snapshots + live Phase 9 investments UI.
- **≤3h snapshot cadence + "last 3h live" tail** → Phase 12 (snapshot infra decision). Phase 9 currently snapshots prices daily only.
- **Holdings quantity history** — needed for an exact "invested over period" / value-over-time if quantities changed mid-range. Phase 12 must decide: snapshot holdings too, or approximate with current quantity. Flag for Phase 12 planning.
- **Daily/yearly recurring cadence** — `recurring_rules` only supports MONTHLY/WEEKLY today; if Planned-recurring charts need finer cadence, that's a separate engine change, not this phase.

</deferred>

---

_Phase: 11-budget-overview_
_Context gathered: 2026-06-28_
