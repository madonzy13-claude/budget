# Phase 11: Budget Overview Tab — Research

**Researched:** 2026-06-28
**Mode:** `--research` (forced) · `--tdd`
**Method:** CONTEXT.md decisions + 3 parallel codebase-mapper sweeps (backend services / wealth-snapshot infra / FE frame + tests) + recharts npm/context7.

> This file carries the **concrete interface signatures** the planner and executors need. Plans reference these so executors do NOT re-explore (50k subagent budget). Everything below was read from the live tree on 2026-06-28.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01 … D-21)

- **D-01** Single phase — Financial-Wealth section ships HERE (Phase 9 investments complete; no blocker).
- **D-02** Budget-side metrics **compute-on-read** from append-only ledger + SCD-2 `category_limits` + wallets. NO snapshot table, NO dependency cascade for these.
- **D-03** Caching = existing **persisted React-Query SWR** (paint-from-cache → revalidate → invalidate-on-mutation). No bespoke cache.
- **D-04** Wealth value-over-time = new per-budget **3h aggregate snapshot** `{capitalization_cents, investment_value_cents}` in `default_currency`, one row/budget/tick, ALL budgets. Newest point computed **live on read**. No per-asset/FX/quantity history.
- **D-05** Reuse `usePrefetchBudgetTabs` idle prefetch to warm overview.
- **D-06** Archived categories: **keep in history, drop from current** (in past-period charts/totals; excluded from current-month cards + forward planned-avg).
- **D-07** Capitalization = net worth = Σ ALL wallets (+ investment holdings value) → default_ccy.
- **D-08** Cushion card from `get-cushion-summary`; `total amount = actual_cents`; `real months = actual_cents ÷ (required_cents ÷ target_months)`.
- **D-09** Available-to-spend = Σ `SPENDINGS` wallet balances; available-reserves = Σ `RESERVE` wallet balances (wallet-sum+FX pattern, filtered by `wallet_type`).
- **D-10** Overspent (after reserves) per category = `max(0, spent − active_limit − reserve_used)`; `active_limit` = limit active that month per mode (`budget_mode_history`: cushion_amount in CUSHION months else normal_amount). Matches Spendings grid.
- **D-11** Currency = budget **`default_currency`** (NOT per-user `display_currency`). ⚠ Intentionally differs from `home-summary`.
- **D-12** Planned-vs-Real: Real = **confirmed transactions only** (`confirmed_at` set); Planned = limit active that month per mode.
- **D-13** Planned-avg vs Real-avg (Y=category): mean over **only months the category existed within range** (post-creation / pre-archive).
- **D-14** Recurring charts (per-month / per-category) are **NOT range-scoped** — project the **current** `recurring_rules` config.
- **D-15** Grow/loss = value delta over range (end − start); % = delta ÷ start; from snapshot series.
- **D-16** Monthly-avg grow % = simple mean of the month-over-month % changes in range (one-to-one with dynamics bars).
- **D-17** "Invested over period" **REMOVED** → snapshot stores only capitalization + investment value (no cost-basis).
- **D-18** Wealth toggle: capitalization (default) / investments; investments view adds per-type **pie** (Phase 9 type colors); tap(mobile)/hover(desktop) → share % + type label.
- **D-19** Chart lib = **recharts (latest stable)** + thin themed wrappers (Area/Line/Bar/Pie) per DESIGN.md.
- **D-20** Bucket granularity adaptive, **monthly default**; `this month` + short custom (≤~62d) → daily cumulative; wealth series aggregates 3h snapshots to range bucket.
- **D-21** Sections + category selector default collapsed/none; range selector shared.

### Claude's Discretion (resolved by this research)

- **Pill label** = `"Overview"`.
- **Endpoint shape** = a small set of per-section query endpoints under `/budgets/:id/overview/*` (cards · planned · overspent-reserves · wealth), each independently range-parametrised + RQ-cached. Cards endpoint extends `get-budget-home-summary` but converts to `default_currency`. Rationale: sections are collapsed-by-default and range-scoped independently — separate query keys = separate SWR cache entries = lazy fetch only when a section opens / range changes.
- **"This-month overspent" card format** = top-N list (mirror `home-summary.top_overspent`) + a count badge.
- **Ledger index** = add a `(budget_id, category_id, confirmed_at)` partial index for fast monthly-bucket aggregation of confirmed transactions.

### Deferred (OUT OF SCOPE)

- Daily/yearly recurring cadence engine changes; per-user display-currency Overview view; finer/back-filled wealth history.

---

## Phase Requirements

ROADMAP maps Phase 11 to `OVW-*` (not separately enumerated — no 11-SPEC). The **coverage contract is the decision set D-01…D-21 + the 9 ROADMAP success criteria (SC1…SC9)**. The Decision-Coverage gate (plan-phase §13a) tracks D-IDs against plan `must_haves`. Each plan below cites the D-IDs + SCs it satisfies.

| SC                                                                           | Plan(s)                                                         |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| SC1 overview pill first, pushState/prefetch/no-RSC, 375px no h-scroll        | 11-08                                                           |
| SC2 five cards in default_ccy                                                | 11-03 (service) + 11-08 (UI)                                    |
| SC3 four collapsed sections + shared range + bucket rules                    | 11-09                                                           |
| SC4 Planned: category selector + planned-vs-real + planned-avg + 2 recurring | 11-04 (service) + 11-09 (UI)                                    |
| SC5 Overspent total + by-category bar (after-reserves) + Reserves bar        | 11-05 (service) + 11-09 (UI)                                    |
| SC6 archived in history, excluded from current                               | 11-03, 11-04, 11-05                                             |
| SC7 Wealth: toggle + grow/loss + monthly-avg + series + MoM + pie            | 11-06 (service) + 11-07 (cron) + 11-09 (UI)                     |
| SC8 3h snapshot cron + compute-on-read + invalidation correctness            | 11-01 (table) + 11-07 (cron) + 11-03/04/05/06 (compute-on-read) |
| SC9 recharts + responsive/themed + EN/PL/UK + E2E Gherkin                    | 11-02 + 11-10                                                   |

---

## Architectural Responsibility Map

```
apps/web (Next 16 / React 19)
  src/lib/bdp-tabs.ts ............ TAB_ORDER ← prepend "overview"  [11-08]
  src/components/budgeting/
    budget-detail.tsx ............ TabPane switch ← add "overview" case  [11-08]
    overview/ (NEW) .............. cards + 4 sections + selectors  [11-08,11-09]
    charts/ (NEW) ............... recharts themed wrappers (use client)  [11-02]
  src/hooks/use-overview-*.ts (NEW) RQ hooks per section  [11-08,11-09]
  src/hooks/use-prefetch-budget-tabs.ts ← add overview to priority tier  [11-08]
  messages/{en,pl,uk}.json ...... bdp.tab.overview.*  [11-10]

apps/api
  src/routes/overview-*.ts (NEW) . cards/planned/overspent-reserves/wealth  [11-03..06]
  src/boot.ts ................... wire new services (closure DI)  [11-03..06]

packages/budgeting (hexagonal)
  src/application/get-overview-*.ts (NEW) compute-on-read services  [11-03..06]
  src/application/compute-budget-wealth-now.ts (NEW) shared primitive  [11-03]
  src/adapters/persistence/
    budget-wealth-snapshots-schema.ts (NEW) Drizzle table + RLS  [11-01]
    overview-repo.ts (NEW) ...... multi-month aggregation queries  [11-04,11-05,11-06]

apps/worker
  src/handlers/budget-wealth-snapshot-3h.ts (NEW)  [11-07]
  src/worker.ts ← createQueue + schedule("0 */3 * * *") + register  [11-07]

drizzle/0049_phase11_budget_wealth_snapshots.sql (NEW) + meta/_journal.json  [11-01]
apps/migrator/post-migration.sql ← FORCE RLS for new table  [11-01]
```

---

## Concrete Interface Signatures (verified 2026-06-28)

### Reusable application services (compute-on-read sources)

**`get-budget-home-summary.ts`** — `packages/budgeting/src/application/`

```ts
export function getBudgetHomeSummary(
  deps: GetBudgetHomeSummaryDeps,
): (input: {
  budgetId: string;
  userId: string;
  now: Date;
}) => Promise<Result<HomeSummaryDTO, Error>>;
// HomeSummaryDTO = { budgetId, name, kind, default_currency, display_currency,
//   spent_current_month:{amount_cents:string,currency}, wallets_value_display_ccy:{amount_cents,currency,converted_at},
//   top_overspent: {category_id,category_name,over_amount_cents:string}[] }
// summaryRepo port: getBudgetMeta(budgetId), sumCurrentMonthSpend(budgetId,monthStart,monthEnd):bigint,
//   listWalletsForBudget(budgetId): {amount_cents:bigint,currency}[]  ⚠ NO wallet_type today,
//   topOverspentCategories(budgetId,monthStart,monthEnd,useCushion,limit): {category_id,category_name,over_amount_cents:bigint}[]
// ⚠ Converts to display_currency. Overview needs default_currency (D-11) → new cards service, do NOT mutate home-summary.
// FX pattern: collect distinct (from→to) pairs → Promise.all rateAsOf → Money.mul(rate) → sum → toString().
```

**Implication for 11-03:** extend `listWalletsForBudget` (or add `listWalletsWithType`) to return `wallet_type` so cards can filter `SPENDINGS` / `RESERVE` / sum-ALL.

**`get-spendings-summary.ts`** — single-month planned-vs-real per category.

```ts
export function getSpendingsSummary(
  deps,
): (input: {
  tenantId;
  budgetId;
  month: string; /*YYYY-MM*/
}) => Promise<Result<SpendingsSummaryDTO, Error>>;
// SpendingsSummaryDTO = { month, budgetCurrency, budgetTz, cushionModeEnabled,
//   categories: { categoryId,name,iconKey,colorKey,sortIndex,
//     plannedCents,cushionCents,activeBudgetCents,spentCents,reserveUsedCents,
//     reserveAvailableCents,reserveExcluded,archived,overspentCents,balanceCents }[] }  // all *Cents are strings
// ⚠ SINGLE MONTH ONLY. 11-04 multi-month timeline = new overview-repo query, NOT N× this service (N round-trips).
//   But the per-month math (activeBudget = cushion vs normal by mode; spent = confirmed; overspent = overage − reserveUsed)
//   is the canonical formula to replicate in SQL across months.
```

**`get-reserves-summary.ts`**

```ts
export function getReservesSummary(
  deps,
): (input: {
  tenantId;
  budgetId;
}) => Promise<Result<ReservesSummaryDto, Error>>;
// rows: { categoryId,name,colorKey, reserveCents,usedCents,usedThisMonthCents,overspentCents }[]  (strings)
// totals: { internalCents, userDefinedCents /*Σ RESERVE wallets, FX-converted*/, surplusCents, direction, usedCents, usedThisMonthCents, disabled, budgetCurrency }
// → Reserves-by-category bar = rows[].reserveCents.  Available-reserves CARD = totals.userDefinedCents (already default-ccy).
// View under the hood: budgeting.category_reserve_balance — CURRENT model is migration 0030 (CONTEXT's 0023 ref is stale;
//   view evolved 0013→0014→0017→0020→0023→0030). Use the SERVICE, never the raw view, to stay model-correct.
```

**`get-cushion-summary.ts`**

```ts
export function getCushionSummary(deps: {
  fxProvider;
}): (input: {
  tenantId;
  budgetId;
}) => Promise<Result<CushionSummaryDTO, Error>>;
// CushionSummaryDTO = { required_cents, actual_cents, shortfall_cents, currency /*default_ccy*/, enabled, target_months:number }
// D-08: card total = actual_cents; real months = actual_cents ÷ (required_cents ÷ target_months). No new math.
```

**`fx-provider.ts`** — `packages/shared-kernel/src/ports/`

```ts
export interface FxProvider {
  rateAsOf(
    from: Currency,
    to: Currency,
    date: Date,
  ): Promise<{ rate: string; provider: string; isStale: boolean }>;
}
// rateAsOf(X,X,_) short-circuits to rate "1". Parallelise distinct pairs (home-summary pattern).
```

**Investments valuation (for capitalization + wealth investment value)** — `packages/investments/src/`

```
application/list-holdings.ts ......... lists holdings (quantity, current_price_cents, current_price_currency, holding_type, archived_at)
domain/portfolio-metrics.ts .......... portfolio value math — REUSE for Σ(quantity × current_price) per holding
adapters/persistence/holding-repo.ts . holdings query
lib (apps/web)/investment-icons.ts:42  UI_TYPE_COLOR map + holdingIcon() (metal-aware) — pie colors (D-18)
```

`computeBudgetWealthNow(budgetId)` (NEW, 11-03) returns `{ capitalization_cents, investment_value_cents, currency }` in default_ccy:
`investment_value_cents = Σ(quantity × current_price_cents, FX→default_ccy)` over non-archived holdings;
`capitalization_cents = Σ all wallet balances (FX→default_ccy) + investment_value_cents`.
Shared by the capitalization card (11-03), the wealth live point (11-06), and the snapshot cron (11-07) — author ONCE.

### Route + DI conventions

- Routes in `apps/api/src/routes/*.ts`; bigint→string via `.toString()` at the handler boundary before `c.json()`.
- Header `X-Budget-ID` carries budget id; `tenantId === budgetId` (v1.1 invariant).
- Services wired in `apps/api/src/boot.ts` via closure-factory DI (`getX({ repo, fxProvider, ... })`).
- Drizzle queries ONLY in `packages/<ctx>/src/adapters/persistence/`; domain stays Drizzle-free; `Money` ↔ `{amount_cents,currency}` at boundary.
- Tenant tx helpers (`packages/platform/src/db/tx.ts`): `withTenantTx(TenantId, UserId, cb)` (write, sets `app.tenant_ids` GUC), `withTenantTxRead(...)`, `withInfraTx(cb)` (cross-tenant, worker_role, no RLS — for the budget scan).

---

## Persistence Schema Design

### New table — `budgeting.budget_wealth_snapshots` (migration 0049)

```sql
CREATE TABLE IF NOT EXISTS budgeting.budget_wealth_snapshots (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  budget_id             uuid NOT NULL REFERENCES tenancy.budgets(id) ON DELETE CASCADE,
  captured_at           timestamptz NOT NULL DEFAULT now(),
  capitalization_cents  bigint NOT NULL,
  investment_value_cents bigint NOT NULL,
  currency              char(3) NOT NULL
);
-- one row per budget per ≤3h tick; idempotency guard so a re-run in the same bucket can't double-insert:
CREATE UNIQUE INDEX IF NOT EXISTS budget_wealth_snapshots_bucket_uidx
  ON budgeting.budget_wealth_snapshots (budget_id, date_trunc('hour', captured_at));   -- ponytail: hour-bucket dedup; tighten if 3h exact needed
CREATE INDEX IF NOT EXISTS budget_wealth_snapshots_series_idx
  ON budgeting.budget_wealth_snapshots (budget_id, captured_at);
ALTER TABLE budgeting.budget_wealth_snapshots ENABLE ROW LEVEL SECURITY;
-- pgPolicy mirrors recurring-rules / wallets exactly:
CREATE POLICY budget_wealth_snapshots_tenant_isolation ON budgeting.budget_wealth_snapshots
  AS PERMISSIVE FOR ALL TO app_role, worker_role
  USING      (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));
```

Drizzle schema file `packages/budgeting/src/adapters/persistence/budget-wealth-snapshots-schema.ts` mirrors
`recurring-rules-schema.ts` (`budgeting.table(...)` + `pgPolicy(...)` + `to:[appRole, workerRole]`). FORCE RLS asserted in `apps/migrator/post-migration.sql`. Hand-author the SQL + a manual `drizzle/meta/_journal.json` entry (drizzle-kit BigInt-serialisation bug — same precedent as 0038).

### Ledger index for monthly-bucket aggregation (11-01)

`CREATE INDEX IF NOT EXISTS transactions_budget_cat_confirmed_idx ON budgeting.transactions (budget_id, category_id, confirmed_at) WHERE confirmed_at IS NOT NULL;`
(confirmed-only multi-month spend rollups for the Planned/Overspent timelines — D-12.)

### Effective-dated sources (read for the multi-month math)

- `category-limits-schema.ts` — SCD-2: `normal_amount`/`cushion_amount` bigint + currencies, `effective_from/to`. (also `cushion_amount_cents` parallel col)
- `budget-mode-history-schema.ts` — `mode` NORMAL|CUSHION, `effective_from/to` → which limit was active per month.
- `recurring-rules-schema.ts` — `cadence` **CHECK allows DAILY|WEEKLY|MONTHLY|YEARLY** (see Pitfall 2), `amount` numeric, `currency`, `category_id`, `active`, `weekly_dow`, `yearly_month`, `cadence_anchor`.
- `categories` — `archived_at` (D-06).

---

## Standard Stack

### New dependency

| Dep        | Version                   | Note                                                                                                                      |
| ---------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `recharts` | **3.9.0** (latest stable) | peerDeps allow React 19 ✓; add to `apps/web/package.json`. NOT currently installed (only `placeholder-chart.tsx` exists). |

Already installed (verified `apps/web/package.json`): Next `^16.2.9`, React `^19`, `@tanstack/react-query ^5`, `motion ^12.40`, `idb` (RQ persister).

### recharts × Next 16 App Router (context7 + npm)

- `ResponsiveContainer` uses `ResizeObserver` → **every chart wrapper must be `"use client"`** (no RSC). Wrap each chart in `<ResponsiveContainer width="100%" height={...}>`.
- v3: `accessibilityLayer` is **on by default** (keyboard + SR) — don't re-add.
- Pie tap(mobile)/hover(desktop) reveal (D-18): control an `activeIndex` state; `<Pie shape={({isActive,...p}) => <Sector {...p} fill={isActive?accent:p.fill}/>} />` + `<Tooltip defaultIndex={activeIndex}/>`. Hover works natively; tap sets `activeIndex`.
- Theme via DESIGN tokens (`--surface-card-dark`, `--hairline-dark`, single yellow accent) — pass colors as props, not hard-coded hex (except the Phase-9 `UI_TYPE_COLOR` map for the type pie).

### Don't hand-roll

- Charts → recharts. FX → `FxProvider`. Cushion/reserves/spendings math → existing services. Caching → persisted RQ. Cron → pg-boss `schedule`. Tenant GUC → `withTenantTx`.

---

## Frontend frame (verified)

- `bdp-tabs.ts` → `TAB_ORDER = ["wallets","spendings","reserves","settings"]`; prepend `"overview"`. `isBdpTab` is called by the **server** page → keep `bdp-tabs.ts` a non-client lib.
- `budget-detail.tsx` (client carousel): `TabPane` switch (≈L43-70) maps `BdpTab`→component; `select()` does `window.history.pushState(...)` (zero RSC); `popstate` listener mirrors back; `AnimatePresence` directional slide by tab index. Add `case "overview": <OverviewTab/>`.
- `[[...tab]]/page.tsx` (server catch-all) validates via `isBdpTab`, redirects bare → wallets, seeds `initialTab`.
- `use-prefetch-budget-tabs.ts` — two tiers (priority fires immediately, deferred chains after). Add overview **cards** key to priority; section keys stay lazy (collapsed-by-default).
- `placeholder-chart.tsx` — reuse card frame: `rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border-y border-[var(--hairline-dark)] … minHeight 240px`.
- RQ: `QueryClient staleTime 30_000, refetchOnWindowFocus:false`; persister `idb` (`query-persist.ts`); hooks = `useQuery({ queryKey:["budget",budgetId,…], queryFn: clientApiFetch(...,{headers:{"X-Budget-ID":budgetId}}), networkMode:"online" })`; mutations `qc.invalidateQueries`.

---

## Common Pitfalls

1. **`home-summary` converts to display_currency.** Overview is default_currency (D-11). Build a NEW cards service; do not flip home-summary (would break the home page).
2. **`recurring_rules` cadence CHECK = DAILY|WEEKLY|MONTHLY|YEARLY** (live schema), even though CONTEXT's deferred note assumed only MONTHLY/WEEKLY. The recurring-per-month chart MUST normalise every cadence to a monthly figure (`DAILY→×~30.44`, `WEEKLY→×~4.345`, `MONTHLY→×1`, `YEARLY→÷12`) or it will silently drop/under-count daily/yearly rules. Test all 4 cadences.
3. **`category_reserve_balance` view has changed 6×** (latest = migration 0030). Never query the raw view — use `get-reserves-summary`.
4. **`listWalletsForBudget` returns no `wallet_type`.** Cards need per-type sums (SPENDINGS / RESERVE / ALL) → extend the repo row with `wallet_type` (one extra column in the SELECT).
5. **Multi-month timeline = ONE SQL aggregation, not N× single-month service calls.** N round-trips per range = slow + N× FX. Build a multi-month `overview-repo` query grouping confirmed spend by `(category_id, month)` joined to the SCD-2 limit active that month.
6. **Bigint serialisation** — keep cents as `bigint` through the service; `.toString()` only at the route boundary. recharts needs Numbers → convert string→Number in the FE hook/selector, not the API.
7. **Worker runs outside a request** — the snapshot handler must `withInfraTx` to scan distinct budgets, then `withTenantTx(TenantId(budgetId), UserId(SYSTEM_USER_ID), …)` per budget so RLS GUC is set; never write cross-tenant in one tx.
8. **Snapshot idempotency** — a re-run inside the same bucket must not double-insert: `INSERT … ON CONFLICT (budget_id, date_trunc('hour',captured_at)) DO NOTHING` against the unique index.
9. **375px no horizontal scroll** (SC1) — cards grid + charts must be `ResponsiveContainer width="100%"`; test at iPhone-SE width.
10. **Archived categories** (D-06) — include where `archived_at IS NULL OR archived_at > month_end` for a given bucket; exclude from current-month cards. A naive `WHERE archived_at IS NULL` rewrites history (rejected by D-06).

---

## Code Examples (verified patterns from codebase)

**pg-boss schedule + register (worker.ts):**

```ts
await boss.createQueue("budget-wealth-snapshot-3h");
await boss.schedule("budget-wealth-snapshot-3h", "0 */3 * * *", null, {
  tz: "Europe/Berlin",
});
registerBudgetWealthSnapshot3h(boss, fxProvider); // boss.work(queue, async () => run(...))
```

**Per-budget worker iteration (mirror budgeting-reconciliation.ts):**

```ts
const { value: budgets } = await withInfraTx(async (tx) => {
  const r = await (tx as any).execute(
    sql`SELECT DISTINCT id AS budget_id, tenant_id FROM tenancy.budgets`,
  );
  return r.rows as { budget_id: string; tenant_id: string }[];
});
for (const b of budgets) {
  await withTenantTx(
    TenantId(b.tenant_id),
    UserId(SYSTEM_USER_ID),
    async (tx) => {
      const now = await computeBudgetWealthNow(b.budget_id /*deps*/); // {capitalization_cents, investment_value_cents, currency}
      await (tx as any).execute(sql`
      INSERT INTO budgeting.budget_wealth_snapshots (tenant_id,budget_id,capitalization_cents,investment_value_cents,currency)
      VALUES (${b.tenant_id},${b.budget_id},${now.capitalization_cents},${now.investment_value_cents},${now.currency})
      ON CONFLICT (budget_id, date_trunc('hour', captured_at)) DO NOTHING`);
    },
  );
}
```

**RLS pgPolicy (recurring-rules-schema.ts → copy verbatim):**

```ts
pgPolicy("budget_wealth_snapshots_tenant_isolation", {
  as: "permissive",
  for: "all",
  to: [appRole, workerRole],
  using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
  withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
});
```

---

## Validation Architecture

### Test Framework

| Layer                                  | Tool                     | Location                                                      |
| -------------------------------------- | ------------------------ | ------------------------------------------------------------- |
| Domain/application unit                | `bun:test`               | `packages/budgeting/test/`                                    |
| Route + DB integration (real Postgres) | `bun:test`               | `apps/api/test/routes/`                                       |
| Component                              | Vitest + RTL + happy-dom | `apps/web/test/components/budgeting/overview/`                |
| E2E (Gherkin)                          | Playwright-BDD           | `apps/web/e2e/features/overview.feature` + steps/page-objects |

Quick: `make test` · Component: `cd apps/web && bun run test` · E2E: `make test-e2e` (BDD). 80% domain threshold (`bunfig.toml`) — do not lower.

### Phase Requirements → Test Map (per plan)

| Plan                       | Type    | Primary tests                                                                                                                                               |
| -------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11-01 schema+migration     | execute | `make migrate` exits 0; `to_regclass('budgeting.budget_wealth_snapshots')` non-null; ci-gate tenant-leak picks up new RLS table                             |
| 11-02 recharts wrappers    | execute | Vitest renders each wrapper in happy-dom without throwing; `recharts` resolves                                                                              |
| 11-03 cards + wealth-now   | **tdd** | unit: default_ccy conversion, wallet_type sums, capitalization incl. investments, cushion real-months; integration: `GET /budgets/:id/overview/cards`       |
| 11-04 planned section      | **tdd** | unit: multi-month planned-vs-real (mode-active limit, confirmed-only), planned-avg over active months, 4-cadence recurring normalisation; integration route |
| 11-05 overspent+reserves   | **tdd** | unit: after-reserves overspent per month, by-category bar, reserves-by-category; archived-in-history; integration route                                     |
| 11-06 wealth series        | **tdd** | unit: bucket aggregation + live current point, grow/loss %, monthly-avg grow, MoM dynamics, per-type pie data; integration route                            |
| 11-07 snapshot cron        | execute | integration: handler inserts one row/budget in default_ccy; ON CONFLICT idempotent; GUC set per budget                                                      |
| 11-08 tab shell + cards UI | execute | component: cards render + default_ccy; E2E golden render @overview                                                                                          |
| 11-09 sections + charts UI | execute | component: collapse, range switch, category selector, wealth toggle, pie tap; E2E                                                                           |
| 11-10 i18n + E2E           | execute | i18n keys present EN/PL/UK (icu test); E2E full Gherkin suite green                                                                                         |

### Sampling Rate

- After each task commit: `make test` (changed package) / `cd apps/web && bun run test` (FE).
- After each wave: full `make test` + `make ci-gate` (tenant-leak — new RLS table must pass).
- Before verify: `make test-e2e` green.

### Wave 0 Gaps

- recharts not installed → 11-02 installs it (its first task).
- New E2E `overview.feature` + page object → created in 11-10 (and golden scenario stubbed in 11-08).

---

## Security Domain

### Applicable ASVS (L1)

- **V4 Access Control / tenant isolation** — new `budget_wealth_snapshots` table is tenant-scoped; RLS pgPolicy + FORCE RLS + ci-gate tenant-leak coverage (mirrors every budgeting table).
- **V5 Validation** — range selector inputs (`from`/`to`/preset) validated server-side (Zod) before SQL; reject inverted/oversized ranges.
- **V8 Data Protection** — amounts are financial; default_ccy conversion server-side; no cross-budget leakage via the cron (per-budget `withTenantTx`).

### Known threat patterns

| ID      | STRIDE                 | Surface                                  | Mitigation                                                                                                                                                |
| ------- | ---------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-11-01 | Information Disclosure | `budget_wealth_snapshots` rows           | RLS pgPolicy `tenant_id = ANY(app.tenant_ids)` (copied verbatim) + FORCE RLS in post-migration.sql + ci-gate tenant-leak.                                 |
| T-11-02 | Information Disclosure | 3h cron writing all budgets              | `withInfraTx` only to scan; each write inside `withTenantTx(budgetId)` so GUC scopes RLS to one tenant; never bulk cross-tenant insert.                   |
| T-11-03 | Tampering / Injection  | range + category query params            | Zod-validate (`from<=to`, span cap, category belongs to budget) before parametrised SQL; no string interpolation into SQL.                                |
| T-11-04 | DoS                    | unbounded `all`/custom range aggregation | monthly-bucket aggregation index `(budget_id, category_id, confirmed_at)`; cap custom span; sections lazy (collapsed) so heavy queries fire only on open. |
| T-11-05 | Elevation / IDOR       | overview endpoints                       | `X-Budget-ID` + membership check (existing route middleware) + RLS; tenantId === budgetId invariant.                                                      |

---

## Sources

### Primary (HIGH)

- Live tree reads (2026-06-28): `get-budget-home-summary.ts`, `get-spendings-summary.ts`, `get-reserves-summary.ts`, `get-cushion-summary.ts`, `fx-provider.ts`, `investment-snapshot-daily.ts`, `worker.ts`, `budgeting-reconciliation.ts`, `recurring-rules-schema.ts`, `category-limits-schema.ts`, `budget-mode-history-schema.ts`, `0038_phase09_investments.sql`, `bdp-tabs.ts`, `budget-detail.tsx`, `use-prefetch-budget-tabs.ts`, `placeholder-chart.tsx`, `investment-icons.ts`, `query-provider.tsx`, `query-persist.ts`.
- `.planning/phases/11-budget-overview/11-CONTEXT.md` (D-01…D-21).
- `.planning/ROADMAP.md` §Phase 11 (SC1…SC9).

### Secondary (MEDIUM)

- recharts npm dist-tags (`latest = 3.9.0`, React-19 peer) + context7 `/recharts/recharts` (ResponsiveContainer/ResizeObserver, v3 accessibilityLayer, Pie `shape`+`Tooltip defaultIndex` highlight).

### Tertiary (verify during execution)

- Exact `portfolio-metrics.ts` valuation signature (reuse for investment value) — confirm in 11-03 read_first.

---

## RESEARCH COMPLETE

10 plans across 3 waves; TDD on the 4 compute-on-read services (11-03..06); execute on schema/cron/UI/i18n. All D-IDs + SC1..SC9 mapped. Validation Architecture + Security Domain present (VALIDATION.md + threat models downstream).
