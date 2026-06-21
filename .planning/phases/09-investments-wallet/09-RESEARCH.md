# Phase 09: Investments Wallet — Research

**Researched:** 2026-06-21
**Domain:** Investment holdings, price provider ports, instrument search, pg-boss jobs, DnD group semantics
**Confidence:** HIGH (all patterns verified against live codebase; API limits from official sources)

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 (storage shape):** New dedicated `investments` table. `INVESTMENTS` does NOT join `wallet_type` enum.
**D-02 (instrument identity):** Shared `instruments` reference table (`id, provider, symbol, asset_class, display_name`, active/delisted flag). Holdings FK to `instrument_id` (null = custom). Price-cache and daily snapshot key on `instrument_id`. Hourly cron = `SELECT DISTINCT instrument_id FROM investments`.
**D-03 (delete):** Soft-archive (`archived_at`), no in-app restore. "This can't be undone here."
**D-04 (search resolution):** Pure local pre-seeded `instruments` index (Postgres). Provider called only on price-miss. Not-in-list → custom.
**D-05 (universe breadth):** Major markets only — US + major EU exchanges, top crypto by market cap, precious-metal (gold/silver) coins, plain currencies (cash). Long-tail excluded.
**D-06 (refresh cadence):** Daily reference-data pg-boss job upserts new listings and flags delistings.
**D-07 (match + rank):** Symbol prefix + display-name substring; rank exact-symbol > symbol-prefix > name-match; ~10–20 rows; trigram index; ≥2 char min.
**D-08 (suggestion row):** Symbol + name + asset-class chip; exchange/quote-ccy for tie-breaking; selecting auto-fills `type`.
**D-09 (delisting):** Held instrument gone from daily feed → flag inactive, keep holding, freeze last price, stop cron, render delisted label + dimmed row, emit `INVESTMENT_INSTRUMENT_DELISTED` task.
**D-10 (new Task type):** `INVESTMENT_INSTRUMENT_DELISTED`. One task per affected holding. Resolves on archive or switch to custom. Reuses Phase 7 subsystem.
**D-11 (sheet spine):** Single scrolling form, search-driven name field at top.
**D-12 (price editability):** Tracked = read-only current price. Custom = editable.
**D-13 (currency model):** Buy currency defaults to instrument quote currency (editable). Current price ALWAYS shown in buy currency (FX-converted). Per-holding single-currency view. Native price + FX rate captured for daily snapshot.
**D-14 (required fields):** name, type, quantity, buy price, current price (group optional). Custom prefills current price to buy price. Cash exception: amount + currency only.
**D-15 (quantity):** Fractional/crypto-grade via big.js. Comma AND dot decimal separators on ALL numeric fields.
**D-16 (type picker):** Dropdown with lucide icon + translated label per 9-enum value; preselected from suggestion, editable.
**D-17 (group field):** Combobox — filters existing group names + free-type new name.
**D-18 (save/close):** Optimistic save via `clientApiWrite`; discard-confirm on dirty close.
**D-19 (delete/row actions):** Delete in sheet footer + row actions: desktop hover trash+pen, mobile swipe-left Edit+Delete. Reuse `wallet-row.tsx` swipe primitive, extend Delete-only → Edit+Delete.
**D-21 (row layout):** Same style as wallets. Desktop single line. Mobile: name+currency+value; tap expands to P/L%+weight%.
**D-22 (P/L color):** Green up / red down using `--trading-up`/`--trading-down` tokens. Documented exception to single-yellow.
**D-23 (weight render):** Plain number.
**D-24 (group headers):** Collapsible; localStorage keyed `inv-group-{budgetId}-{groupSlug}`; default expanded.
**D-25 (price state chrome):** No "pending", no "stale". Save blocks on no-price. Only price state: delisted.
**D-26 (empty/add):** Header + dashed "+ Add investment" (NOT yellow). No helper copy.
**D-27 (sort order):** Manual drag order only; new holdings append to end of group.
**D-28 (number formatting):** Same rules as wallets — `Money` / `Intl.NumberFormat` helpers.
**D-29 (DnD):** Reuse `<RowDragHandle>` + `@dnd-kit`. Three mobile gestures coexist (tap-expand / swipe-actions / long-press-drag); disambiguate via TouchSensor `{delay:300, tolerance:5}`. Cross-wallet-section drop rejected.
**D-30 (daily snapshot):** Base-anchored daily snapshot — each in-use currency vs EUR anchor; each held instrument's daily last price. Extends existing `fx-daily-fetch` pair collection.
**D-31 (cash balances):** Cash (type `cash_fx`) = amount + currency, value-only, no P/L. Simplified sheet.
**D-32 (custom-only types):** `real_estate` and `other` always custom path. Quantity defaults to 1.

**Amendments (authoritative):**

- **A1:** `INVESTMENT_INSTRUMENT_DELISTED` Task type in scope (one per holding).
- **A2:** No pending/stale price states. Price required to save; block on no-price.
- **A3:** Cash balances in scope (value-only). Traded forex positions deferred.

### Claude's Discretion

- Section icon: `TrendingUp` lucide (Coins=Reserves, Wallet=Wallets are taken).
- i18n namespace: `budget.investments.*` across EN/PL/UK.
- Search min-char threshold: ≥2.
- Collapsed-group localStorage state per budget.
- Concrete free-API vendor selection + rate limits + seed feeds.
- Rate-limit enforcement point (middleware vs repo) and exact price-cache/snapshot table columns.

### Deferred Ideas (OUT OF SCOPE)

- Charts / capitalization graphs / time-series visualization.
- Global net-worth / portfolio total on Home/BDP shell.
- Investment buy/sell ledger, tax lots, dividends, fees, cost-basis averaging.
- Brokerage / open-banking sync, auto-updating quantity, sub-hourly prices, paid price tiers.
- Manual price override for tracked instruments.
- Traded forex positions (deferred; cash balances only this phase).
- "Show archived holdings" toggle.
- PL/UK translation-quality review.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                                                                                                | Research Support                                                                                                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| INV-01 | `investments_enabled` per-budget boolean flag; Settings toggle + onboarding wizard + DTO + conditional render              | Verified: `reserves_enabled` pattern in `tenancy/schema.ts:43`; `cushion-section.tsx` Switch pattern; `step-features.tsx` FeatureRow pattern |
| INV-02 | Investments section as last section on wallets page; absent when flag off                                                  | Verified: `wallets-sectioned-list.tsx:377-407` conditional map pattern; add after RESERVE                                                    |
| INV-03 | Holding record + fields (name, type, group, buy price/currency, quantity, current price, instrument ref, sort_order) + RLS | Verified: new `investments` table (D-01); pattern from `wallets-schema.ts`                                                                   |
| INV-04 | Type enum: 9 values locked; enforced in domain + persistence                                                               | Verified: text+CHECK pattern from `wallets-schema.ts:39-43`                                                                                  |
| INV-05 | Group free-text, autocomplete, visual grouping                                                                             | Research complete; combobox pattern via shadcn `<Command>`                                                                                   |
| INV-06 | Side-Sheet only editing; no inline edit                                                                                    | Verified: `category-form-sheet.tsx` pattern confirmed as precedent                                                                           |
| INV-07 | Instrument search debounced (2s/blur), unified universe, custom fallback                                                   | Research complete: D-04 local Postgres `instruments` index; trigram via `pg_trgm`                                                            |
| INV-08 | Current-price → buy-currency FX conversion for P/L                                                                         | Verified: `FrankfurterFxProvider` + `FxProvider.rateAsOf` + `Money` in `shared-kernel/money.ts`                                              |
| INV-09 | Per-holding render: name, currency, total value, P/L%, weight%                                                             | Architecture complete; computation in domain layer                                                                                           |
| INV-10 | Grouped rendering; group headers; budget-default-currency weight denominator                                               | Architecture complete; FX conversion via existing `FxProvider`                                                                               |
| INV-11 | DnD: reorder within section, group reassignment, whole-group reorder, cross-section reject                                 | Verified: `@dnd-kit` sensors already calibrated in `wallets-sectioned-list.tsx:152-158`                                                      |
| INV-12 | `PriceProvider` port + free-API adapters (equities/ETF, crypto, FX, metals) + price-cache table                            | Research complete: Twelve Data (8 req/min free), CoinGecko (Demo: 30 req/min), metals.dev (100 req/month CRITICAL LIMIT)                     |
| INV-13 | Hourly cron — held instruments only; reference-data scope                                                                  | Verified: pg-boss pattern from `worker.ts:44-49`; reference-data `withInfraTx` pattern from `fx-daily-fetch.ts`                              |
| INV-14 | Instant rate-limited fetch on add (10/user/min); overflow defers to hourly                                                 | Architecture: rate-limit enforcement at API route layer using per-user Redis-free counter (see Pitfalls)                                     |
| INV-15 | Daily snapshot (price + FX) for future charts; append-only                                                                 | Verified: `fx-daily-fetch.ts` pattern; extend pair collection; new `instrument_price_snapshots` table                                        |
| INV-16 | React-Query client caching with optimistic create/edit/reorder                                                             | Verified: `clientApiWrite` + `["budget", id, "investments"]` key; `use-wallets` hook pattern                                                 |

</phase_requirements>

---

## Summary

Phase 9 builds a feature-flagged Investments section as the last panel on the Wallets tab. The domain is 100% greenfield on the backend (no `PriceProvider`, no `instruments` table, no holdings, no price cache), while the frontend reuses every major primitive from Phases 4–7: the side Sheet, `@dnd-kit` sensors (already calibrated at the exact values needed), `clientApiWrite` optimistic mutations, the `wallet-row.tsx` swipe primitive, and the feature-flag `Switch`/`FeatureRow` pattern.

The critical architectural decisions from the discuss-phase are fully locked and well-researched: a separate `investments` table (not extending `wallets`), a shared `instruments` reference table with a local Postgres search index (never calls a price provider for search), three pg-boss jobs (hourly price fetch, daily snapshot, daily instrument seed/delisting check), and a `PriceProvider` port with three free-tier adapters.

**Primary recommendation:** The metals.dev free plan (100 req/month) is dangerously constrained for an hourly cron — at 2 precious-metal symbols (XAU, XAG) the hourly job exhausts the quota in ~50 hours. The plan must either use metals-api.com (which has more generous free limits) or gate metals price refresh to the daily-only job with no on-add instant fetch for metals. This is the one concrete free-API vendor constraint that must be addressed before execution.

---

## Architectural Responsibility Map

| Capability                                | Primary Tier                                          | Secondary Tier           | Rationale                                                       |
| ----------------------------------------- | ----------------------------------------------------- | ------------------------ | --------------------------------------------------------------- |
| `investments_enabled` flag storage        | Database (Postgres `tenancy.budgets`)                 | —                        | Mirrors `reserves_enabled`/`cushion_enabled` columns            |
| Holdings CRUD + RLS                       | API (`/investments` routes + Drizzle adapter)         | Database (RLS pgPolicy)  | All user-scoped data goes through API + tenant isolation        |
| Instrument search                         | API (Postgres trigram query on `instruments`)         | —                        | Local index only; never provider; works offline                 |
| Current-price fetch (on-add)              | API (rate-limited instant fetch endpoint)             | Worker (hourly fallback) | Request-scoped rate limit; fallback to cron                     |
| Hourly price refresh cron                 | Worker (pg-boss `instrument-price-hourly`)            | —                        | Reference-data scope; `withInfraTx`; no per-tenant iteration    |
| Daily instrument seed/delist job          | Worker (pg-boss `instruments-daily-seed`)             | —                        | Reference-data scope; same pattern as `fx-daily-fetch`          |
| Daily price + FX snapshot job             | Worker (pg-boss `investment-snapshot-daily`)          | —                        | Append-only history; extends `fx-daily-fetch` pair collection   |
| P/L + weight computation                  | API (domain entity method)                            | —                        | Pure math; tested in domain; no DB call needed                  |
| FX conversion (P/L in buy ccy)            | API (via existing `FxProvider.rateAsOf`)              | —                        | Reuse existing `FrankfurterFxProvider` + `fx_rates` cache       |
| Portfolio weight denominator (budget ccy) | API (via existing `FxProvider.rateAsOf`)              | —                        | Same FX path; no new infrastructure                             |
| Delisted task emission                    | Worker (daily seed job detects; emits via `TaskRepo`) | —                        | Analogous to RESERVE_TOPUP emission pattern                     |
| Investments section render                | Frontend (client island in wallets tab)               | —                        | `investments_enabled` read from `useBudget`; conditional render |
| Group collapse state                      | Frontend (localStorage per budgetId + groupSlug)      | —                        | Client-only UX state; no server roundtrip                       |
| DnD reorder + group reassignment          | Frontend (optimistic) + API (persist)                 | —                        | `clientApiWrite` optimistic + `/investments/reorder` endpoint   |

---

## Standard Stack

### Core (all already installed — verified in `apps/web/package.json` / monorepo)

| Library                 | Version                                                 | Purpose                                            | Why Standard                                         |
| ----------------------- | ------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| `@dnd-kit/core`         | 6.3.1 [VERIFIED: apps/web/package.json]                 | DnD context, sensors, DragOverlay                  | Phase 4/5 pattern; sensor calibration already locked |
| `@dnd-kit/sortable`     | 10.0.0 [VERIFIED: apps/web/package.json]                | `useSortable` per holding row                      | Same version as wallets                              |
| `@tanstack/react-query` | ^5 [VERIFIED: factory pattern]                          | Client cache `["budget", id, "investments"]`       | All data hooks follow this pattern                   |
| `drizzle-orm`           | latest (project standard) [VERIFIED: wallets-schema.ts] | Schema + RLS `pgPolicy()`                          | Drizzle is the only ORM in this project              |
| `big.js`                | 7.0.1 [VERIFIED: npm view]                              | Crypto-grade fractional quantity + P/L math        | Already in `shared-kernel/money.ts`                  |
| `pg_trgm`               | Postgres extension [ASSUMED]                            | Trigram index for `instruments` symbol/name search | Standard Postgres extension; verify enabled in DB    |

### New Backend Packages (greenfield)

| Library                       | Version                                              | Purpose                  | When to Use                                            |
| ----------------------------- | ---------------------------------------------------- | ------------------------ | ------------------------------------------------------ |
| `node-fetch` / native `fetch` | Bun built-in [VERIFIED: frankfurter.ts uses `fetch`] | HTTP calls to price APIs | Already used by `FrankfurterFxProvider` — same pattern |

### Alternatives Considered

| Instead of                    | Could Use                    | Tradeoff                                                                                 |
| ----------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| metals.dev (100/month free)   | metals-api.com free tier     | metals-api.com has 100/month too — see Pitfall 3; best path: daily-only for metals       |
| Twelve Data free (800/day)    | Alpha Vantage (500/day free) | Twelve Data covers stocks + ETF + forex + crypto; Alpha Vantage stocks only              |
| Local Postgres trigram search | Algolia/Typesense            | Adds external service; local is sufficient for major-markets universe (~10K instruments) |

---

## Architecture Patterns

### System Architecture Diagram

```
User (browser)
    │ tap "+ Add investment"
    ▼
HoldingSheet (Next.js client island)
    │ type 2+ chars → debounce 2s / blur
    ▼
GET /api/investments/search?q= ──────────────────► instruments table (Postgres trigram)
    │ selects suggestion                              returns symbol+name+class+instrument_id
    │
    ├─ instrument_id set → GET /api/investments/price/:instrumentId
    │       │                    ├── price_cache hit → return cached price
    │       │                    └── price_cache miss → PriceProvider adapter → upsert cache → return
    │       │                         (rate-limited 10/user/min; block save on failure per A2)
    │       ▼
    └─ POST /api/investments  ──────────────────────► investments table (Drizzle + RLS)
            │                                          → optimistic update in React-Query
            │                                          → ["budget", id, "investments"] invalidate

Worker (pg-boss jobs)
    ├── instruments-daily-seed (0 18 * * *)
    │       └── Twelve Data /reference_data/symbol search
    │           + CoinGecko /coins/list
    │           + metals symbols (XAU, XAG)
    │           + currency list (ISO 4217)
    │           → upsert instruments table; flag missing active=false
    │           → SELECT held instruments with active=false → emit INVESTMENT_INSTRUMENT_DELISTED tasks
    │
    ├── instrument-price-hourly (0 * * * *)
    │       └── SELECT DISTINCT instrument_id FROM budgeting.investments WHERE archived_at IS NULL AND instrument_id IS NOT NULL
    │           → for each instrument_id: PriceProvider.currentPrice(symbol, provider)
    │           → upsert instrument_price_cache (instrument_id, price, currency, fetched_at)
    │           → return { fetched, failed }
    │
    └── investment-snapshot-daily (0 17 * * * Europe/Berlin, after fx-daily-fetch)
            ├── INSERT INTO instrument_price_snapshots SELECT instrument_id, price, currency, today
            │   FROM instrument_price_cache WHERE instrument_id IN (held set)
            └── Extend fx-daily-fetch pair collection:
                SELECT DISTINCT buy_currency, 'EUR' FROM budgeting.investments WHERE archived_at IS NULL
```

### Recommended Project Structure

```
packages/investments/           ← NEW bounded context package
├── src/
│   ├── domain/
│   │   └── holding.ts          ← Holding entity (plain class, no Drizzle)
│   ├── ports/
│   │   ├── holding-repo.ts     ← HoldingRepo port
│   │   ├── price-provider.ts   ← PriceProvider port (analogous to FxProvider)
│   │   └── instrument-repo.ts  ← InstrumentRepo port (search + upsert)
│   ├── adapters/
│   │   ├── persistence/
│   │   │   ├── investments-schema.ts       ← Drizzle schema
│   │   │   ├── instruments-schema.ts       ← Drizzle schema (reference data)
│   │   │   ├── price-cache-schema.ts       ← Drizzle schema (reference data)
│   │   │   ├── price-snapshot-schema.ts    ← Drizzle schema (append-only)
│   │   │   ├── holding-repo.ts             ← DrizzleHoldingRepo
│   │   │   └── instrument-repo.ts          ← DrizzleInstrumentRepo
│   │   └── price/
│   │       ├── twelve-data.ts              ← TwelveDataPriceProvider
│   │       ├── coingecko.ts                ← CoinGeckoPriceProvider
│   │       └── metals-dev.ts               ← MetalsPriceProvider (daily-only gate)
│   ├── application/
│   │   ├── create-holding.ts
│   │   ├── update-holding.ts
│   │   ├── archive-holding.ts
│   │   ├── list-holdings.ts
│   │   ├── reorder-holdings.ts
│   │   ├── search-instruments.ts
│   │   ├── fetch-instrument-price.ts       ← on-add instant fetch (rate-limited)
│   │   └── compute-portfolio-metrics.ts    ← value/PL/weight computation
│   └── contracts/
│       ├── api.ts                          ← Zod schemas
│       └── factory.ts                      ← InvestmentsModule DI factory

apps/api/src/routes/
└── investments.ts              ← Hono route factory (mirrors wallets.ts pattern)

apps/worker/src/handlers/
├── instrument-price-hourly.ts  ← NEW hourly price job
├── instruments-daily-seed.ts   ← NEW daily seed/delist job
└── investment-snapshot-daily.ts ← NEW daily snapshot job

apps/web/src/
├── components/budgeting/wallets-tab/
│   ├── investments-section.tsx         ← Client island (DndContext wrapper)
│   ├── investment-group-header.tsx     ← Collapsible group header
│   ├── investment-row.tsx              ← Single holding row
│   ├── investment-row-sheet.tsx        ← Row + swipe actions wrapper
│   ├── holding-sheet.tsx               ← shadcn Sheet form (add/edit)
│   ├── holding-delete-confirm.tsx      ← AlertDialog wrapper
│   ├── instrument-search-input.tsx     ← Debounced search with dropdown
│   ├── asset-class-chip.tsx            ← Small chip (Equity/ETF/Crypto/FX/Metal/Cash)
│   ├── type-dropdown.tsx               ← shadcn Select with icon+label
│   ├── group-combobox.tsx              ← shadcn Popover+Command combobox
│   └── price-blocked-banner.tsx        ← Inline banner (role="alert")
└── hooks/
    ├── use-investments.ts              ← React-Query hook (["budget", id, "investments"])
    ├── use-create-holding.ts
    ├── use-update-holding.ts
    ├── use-archive-holding.ts
    └── use-reorder-holdings.ts

drizzle/
└── 0038_phase09_investments.sql        ← Next migration (last is 0037)
```

### Pattern 1: Feature Flag in WalletsSectionedList

The `investments_enabled` flag follows the exact pattern of `reservesEnabled` and `cushionEnabled`. Read from `useBudget`, conditional render in the sectioned list.

```typescript
// Source: apps/web/src/components/budgeting/wallets-tab/wallets-sectioned-list.tsx:65-77
const budgetMeta = budgetQuery.data as { investmentsEnabled?: boolean; ... } | undefined;
const investmentsEnabled = budgetMeta?.investmentsEnabled ?? false;

// In the return JSX, after all WalletSection renders:
{investmentsEnabled && (
  <InvestmentsSection budgetId={budgetId} budgetCurrency={budgetCurrency} />
)}
```

Schema addition in `packages/tenancy/src/adapters/persistence/schema.ts`:

```typescript
// Source: packages/tenancy/src/adapters/persistence/schema.ts:43-48 (pattern)
investmentsEnabled: boolean("investments_enabled").notNull().default(false),
```

### Pattern 2: PriceProvider Port (mirrors FxProvider)

```typescript
// Source: packages/shared-kernel/src/ports/fx-provider.ts (pattern to mirror)
// New file: packages/investments/src/ports/price-provider.ts
export interface PriceProvider {
  currentPrice(
    symbol: string,
    provider: "twelve_data" | "coingecko" | "metals_dev",
  ): Promise<{ price: string; currency: string; provider: string }>;
}
```

### Pattern 3: pg-boss Reference-Data Job (mirrors fx-daily-fetch)

```typescript
// Source: apps/worker/src/handlers/fx-daily-fetch.ts (exact pattern)
export function registerInstrumentPriceHourly(boss: PgBossLike, priceProvider: PriceProvider) {
  boss.work("instrument-price-hourly", async () => {
    // SELECT DISTINCT instrument_id FROM budgeting.investments WHERE archived_at IS NULL
    // AND instrument_id IS NOT NULL
    const instruments = await withInfraTx(async (tx) => { ... });
    // For each: priceProvider.currentPrice() → upsert instrument_price_cache
    return { fetched, failed };
  });
}
// Registered in worker.ts:
await boss.createQueue("instrument-price-hourly");
await boss.schedule("instrument-price-hourly", "0 * * * *");
```

### Pattern 4: TaskKind Extension for INVESTMENT_INSTRUMENT_DELISTED

The `tasks_kind_chk` CHECK constraint in `tasks-schema.ts:39-42` must be extended. The migration SQL must use `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT` with the new value added. The `TaskKind` union in `ports/task-repo.ts:30-33` gets the new literal. A new `emitInvestmentDelisted` method is added to `TaskRepo`.

```typescript
// Current CHECK: 'RESERVE_TOPUP','CONFIRM_DRAFT','CUSHION_BELOW_TARGET'
// New CHECK adds: 'INVESTMENT_INSTRUMENT_DELISTED'
export type TaskKind =
  | "RESERVE_TOPUP"
  | "CONFIRM_DRAFT"
  | "CUSHION_BELOW_TARGET"
  | "INVESTMENT_INSTRUMENT_DELISTED"; // NEW — Phase 9 A1

export interface InvestmentDelistedPayload {
  holding_id: string;
  holding_name: string;
  instrument_symbol: string;
}
```

### Pattern 5: RLS on Tenant-Scoped Tables (holdings)

```typescript
// Source: packages/budgeting/src/adapters/persistence/wallets-schema.ts:44-49 (exact pattern)
pgPolicy("investments_tenant_isolation", {
  as: "permissive",
  for: "all",
  to: [appRole, workerRole],
  using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
  withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
}),
```

Reference-data tables (`instruments`, `instrument_price_cache`, `instrument_price_snapshots`) have NO `tenant_id` and NO RLS — same as `fx_rates`. Grants via `post-migration.sql` for `app_role` READ, `worker_role` READ+WRITE.

### Pattern 6: Holdings Domain Entity

```typescript
// packages/investments/src/domain/holding.ts
// Plain class — NO Drizzle imports (dep-cruiser enforced)
// Money applied at adapter boundary only (pattern from wallet.ts)
export type HoldingType =
  | "equities"
  | "etf"
  | "bond"
  | "crypto"
  | "reit"
  | "commodity"
  | "cash_fx"
  | "real_estate"
  | "other";

export class Holding {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public name: string,
    public holdingType: HoldingType,
    public group: string | null,
    public instrumentId: string | null, // null = custom
    public buyPriceCents: bigint,
    public buyCurrency: string,
    public quantity: string, // big.js string; crypto-grade
    public currentPriceCents: bigint,
    public currentPriceCurrency: string,
    public sortOrder: number,
    public archivedAt: Date | null,
    public readonly createdAt: Date,
  ) {}
  // isCash(): this.holdingType === "cash_fx"
  // isCustom(): this.instrumentId === null
  // isDelisted(): computed from instruments table join, not stored on holding
}
```

### Anti-Patterns to Avoid

- **Drizzle in domain:** domain/holding.ts must have ZERO drizzle-orm imports. dep-cruiser CI rule enforces this.
- **Big.js in adapter:** money.ts big.js stays in domain arithmetic; `bigint` cents in DB. Adapter converts at boundary.
- **Provider calls for search:** Instrument search must only query the local `instruments` Postgres table. Never call Twelve Data or CoinGecko to fulfill a search request.
- **Per-tenant iteration in jobs:** The hourly price job collects ALL distinct instrument_ids across ALL tenants in one query and fetches once per instrument. No iteration over tenants.
- **metals.dev for hourly cron:** metals.dev free plan is 100 req/month = exhausted in ~2 days with 2 metals. Gate metals refresh to daily-only (see Pitfall 3).
- **Storing BigInt as JS number:** All `amount_cents` fields must be `BIGINT` in SQL and `bigint` or `string` in TypeScript. Never `number` (overflow at 2^53).

---

## Don't Hand-Roll

| Problem                     | Don't Build                   | Use Instead                                                       | Why                                                         |
| --------------------------- | ----------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| FX conversion for P/L       | Custom FX lookup              | `FxProvider.rateAsOf` + existing `fx_rates` cache                 | Already implemented, tested, handles weekends/holidays      |
| Money arithmetic            | Raw number math               | `Money` value object (`shared-kernel/money.ts`) with big.js       | Precision; already used everywhere                          |
| DnD reorder                 | Custom drag                   | `@dnd-kit/sortable` with `useSortable`                            | Already installed, calibrated, proven                       |
| Optimistic mutations        | Custom state machine          | `clientApiWrite` + React-Query `onMutate/onError/onSettled`       | Pattern used in every tab; handles offline rollback         |
| Job scheduling              | `setInterval` or cron package | pg-boss `boss.schedule()`                                         | Already used for FX daily, reconciliation, recurring        |
| Rate limiting (10/user/min) | Custom in-memory counter      | Postgres-based counter in `infra` tx (or `pg-boss` work throttle) | Redis not in stack; Redis-free must use DB or pg-boss state |
| Text search on instruments  | Manual LIKE loops             | `pg_trgm` GIN index + Postgres `similarity()` / `ILIKE`           | Handles prefix + substring matching efficiently             |
| Delete confirmation         | Custom modal                  | `<AlertDialog>` (already imported in wallets tab)                 | shadcn Radix-backed; a11y correct                           |

---

## Price Provider API Research

### Twelve Data (equities, ETF, forex pairs as FX prices)

- **Free tier:** 800 calls/day = ~33 calls/hour [CITED: twelvedata.com/pricing]
- **Coverage:** US equities, ETFs, US/EU forex, some crypto; 1M+ symbols but free = US markets + limited international
- **Instrument list endpoint:** `GET /stocks?source=docs` — returns all available symbols (free); used for daily seed
- **Price endpoint:** `GET /price?symbol=AAPL&apikey=...` — single price, no auth needed beyond API key
- **API key:** Required (free key via signup)
- **Rate limit header:** `X-RateLimit-Remaining` in response
- **Constraint for hourly cron:** 33 calls/hour free. If holding count > 33 unique tracked equities/ETF/FX, the hourly cron will hit limits. Batch calls with `GET /price?symbol=AAPL,MSFT,...` (comma-separated, up to 8 symbols per call on free tier). [CITED: twelvedata.com/docs]

### CoinGecko (crypto)

- **Free (Demo) tier:** ~30 calls/minute; 10,000 calls/month [CITED: docs.coingecko.com/docs/common-errors-rate-limit]
- **Coverage:** All major cryptocurrencies; `GET /coins/list` returns full coin catalog (id + symbol + name)
- **Price endpoint:** `GET /simple/price?ids=bitcoin,ethereum&vs_currencies=usd` — batch up to ~100 coins
- **API key:** Demo key via signup (free). Header: `x-cg-demo-api-key`.
- **Instrument seed:** `GET /coins/list` once daily; filter by market-cap rank for top-N coins (top 200 covers major crypto for D-05)
- **Constraint:** At 30 calls/min the hourly cron comfortably handles any realistic crypto holding count

### metals.dev (precious metals)

- **Free tier:** 100 requests/MONTH [CITED: metals.dev/pricing] ← CRITICAL CONSTRAINT
- **Coverage:** XAU (gold), XAG (silver), Platinum, Palladium
- **Price endpoint:** `GET https://api.metals.dev/v1/latest?api_key=...&currency=USD&unit=troy_ounce`
- **API key:** Required (free via signup)
- **DECISION REQUIRED:** 100/month = ~3 calls/day. The hourly cron would exhaust this in 4 days. **Metals prices must only be refreshed in the daily snapshot job**, not the hourly cron. The on-add instant fetch for metals can also be skipped (daily job fills it) or a single daily-fetched cache value is served. Metals-API.com has the same free limit. **Recommendation:** Include metals in the daily seed/snapshot job only; mark metals holdings as "daily refresh" in the price cache; accept up to 24h stale metal prices. [CITED: metals.dev/pricing]

### Frankfurter (FX for cash + buy-currency conversion)

- **Already integrated:** `FrankfurterFxProvider` + `fx_rates` cache [VERIFIED: packages/budgeting/src/adapters/fx/frankfurter.ts]
- **No changes needed** except ensuring investment currency pairs are added to the `fx-daily-fetch` pair collection query

---

## Persistence Schema Design

### New Tables (migration 0038)

```sql
-- 1. Feature flag (extends tenancy.budgets)
ALTER TABLE tenancy.budgets ADD COLUMN investments_enabled boolean NOT NULL DEFAULT false;

-- 2. Instruments reference table (no tenant_id, no RLS)
CREATE TABLE budgeting.instruments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol        text NOT NULL,
  display_name  text NOT NULL,
  provider      text NOT NULL,          -- 'twelve_data' | 'coingecko' | 'metals_dev' | 'manual'
  asset_class   text NOT NULL,          -- 'equities' | 'etf' | 'crypto' | 'commodity' | 'cash_fx'
  quote_currency text,                  -- e.g. 'USD' for AAPL; null for crypto (has vs_currencies)
  active        boolean NOT NULL DEFAULT true,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instruments_asset_class_chk CHECK (asset_class IN
    ('equities','etf','bond','crypto','reit','commodity','cash_fx','real_estate','other'))
);
CREATE UNIQUE INDEX instruments_symbol_provider_uidx ON budgeting.instruments(symbol, provider);
CREATE INDEX instruments_search_gin ON budgeting.instruments USING GIN (
  (symbol || ' ' || display_name) gin_trgm_ops
);

-- 3. Instrument price cache (no tenant_id, no RLS)
CREATE TABLE budgeting.instrument_price_cache (
  instrument_id uuid PRIMARY KEY REFERENCES budgeting.instruments(id),
  price         numeric(28, 8) NOT NULL,
  currency      char(3) NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now()
);

-- 4. Holdings (tenant-scoped, RLS)
CREATE TABLE budgeting.investments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  budget_id             uuid NOT NULL REFERENCES tenancy.budgets(id) ON DELETE CASCADE,
  instrument_id         uuid REFERENCES budgeting.instruments(id),   -- null = custom
  name                  text NOT NULL,
  holding_type          text NOT NULL,
  group_name            text,
  buy_price_cents       bigint NOT NULL,
  buy_currency          char(3) NOT NULL,
  quantity              numeric(28, 8) NOT NULL,
  current_price_cents   bigint NOT NULL,
  current_price_currency char(3) NOT NULL,
  sort_order            integer NOT NULL DEFAULT 0,
  archived_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT investments_holding_type_chk CHECK (holding_type IN
    ('equities','etf','bond','crypto','reit','commodity','cash_fx','real_estate','other'))
);
-- RLS: same pattern as budgeting.wallets (tenant_id ANY app.tenant_ids)
-- Index for hourly cron:
CREATE INDEX investments_active_instrument_idx
  ON budgeting.investments(instrument_id)
  WHERE archived_at IS NULL AND instrument_id IS NOT NULL;

-- 5. Daily price snapshots (no tenant_id, append-only)
CREATE TABLE budgeting.instrument_price_snapshots (
  instrument_id uuid NOT NULL REFERENCES budgeting.instruments(id),
  snapshot_date date NOT NULL,
  price         numeric(28, 8) NOT NULL,
  currency      char(3) NOT NULL,
  PRIMARY KEY (instrument_id, snapshot_date)
);
```

### Drizzle Schema Patterns (from codebase)

- RLS `pgPolicy` with `appRole` and `workerRole` imported from `@budget/platform` [VERIFIED: wallets-schema.ts:44]
- `bigint` columns for `amount_cents` via Drizzle `bigint("col", { mode: "bigint" })` — do NOT use `numeric` for cents
- Text + CHECK for enums (not `pgEnum`) — matches `wallet_type` and `task_kind` pattern [VERIFIED: wallets-schema.ts:39, tasks-schema.ts:39]
- `timestamp("...", { withTimezone: true })` for all timestamps [VERIFIED: wallets-schema.ts:33]
- Reference-data tables: no `pgPolicy`, grants in `post-migration.sql` [VERIFIED: fx-rates-schema.ts]

---

## Common Pitfalls

### Pitfall 1: tasks CHECK constraint must be altered, not recreated

**What goes wrong:** Adding `INVESTMENT_INSTRUMENT_DELISTED` to the kind requires dropping and recreating `tasks_kind_chk`. Drizzle schema and migration SQL must both update the CHECK. The Drizzle `check()` in `tasks-schema.ts` must list all 4 kinds.
**Why it happens:** Postgres CHECK constraints are not easily addable; ALTER TABLE requires DROP + ADD.
**How to avoid:** Migration SQL: `ALTER TABLE budgeting.tasks DROP CONSTRAINT tasks_kind_chk; ALTER TABLE budgeting.tasks ADD CONSTRAINT tasks_kind_chk CHECK (kind IN ('RESERVE_TOPUP','CONFIRM_DRAFT','CUSHION_BELOW_TARGET','INVESTMENT_INSTRUMENT_DELISTED'));`
**Warning signs:** `emitInvestmentDelisted` inserts fail with constraint violation.

### Pitfall 2: `@dnd-kit` three-gesture coexistence on mobile

**What goes wrong:** Mobile row has tap-expand, swipe-left (actions), and long-press-drag. Without proper gesture disambiguation, a long-press triggers both drag AND tap-expand.
**Why it happens:** TouchSensor fires after 300ms delay — same timeframe as a long press that triggers expand.
**How to avoid:** Drag handle must be the ONLY long-press-drag target (apply `useSortable` to the handle element only, not the full row). Tap on row body = expand toggle. This is the exact pattern documented in the UI-SPEC (D-29 flag). [VERIFIED: wallets-sectioned-list.tsx:152-158 — sensors already configured correctly]
**Warning signs:** Tapping a row on mobile both expands AND starts a drag overlay.

### Pitfall 3: metals.dev free tier — 100 req/month exhausted in 4 days

**What goes wrong:** If metals prices are included in the hourly price cron, the free plan quota is exhausted within 4 days (hourly × 2 metals × 24h × 4d = 192 calls).
**Why it happens:** metals.dev free tier = 100 req/month, not per day/hour. [CITED: metals.dev/pricing]
**How to avoid:** The metals `PriceProvider` adapter must only be called from the DAILY snapshot job, not the hourly cron. The `instrument_price_cache` for metals is updated once daily. The on-add instant fetch for metals must either (a) serve the last daily cached price, or (b) make one call at most per holding add for metals (acceptable if < 3 adds/day). Mark metals instruments with a `refresh_cadence = 'daily'` flag in the instruments table, and the hourly cron skips them.
**Warning signs:** API returns 429/quota exhausted before the month ends.

### Pitfall 4: Rate limit counter (10/user/min) without Redis

**What goes wrong:** The instant on-add price fetch must be capped at 10/user/min. The project has no Redis (pg-boss uses Postgres; no in-memory cache outside process).
**Why it happens:** The constraint is `10 per user per minute` — not per request, not per budget.
**How to avoid:** Use a Postgres counter table `api_rate_limits (user_id, window_start timestamptz, count int)` with upsert-on-conflict and index on `(user_id, window_start)`. The route layer reads the count, rejects if ≥ 10, increments atomically. Alternatively: accept a small race (two concurrent adds = 11th call accepted) by using `pg-boss` throttle. Given this is a household app with low concurrency, the simpler approach is a fast `infra tx` counter check + increment.
**Warning signs:** 11th instant fetch in a minute succeeds instead of blocking save.

### Pitfall 5: `pg_trgm` extension not enabled

**What goes wrong:** The trigram GIN index on instruments requires `CREATE EXTENSION IF NOT EXISTS pg_trgm`. If the extension isn't enabled, migration fails.
**Why it happens:** `pg_trgm` is not in the default Postgres extension set (though it ships with Postgres).
**How to avoid:** Add `CREATE EXTENSION IF NOT EXISTS pg_trgm;` to the migration SQL before the index creation.
**Warning signs:** `ERROR: operator class "gin_trgm_ops" does not exist`.

### Pitfall 6: BigInt serialization in Drizzle migrations

**What goes wrong:** `drizzle-kit` has a known BigInt serialization bug (recorded in STATE.md Plan 06-01). Auto-generated migrations may fail.
**Why it happens:** drizzle-kit cannot serialize `bigint` columns in its generate step. [VERIFIED: STATE.md:193-194 — "drizzle-kit BigInt serialization bug blocks npx drizzle-kit generate — hand-authored migration 0038 following Phases 1/5 precedent"]
**How to avoid:** Hand-author migration 0038 SQL (following the Phase 1/5/6 precedent). Register the journal entry manually in `drizzle/meta/_journal.json`.
**Warning signs:** `npx drizzle-kit generate` produces an empty or malformed migration.

### Pitfall 7: Group DnD — "drop into group" vs "reorder within group"

**What goes wrong:** When a holding is dragged, the drop target could be (a) another holding within the same group (reorder), (b) a holding in a different group (group reassignment), or (c) a group header element (group reassignment). Without explicit disambiguation, dropping onto a group header re-orders instead of re-grouping.
**Why it happens:** `@dnd-kit` `over.id` is the droppable element's id — which could be a holding id or a group-header droppable id.
**How to avoid:** Group headers must be registered as explicit droppable zones with a prefixed id (e.g. `"group-Broker A"`). In `onDragEnd`, check `over.id.startsWith("group-")` first → set group field. Otherwise treat as intra/cross-section reorder (same as wallets pattern).

### Pitfall 8: `INVESTMENTS` must NOT join `wallet_type` CHECK

**What goes wrong:** Adding `'INVESTMENTS'` to `wallets_wallet_type_chk` would route investment holdings through the wallet CRUD path, breaking the reorder guard logic (which rejects cross-section drops by `walletType`).
**Why it happens:** D-01 explicitly forbids this; investments are a separate table. But a developer might reflexively add it.
**How to avoid:** `INVESTMENTS` is never a `walletType` value. The `reorderWallets` use case stays untouched. The new `reorderHoldings` endpoint is investment-specific and mirrors the guard pattern independently.

---

## Code Examples

### Verified Patterns from Codebase

#### Feature flag read in client island

```typescript
// Source: apps/web/src/components/budgeting/wallets-tab/wallets-sectioned-list.tsx:65-77
const budgetMeta = budgetQuery.data as {
  investmentsEnabled?: boolean;
  // ...
} | undefined;
const investmentsEnabled = budgetMeta?.investmentsEnabled ?? false;
// ... after all WalletSection renders:
{investmentsEnabled && <InvestmentsSection budgetId={budgetId} ... />}
```

#### pg-boss job registration (reference-data pattern)

```typescript
// Source: apps/worker/src/worker.ts:35-42 (fx-daily-fetch pattern)
await boss.createQueue("instrument-price-hourly");
await boss.schedule("instrument-price-hourly", "0 * * * *"); // hourly UTC
registerInstrumentPriceHourly(boss as unknown as PgBossLike, priceProvider);
```

#### RLS policy (tenant-scoped table)

```typescript
// Source: packages/budgeting/src/adapters/persistence/wallets-schema.ts:44-49
pgPolicy("investments_tenant_isolation", {
  as: "permissive",
  for: "all",
  to: [appRole, workerRole],
  using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
  withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
});
```

#### FX conversion (existing port — reuse verbatim)

```typescript
// Source: packages/budgeting/src/adapters/fx/frankfurter.ts:35-40
const { rate } = await fxProvider.rateAsOf(
  currentCurrency as Currency,
  buyCurrency as Currency,
  new Date(),
);
// Then in domain: Money.of(currentPriceCents).times(rate) — stays in adapter layer
```

#### Instrument trigram search (Postgres)

```sql
-- For InstrumentRepo.search(query: string, limit = 20):
SELECT id, symbol, display_name, asset_class, quote_currency
FROM budgeting.instruments
WHERE active = true
  AND (
    symbol ILIKE $1 || '%'          -- symbol prefix first
    OR display_name ILIKE '%' || $1 || '%'  -- name substring fallback
  )
ORDER BY
  CASE WHEN symbol ILIKE $1 THEN 0
       WHEN symbol ILIKE $1 || '%' THEN 1
       ELSE 2 END,
  display_name
LIMIT 20;
-- With pg_trgm GIN index on (symbol || ' ' || display_name)
```

---

## Runtime State Inventory

> Phase 9 is greenfield (new tables, no renames). Not a rename/refactor phase.

**None — no runtime state migration required.** All new tables start empty. The only schema change to an existing table is `ALTER TABLE tenancy.budgets ADD COLUMN investments_enabled boolean NOT NULL DEFAULT false` — which is backwards-compatible (default false).

---

## State of the Art

| Old Approach                                             | Current Approach                                      | When Changed             | Impact                                              |
| -------------------------------------------------------- | ----------------------------------------------------- | ------------------------ | --------------------------------------------------- |
| Pending/stale price states (INV-14 original)             | Block save on no-price (A2)                           | discuss-phase 2026-06-20 | Simpler UI; no pending holdings saved               |
| Forex positions in instrument universe (INV-07 original) | Cash-only (amount+currency); forex P/L deferred (A3)  | discuss-phase 2026-06-20 | Simpler Sheet form for cash type                    |
| Tasks untouched (SPEC out-of-scope originally)           | One new task type INVESTMENT_INSTRUMENT_DELISTED (A1) | discuss-phase 2026-06-20 | Must extend tasks CHECK constraint + TaskKind union |
| Table shape TBD (SPEC boundary)                          | Separate `investments` table (D-01)                   | discuss-phase 2026-06-20 | wallets table stays untouched                       |

**Deprecated/outdated:**

- `INVESTMENTS` as a `wallet_type` enum value: explicitly rejected (D-01). Never add it.
- "Stale" price badge: rejected (A2). Only delisted state renders chrome.
- Pending holding (save without price): rejected (A2). Save blocks.

---

## Assumptions Log

| #   | Claim                                                                                                                         | Section        | Risk if Wrong                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | `pg_trgm` extension is enabled in the project Postgres instance                                                               | Standard Stack | Migration fails on `CREATE INDEX ... gin_trgm_ops`; must add `CREATE EXTENSION IF NOT EXISTS pg_trgm`                                   |
| A2  | Twelve Data free API key requires no per-request IP gating (Docker worker can reach it)                                       | Price Provider | Hourly price job fails; need to whitelist worker IP or use a different provider                                                         |
| A3  | CoinGecko Demo key is obtainable for free (email signup only, no credit card)                                                 | Price Provider | Low risk; CoinGecko explicitly markets Demo as free; [CITED: coingecko.com/api/pricing]                                                 |
| A4  | The investments bounded context should be a NEW package (`packages/investments/`) rather than extending `packages/budgeting/` | Architecture   | If added to budgeting, the factory.ts grows significantly; separate package is cleaner but requires adding to monorepo workspace config |
| A5  | `current_price_cents` stored on the holding row (denormalized from cache) to avoid join on every list query                   | Persistence    | If wrong, list query must join `instrument_price_cache`; both are valid; denormalized is simpler for optimistic updates                 |

---

## Open Questions

1. **Investments as separate package vs extending budgeting package**
   - What we know: All prior bounded contexts are separate packages (`packages/budgeting`, `packages/identity`, `packages/tenancy`).
   - What's unclear: Is the `packages/investments/` approach preferred, or should holdings/instruments live inside `packages/budgeting/`?
   - Recommendation: New package. Investments has its own domain entity, ports, adapters, and factory — fits the established pattern. Budgeting is already large.

2. **Rate-limit counter for 10/user/min instant fetch**
   - What we know: No Redis; pg-boss and Postgres available.
   - What's unclear: Is a Postgres counter table acceptable (adds a write on every add-attempt), or should the planner choose pg-boss job throttle, or accept a simple in-process Map with TTL per worker instance?
   - Recommendation: Postgres counter table `api_rate_limits(user_id, window_min timestamptz, count int)` — single upsert, correct across restarts. Given this is a household app with very low concurrency, correctness > performance.

3. **Metals price refresh cadence**
   - What we know: metals.dev 100 req/month free.
   - What's unclear: Should the planner budget for a paid metals tier or accept daily-only refresh?
   - Recommendation: Daily-only metals refresh (plan must document this explicitly as the metals-specific behavior). No paid tier.

---

## Environment Availability

| Dependency             | Required By               | Available                                                     | Version                   | Fallback                                                  |
| ---------------------- | ------------------------- | ------------------------------------------------------------- | ------------------------- | --------------------------------------------------------- |
| Postgres               | All DB operations         | ✓                                                             | Managed (project running) | —                                                         |
| pg_trgm extension      | Instrument trigram search | [ASSUMED — likely enabled; standard Postgres distro ships it] | —                         | Fall back to ILIKE without GIN index (slower but correct) |
| Twelve Data API key    | Price cron + on-add fetch | ✗ (must provision)                                            | —                         | Must add to Infisical secrets                             |
| CoinGecko Demo API key | Crypto prices             | ✗ (must provision)                                            | —                         | Must add to Infisical secrets                             |
| metals.dev API key     | Gold/silver prices        | ✗ (must provision)                                            | —                         | Must add to Infisical secrets                             |
| Bun native fetch       | HTTP calls to price APIs  | ✓                                                             | Bun 1.2.x                 | —                                                         |

**Missing dependencies with no fallback:**

- Three API keys (Twelve Data, CoinGecko, metals.dev) must be provisioned and added to Infisical `dev` + `prod` environments before the price adapters can be tested end-to-end. This is a Wave 0 prerequisite.

**Missing dependencies with fallback:**

- `pg_trgm`: if not enabled, instrument search degrades to ILIKE without a GIN index (functionally correct, ~10x slower on large instrument tables; acceptable for the seed phase while the extension is enabled).

---

## Validation Architecture

### Test Framework

| Property             | Value                                                  |
| -------------------- | ------------------------------------------------------ |
| Framework (backend)  | `bun:test`                                             |
| Framework (frontend) | Vitest 4 + happy-dom + RTL                             |
| Framework (E2E)      | Playwright + playwright-bdd (Gherkin)                  |
| Config file          | `bunfig.toml` (80% domain coverage threshold enforced) |
| Quick run command    | `bun test packages/investments/test/`                  |
| Full suite command   | `make test && bun run test` (Vitest)                   |

### Phase Requirements → Test Map

| Req ID | Behavior                                                                     | Test Type             | Automated Command                                                         | File Exists?                                |
| ------ | ---------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------- | ------------------------------------------- |
| INV-01 | `investments_enabled` persists via PATCH + DTO reflects it                   | Integration           | `bun test apps/api/test/routes/budgets.test.ts`                           | ❌ Wave 0                                   |
| INV-01 | Settings Switch toggles flag, wallets section appears/disappears             | E2E Gherkin           | `--grep @investments-wallet`                                              | ❌ Wave 0                                   |
| INV-02 | DOM contains no Investments section when flag=false; last section when true  | E2E + Component       | Vitest `<WalletsSectionedList>`                                           | ❌ Wave 0                                   |
| INV-03 | Holding round-trips all fields through API; Drizzle only in adapter          | Integration           | `bun test apps/api/test/routes/investments.test.ts`                       | ❌ Wave 0                                   |
| INV-03 | RLS: cross-tenant holding invisible                                          | Integration (ci-gate) | `make ci-gate`                                                            | ❌ Wave 0 — must add investments to ci-gate |
| INV-04 | Creating holding with invalid type returns 422                               | Unit + Integration    | `bun test packages/investments/test/domain/holding.test.ts`               | ❌ Wave 0                                   |
| INV-05 | GroupCombobox shows existing groups; free-type creates new                   | Component             | Vitest RTL                                                                | ❌ Wave 0                                   |
| INV-06 | No inline `<input>` on holding rows in DOM                                   | E2E                   | `--grep @investments-wallet`                                              | ❌ Wave 0                                   |
| INV-07 | Search returns ≥1 result for known ticker within major universe              | Integration           | `bun test packages/investments/test/adapters/instrument-repo.test.ts`     | ❌ Wave 0                                   |
| INV-08 | EUR-bought USD-priced holding shows correct P/L after FX conversion          | Unit                  | `bun test packages/investments/test/domain/holding-metrics.test.ts`       | ❌ Wave 0                                   |
| INV-09 | All 5 fields render per row; total value = qty × current price               | Unit + Component      | Vitest RTL `<InvestmentRow>`                                              | ❌ Wave 0                                   |
| INV-10 | Within-group weights sum ~100%; group-% sums ~100%; denominator = budget ccy | Unit                  | `bun test packages/investments/test/domain/portfolio-weights.test.ts`     | ❌ Wave 0                                   |
| INV-11 | Drag into group persists new group; cross-wallet-section drop rejected       | E2E                   | `--grep @investments-wallet`                                              | ❌ Wave 0                                   |
| INV-12 | PriceProvider resolves price for known symbol in each asset class            | Unit (mocked HTTP)    | `bun test packages/investments/test/adapters/price/`                      | ❌ Wave 0                                   |
| INV-13 | Hourly job only fetches held instruments; not custom; logs {fetched,failed}  | Unit                  | `bun test apps/worker/test/instrument-price-hourly.test.ts`               | ❌ Wave 0                                   |
| INV-14 | 1st–10th add-fetch returns live price; 11th blocks save with banner          | Integration           | `bun test apps/api/test/routes/investments.test.ts` (rate-limit scenario) | ❌ Wave 0                                   |
| INV-15 | Daily job writes exactly one price row + one FX row per instrument per date  | Integration           | `bun test apps/worker/test/investment-snapshot-daily.test.ts`             | ❌ Wave 0                                   |
| INV-16 | Create/edit/reorder reflects optimistically; offline writes toast+rollback   | Component + E2E       | Vitest RTL hooks + `--grep @investments-wallet`                           | ❌ Wave 0                                   |

### Sampling Rate

- **Per task commit:** `bun test packages/investments/test/`
- **Per wave merge:** `make test && bun run test`
- **Phase gate:** Full suite green + `make ci-gate` (with investments tables added to tenant-leak gate) before `/gsd-verify-work`

### Wave 0 Gaps (must create before implementation)

- [ ] `packages/investments/test/domain/holding.test.ts` — covers INV-03, INV-04
- [ ] `packages/investments/test/domain/holding-metrics.test.ts` — covers INV-08, INV-09
- [ ] `packages/investments/test/domain/portfolio-weights.test.ts` — covers INV-10
- [ ] `packages/investments/test/adapters/instrument-repo.test.ts` — covers INV-07 (real Postgres)
- [ ] `packages/investments/test/adapters/price/twelve-data.test.ts` — mocked HTTP
- [ ] `packages/investments/test/adapters/price/coingecko.test.ts` — mocked HTTP
- [ ] `packages/investments/test/adapters/price/metals.test.ts` — mocked HTTP
- [ ] `apps/api/test/routes/investments.test.ts` — covers INV-03, INV-14 (real Postgres)
- [ ] `apps/worker/test/instrument-price-hourly.test.ts` — covers INV-13
- [ ] `apps/worker/test/investment-snapshot-daily.test.ts` — covers INV-15
- [ ] `apps/web/e2e/investments-wallet.feature` — covers INV-01, INV-02, INV-06, INV-11, INV-16 (Gherkin `@investments-wallet`)
- [ ] Add `budgeting.investments` to `make ci-gate` tenant-leak test file list

---

## Security Domain

### Applicable ASVS Categories (Level 1)

| ASVS Category         | Applies | Standard Control                                                                               |
| --------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| V2 Authentication     | no      | Better Auth gates all routes (existing middleware)                                             |
| V3 Session Management | no      | Existing Better Auth session handling                                                          |
| V4 Access Control     | yes     | RLS pgPolicy on `investments` table; route-level `pickTenant` guard mirrors wallets pattern    |
| V5 Input Validation   | yes     | Zod schemas on all POST/PATCH bodies (Hono zValidator); type enum enforced by CHECK constraint |
| V6 Cryptography       | no      | No new secrets; API keys stored in Infisical (existing pattern)                                |

### Known Threat Patterns for This Stack

| Pattern                           | STRIDE                 | Standard Mitigation                                                                                                                   |
| --------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-tenant holding leak         | Information Disclosure | `tenant_id` RLS policy + `make ci-gate` tenant-leak test covering `budgeting.investments`                                             |
| Symbol injection in search query  | Tampering              | Parameterized Drizzle query (no raw SQL interpolation in search); ILIKE via `sql` tagged template                                     |
| API key leakage in logs           | Information Disclosure | Price provider adapters must log symbol/response shape, NOT the API key; keys in Infisical not env vars in code                       |
| Cross-section reorder injection   | Tampering              | Server-side validation that all `orderedIds` belong to the requesting tenant's investments (mirrors `wallet_id_not_in_section` guard) |
| Rate-limit bypass for 10/user/min | Elevation of Privilege | DB-side counter atomic upsert; not client-controlled                                                                                  |

---

## Sources

### Primary (HIGH confidence)

- `packages/budgeting/src/adapters/fx/frankfurter.ts` — FxProvider adapter pattern verified
- `packages/shared-kernel/src/ports/fx-provider.ts` — FxProvider port interface verified
- `apps/worker/src/handlers/fx-daily-fetch.ts` — reference-data job pattern verified
- `apps/worker/src/worker.ts` — pg-boss schedule/work/createQueue API verified
- `packages/budgeting/src/adapters/persistence/tasks-schema.ts` — TaskKind CHECK pattern verified
- `packages/budgeting/src/ports/task-repo.ts` — TaskRepo emit pattern verified
- `packages/tenancy/src/adapters/persistence/schema.ts` — feature flag boolean column pattern verified
- `apps/web/src/components/budgeting/wallets-tab/wallets-sectioned-list.tsx` — section render + feature flag conditional verified
- `packages/budgeting/src/adapters/persistence/wallets-schema.ts` — RLS pgPolicy pattern verified
- `packages/budgeting/src/adapters/persistence/fx-rates-schema.ts` — reference-data no-RLS schema verified
- `.planning/phases/09-investments-wallet/09-SPEC.md` — locked requirements
- `.planning/phases/09-investments-wallet/09-CONTEXT.md` — implementation decisions
- `.planning/phases/09-investments-wallet/09-UI-SPEC.md` — UI contract

### Secondary (MEDIUM confidence)

- [Twelve Data pricing page](https://twelvedata.com/pricing) — 800 calls/day free tier confirmed
- [CoinGecko API docs rate limits](https://docs.coingecko.com/docs/common-errors-rate-limit) — Demo ~30 calls/min confirmed
- [metals.dev pricing](https://metals.dev/pricing) — 100 requests/month free confirmed

### Tertiary (LOW confidence — flag for validation)

- Twelve Data free tier symbol batch size (8 symbols/call): from support article, not verified against live API
- CoinGecko Demo vs Public API key distinction: multiple conflicting source numbers (30/min vs 100/min); treat as ≥30/min

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all libraries verified in codebase; versions confirmed
- Architecture: HIGH — all patterns verified against live source files
- Price provider limits: MEDIUM — from official pricing pages; actual behavior under load not tested
- Pitfalls: HIGH — most from direct codebase observations + STATE.md historical decisions

**Research date:** 2026-06-21
**Valid until:** 2026-07-21 (price API limits and free tiers may change; verify before phase start if delayed)
