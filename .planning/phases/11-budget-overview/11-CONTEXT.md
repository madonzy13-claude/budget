# Phase 11: Budget Overview Tab - Context

**Gathered:** 2026-06-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a new **first** pill to the Budget Detail Page — `overview` — giving the family a budget-wide snapshot. All amounts in the budget's `default_currency`. Two parts:

1. **5 always-visible summary cards:**
   - Available to spend — Σ balances of `SPENDINGS` wallets
   - Capitalization — Σ ALL wallets (net worth: spendings + reserve + cushion + investment holdings)
   - This-month overspent categories
   - Cushion — real months + total amount
   - Available reserves — Σ balances of `RESERVE` wallets
2. **Four collapsible sections** (collapsed by default):
   - **Planned** (range-scoped + category selector, default none): Planned-vs-Real timeline (budget-wide or per-category) · planned-avg-vs-real-avg (Y=category) · planned-recurring-per-month · planned-recurring-per-category. **The two recurring charts are NOT range-scoped** — they reflect the current recurring-rules configuration.
   - **Overspent** (range-scoped): total overspent in range + overspent-by-category bar.
   - **Reserves**: reserves-by-category bar.
   - **Financial Wealth** (range-scoped): capitalization(default)/investments toggle · grow/loss (range value-delta, amount + %) · monthly-average grow (%) · value time-series · month-over-month dynamics (%) · per-type pie (investments view).

Range selector (shared by range-scoped charts): this month · last 3 months · this year · all · custom from→to.

**In scope:** the chart library introduction (recharts) + a new per-budget 3h wealth-aggregate snapshot table + cron.
</domain>

<decisions>
## Implementation Decisions

### Scope & Phasing

- **D-01:** **Single phase — everything in Phase 11**, including the Financial-Wealth section. (Earlier draft split a Phase 12; user confirmed Phase 9 investments is fully complete + tested, so there is no dependency blocker — Phase 12 was removed and merged back.)

### Performance / Data Model

- **D-02:** **Budget-side metrics compute-on-read** — available-to-spend, capitalization (current), overspent, cushion, reserves, planned-vs-real, planned-avg, recurring — all reconstructed per request from the append-only ledger + SCD-2 `category_limits` + wallets. NO snapshot table and NO dependency-cascade machinery for these. Correctness is automatic (ledger is source of truth; a past edit just reflects on next read).
- **D-03:** **Caching = the app's existing persisted React-Query SWR** — paints instantly from persisted cache, revalidates in background, invalidates on relevant mutation. This is the whole "blazing fast / cached-then-corrects / recalc when older data changes" story; no bespoke cache layer.
- **D-04:** **Wealth value-over-time = a new per-budget 3h aggregate snapshot** (the user's design — much simpler than reconstructing from per-asset price history). A pg-boss cron, every ≤3h, computes for **every budget** in its `default_currency`: `{capitalization_cents (Σ all wallets), investment_value_cents (Σ investment holdings)}` and writes **one small row per budget per tick**. Charts read these rows directly. The newest/rightmost point is computed **live on read** so "last 3h is always up to date." No per-asset price history, no FX history, no holdings-quantity history is stored or reconstructed.
  - **Snapshot scope:** ALL budgets (capitalization is meaningful even with zero investments; rows are tiny). Investment field = 0 when nothing held.
  - **History start:** begins when snapshotting starts (no pre-launch backfill). Planner MAY seed the first cash point from the ledger if cheap.
  - New table (name planner's call), e.g. `budgeting.budget_wealth_snapshots (budget_id, tenant_id, captured_at, capitalization_cents, investment_value_cents, currency)`. Handler runs after fx/investment refresh.
- **D-05:** Reuse `usePrefetchBudgetTabs` idle-prefetch so the overview summary is warm before the pill is tapped.

### Archived categories (resolved a contradiction in the original spec)

- **D-06:** **Keep in history, drop from current.** An archived category still appears in charts/totals for past periods where it had activity, but is excluded from the current-month cards (available-to-spend, this-month overspent) and forward-looking planned-average stats. (The spec's "remove and recalculate" alternative was rejected — it retroactively rewrites history.)

### Metric definitions

- **D-07:** **Capitalization = net worth = Σ ALL wallets** (user: "everything you have in each wallet") converted to default_currency. Drives the capitalization card + the capitalization toggle of the Wealth section. (Investments toggle = only investment-holdings value.)
- **D-08:** **Cushion card from the existing `get-cushion-summary`** ({required_cents, actual_cents, shortfall_cents, target_months}). `total amount` = `actual_cents`; `real months` = `actual_cents ÷ (required_cents ÷ target_months)` (current buffer ÷ per-category monthly cushion limits). No new cushion math.
- **D-09:** **Available to spend** = Σ `SPENDINGS` wallet balances; **available reserves** = Σ `RESERVE` wallet balances. Wallet-sum + FX pattern from `home-summary`, filtered by `wallet_type`.
- **D-10:** **Overspent = after reserves:** per category `max(0, spent − active_limit − reserve_used)`, `active_limit` = the limit active that month (cushion_amount in cushion-mode months via `budget_mode_history`, else normal_amount). Matches the Spendings grid exactly. Drives the card, the Overspent-section total, and the by-category bar.
- **D-11:** **Currency = budget `default_currency`** (NOT per-user `display_currency`). All cards, charts, and the wealth snapshot are in default_currency — same for every member. ⚠ This intentionally differs from `home-summary` (which uses display_currency), so Overview numbers may show a different currency than the home cards.
- **D-12:** **Planned-vs-Real:** Real = **confirmed transactions only** (`confirmed_at` set, excludes pending drafts); Planned = the limit **active that month per mode** (cushion vs normal).
- **D-13:** **Planned-average vs Real-average** (Y=category, X=amount) = mean monthly planned vs mean monthly real over **only the months the category existed within the range** (after creation / before archive) — not diluted by inactive months.
- **D-14:** **Recurring charts (per month / per category) are NOT range-scoped** — they project the **current** `recurring_rules` configuration (no history). "Per month" = distribution of current recurring load across calendar months; "per category" = total planned recurring per category from current config.
- **D-15:** **Grow/loss over period = value delta over the selected range** (end − start); % = delta ÷ start. Applies to capitalization or investment value per the toggle, read from the snapshot series.
- **D-16:** **Monthly average grow % = simple mean of the month-over-month % changes** in the range (matches the dynamics chart's bars one-to-one).
- **D-17:** **"Invested over period" is REMOVED** from the Wealth section. (Therefore the snapshot stores only capitalization + investment value — no cost-basis column.)
- **D-18:** **Financial-Wealth toggle:** capitalization (default) / investments. Investments view adds a per-type **pie** using Phase 9 type colors; **tap (mobile) / hover (desktop)** reveals share % + type label.

### Charts

- **D-19:** **Chart library = recharts (latest stable)** — already the named pick in CLAUDE.md's stack; nothing chart-related is installed yet (only `placeholder-chart.tsx`). Add the dep + thin themed wrappers (Area/Line/Bar/Pie) per DESIGN.md.
- **D-20:** **Bucket granularity = adaptive, monthly-default.** Range-scoped charts bucket by month (planned amounts are monthly); `this month` + short custom spans (≤ ~62 days) switch to a daily cumulative line. Wealth value series aggregates the 3h snapshots to the range's bucket; month-over-month dynamics uses monthly samples.
- **D-21:** Sections + category selector default to collapsed/none; range selector is shared.

### Claude's Discretion

- Pill label: **"Overview"** (user said "you can call it better"; planner may pick "Summary" if DESIGN copy prefers).
- Endpoint shape: one `overview-summary` endpoint extending `get-budget-home-summary`, or a small set (cards vs per-chart range queries) — planner's call; cards largely reuse `home-summary`.
- "This-month overspent categories" card format (top-N list like `home-summary.top_overspent` vs count).
- Pie/section empty states; dynamics chart basis (month-end snapshot samples); optional first-point ledger backfill.
- Ledger index additions for fast monthly-bucket aggregation.
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design & roadmap

- `.planning/ROADMAP.md` §"Phase 11" — phase goal + 9 success criteria (the scope contract)
- `DESIGN.md` — UI source of truth (Binance dark canvas, single yellow accent, Inter/IBM Plex Sans); charts must theme to it

### Reusable services / endpoints (compute-on-read sources)

- `packages/budgeting/src/application/get-budget-home-summary.ts:93-250` — returns spent-current-month, wallets-value (converted), top-overspent; the 5 cards largely reuse/extend this (`summaryRepo`: `getBudgetMeta`, `sumCurrentMonthSpend`, `listWalletsForBudget`, `topOverspentCategories`)
- `apps/api/src/routes/spendings-summary.ts:31-60` + `deps.budgeting.getSpendingsSummary` — current-month planned-vs-real per category (extend to multi-month for the timeline charts)
- `packages/budgeting/src/application/get-reserves-summary.ts` — per-category reserve balances + totals (Reserves bar + available-reserves card)
- `drizzle/0023_phase05_exclude_current_month_from_reserve.sql:27-167` — `budgeting.category_reserve_balance` view (per-category, excludes current month)
- `packages/budgeting/src/application/get-cushion-summary.ts` — cushion {required, actual, shortfall, target_months} (D-08)
- `packages/shared-kernel/src/ports/fx-provider.ts:3-9` — `FxProvider.rateAsOf(from,to,date)` for all conversions to default_currency

### Models for the chart queries

- `drizzle/0009_breezy_karen_page.sql:14-26` — `category_limits` SCD-2 (normal_amount / cushion_amount, effective_from/to) — "planned" source
- `budgeting.budget_mode_history` (mode NORMAL/CUSHION, effective_from/to) — which limit was active per month (D-10/D-12)
- `drizzle/0011_plan_02_08_recurring.sql:4-24` — `recurring_rules` (MONTHLY/WEEKLY cadence) — source of the current-config recurring charts (D-14)
- `categories.archived_at` — archived flag (D-06)

### Investments + wealth snapshot

- `drizzle/0038_phase09_investments.sql:70-88` — `budgeting.investments` holdings (quantity, current_price_cents, currency, archived_at) — capitalization/investment value
- `drizzle/0038_phase09_investments.sql:31-36` + `instrument_price_cache` — live prices for the on-read current point
- `apps/worker/src/handlers/investment-snapshot-daily.ts:27-86` + `apps/worker/src/worker.ts` — pg-boss handler + registration pattern to mirror for the new 3h budget-wealth snapshot job
- Phase 9 instrument-type color map (in `apps/web` investments components) — reuse for the pie (D-18)

### BDP frame (where the pill plugs in)

- `apps/web/src/lib/bdp-tabs.ts:7-18` — `TAB_ORDER` + `isBdpTab` (prepend `"overview"`; keep in the non-client lib — server page calls `isBdpTab`)
- `apps/web/src/app/[locale]/(app)/budgets/[id]/[[...tab]]/page.tsx` — catch-all route + client carousel
- `apps/web/src/hooks/use-prefetch-budget-tabs.*` — idle prefetch wiring
- `apps/web/src/components/budgeting/placeholder-chart.tsx:1-27` — themed card frame to reuse; swap the body for real charts
  </canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`get-budget-home-summary`** — covers 3 of 5 cards (spent, wallet value, top overspent). Extend, don't rebuild. (Note D-11: switch its conversion target to default_currency for Overview.)
- **`category_reserve_balance` view + `get-reserves-summary`** — Reserves section + available-reserves card + the `reserve_used` term in the overspent formula.
- **`get-cushion-summary`** — Cushion card (D-08), no new math.
- **`FxProvider.rateAsOf`** — one port for every conversion; parallelize distinct from→to pairs as home-summary does.
- **`investment-snapshot-daily` handler + worker registration** — copy the shape for the new 3h budget-wealth aggregate job.
- **`placeholder-chart` card frame** + **`usePrefetchBudgetTabs`** + **persisted React-Query** — the SWR/caching + prefetch story (D-03/D-05) is already app-wide.

### Established Patterns

- Drizzle/queries only in `packages/<context>/adapters/persistence/`; domain Drizzle-free; `Money` ↔ `{amount_cents, currency}` at adapter boundary; **bigint→string at route boundary**.
- BDP tabs = client pushState carousel, zero per-nav RSC; shared tab consts stay in the non-client `lib/bdp-tabs.ts`.
- SCD-2 `category_limits` + `budget_mode_history` — "planned" / "active limit" for a month = the version effective during that month (matters for multi-month charts + overspent).
- RLS + tenant_id on every query (incl. the new snapshot table + its cron worker, which runs outside a request — set the GUC).

### Integration Points

- New `overview` pill prepended to `TAB_ORDER`; new overview component under the `[[...tab]]` carousel; new `overview-summary` query/endpoint(s); recharts added to `apps/web`.
- New `budget_wealth_snapshots` table + migration + pg-boss 3h handler in `apps/worker` (mirror investment-snapshot-daily); worker writes per-budget rows (needs tenant GUC per budget).
- Multi-month aggregation queries are the main new backend surface — consider ledger indexes on (budget_id, category_id, month).
  </code_context>

<specifics>
## Specific Ideas

- User's snapshot model (verbatim intent): "just 3h snapshot the total wealth/investments for each user in their currency, so you don't need to store all currencies and assets prices from past" → D-04.
- "Blazing fast … cached and shown instantly and then changed once background request provides data. User eventually sees the most accurate info." → persisted-RQ-SWR + compute-on-read (D-02/D-03); no bespoke cache.
- "Last 3h always up-to-date" → live current point computed on read (D-04); budget-side metrics are always live anyway.
- Section default = collapsed; Planned category selector default = none; Wealth toggle default = capitalization.
  </specifics>

<deferred>
## Deferred Ideas

- **Daily/yearly recurring cadence** — `recurring_rules` only supports MONTHLY/WEEKLY today. If the recurring charts ever need finer cadence, that's a separate engine change, not this phase.
- **Per-user display-currency view of the Overview** — D-11 fixes Overview to budget default_currency; a per-user display toggle could be a future enhancement.
- **Finer wealth history (≤3h literal ticks / pre-launch backfill)** — current model is 3h aggregate snapshots from go-live forward; denser history or historical backfill is a future enhancement if needed.

</deferred>

---

_Phase: 11-budget-overview_
_Context gathered: 2026-06-28_
