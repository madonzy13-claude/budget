# Phase 9: Investments Wallet — Pattern Map

**Mapped:** 2026-06-21
**Files analyzed:** 42 new/modified files
**Analogs found:** 39 / 42

---

## File Classification

| New/Modified File                                                           | Role          | Data Flow               | Closest Analog                                                             | Match Quality |
| --------------------------------------------------------------------------- | ------------- | ----------------------- | -------------------------------------------------------------------------- | ------------- |
| `packages/investments/src/domain/holding.ts`                                | domain entity | CRUD                    | `packages/budgeting/src/domain/wallet.ts`                                  | role-match    |
| `packages/investments/src/ports/holding-repo.ts`                            | port          | CRUD                    | `packages/budgeting/src/ports/task-repo.ts`                                | role-match    |
| `packages/investments/src/ports/price-provider.ts`                          | port          | request-response        | `packages/shared-kernel/src/ports/fx-provider.ts`                          | exact         |
| `packages/investments/src/ports/instrument-repo.ts`                         | port          | CRUD                    | `packages/budgeting/src/ports/task-repo.ts`                                | role-match    |
| `packages/investments/src/adapters/persistence/investments-schema.ts`       | schema        | CRUD                    | `packages/budgeting/src/adapters/persistence/wallets-schema.ts`            | exact         |
| `packages/investments/src/adapters/persistence/instruments-schema.ts`       | schema        | CRUD                    | `packages/budgeting/src/adapters/persistence/fx-rates-schema.ts`           | exact         |
| `packages/investments/src/adapters/persistence/price-cache-schema.ts`       | schema        | CRUD                    | `packages/budgeting/src/adapters/persistence/fx-rates-schema.ts`           | exact         |
| `packages/investments/src/adapters/persistence/price-snapshot-schema.ts`    | schema        | batch                   | `packages/budgeting/src/adapters/persistence/fx-rates-schema.ts`           | exact         |
| `packages/investments/src/adapters/persistence/holding-repo.ts`             | adapter       | CRUD                    | `packages/budgeting/src/adapters/persistence/task-repo.ts`                 | role-match    |
| `packages/investments/src/adapters/persistence/instrument-repo.ts`          | adapter       | request-response        | `packages/budgeting/src/adapters/persistence/task-repo.ts`                 | role-match    |
| `packages/investments/src/adapters/price/twelve-data.ts`                    | adapter       | request-response        | `packages/budgeting/src/adapters/fx/frankfurter.ts`                        | exact         |
| `packages/investments/src/adapters/price/coingecko.ts`                      | adapter       | request-response        | `packages/budgeting/src/adapters/fx/frankfurter.ts`                        | exact         |
| `packages/investments/src/adapters/price/metals-dev.ts`                     | adapter       | request-response        | `packages/budgeting/src/adapters/fx/frankfurter.ts`                        | exact         |
| `packages/investments/src/contracts/api.ts`                                 | contract/Zod  | CRUD                    | `packages/budgeting/src/contracts/api.ts`                                  | role-match    |
| `packages/investments/src/contracts/factory.ts`                             | config/DI     | —                       | `packages/budgeting/src/contracts/factory.ts`                              | role-match    |
| `apps/api/src/routes/investments.ts`                                        | route         | CRUD + request-response | `apps/api/src/routes/wallets.ts`                                           | exact         |
| `apps/worker/src/handlers/instrument-price-hourly.ts`                       | handler       | batch                   | `apps/worker/src/handlers/fx-daily-fetch.ts`                               | exact         |
| `apps/worker/src/handlers/instruments-daily-seed.ts`                        | handler       | batch                   | `apps/worker/src/handlers/fx-daily-fetch.ts`                               | exact         |
| `apps/worker/src/handlers/investment-snapshot-daily.ts`                     | handler       | batch                   | `apps/worker/src/handlers/fx-daily-fetch.ts`                               | exact         |
| `apps/worker/src/worker.ts` (modified)                                      | config        | —                       | `apps/worker/src/worker.ts`                                                | exact         |
| `packages/tenancy/src/adapters/persistence/schema.ts` (modified)            | schema        | CRUD                    | self                                                                       | exact         |
| `packages/budgeting/src/adapters/persistence/tasks-schema.ts` (modified)    | schema        | CRUD                    | self                                                                       | exact         |
| `packages/budgeting/src/ports/task-repo.ts` (modified)                      | port          | CRUD                    | self                                                                       | exact         |
| `drizzle/0038_phase09_investments.sql`                                      | migration     | —                       | `drizzle/0037_*.sql` (hand-authored pattern)                               | role-match    |
| `apps/web/src/components/budgeting/wallets-tab/investments-section.tsx`     | component     | request-response        | `apps/web/src/components/budgeting/wallets-tab/wallets-sectioned-list.tsx` | exact         |
| `apps/web/src/components/budgeting/wallets-tab/investment-group-header.tsx` | component     | event-driven            | `apps/web/src/components/budgeting/wallets-tab/wallet-section.tsx`         | role-match    |
| `apps/web/src/components/budgeting/wallets-tab/investment-row.tsx`          | component     | request-response        | `apps/web/src/components/budgeting/wallets-tab/wallet-row.tsx`             | exact         |
| `apps/web/src/components/budgeting/wallets-tab/investment-row-sheet.tsx`    | component     | event-driven            | `apps/web/src/components/budgeting/wallets-tab/wallet-row.tsx`             | exact         |
| `apps/web/src/components/budgeting/wallets-tab/holding-sheet.tsx`           | component     | request-response        | `apps/web/src/components/budgeting/category-form-sheet.tsx`                | exact         |
| `apps/web/src/components/budgeting/wallets-tab/holding-delete-confirm.tsx`  | component     | event-driven            | `apps/web/src/components/budgeting/wallets-tab/wallet-delete-confirm.tsx`  | exact         |
| `apps/web/src/components/budgeting/wallets-tab/instrument-search-input.tsx` | component     | request-response        | (no exact analog — search UI greenfield)                                   | no-analog     |
| `apps/web/src/components/budgeting/wallets-tab/asset-class-chip.tsx`        | component     | —                       | (no close analog — small badge)                                            | no-analog     |
| `apps/web/src/components/budgeting/wallets-tab/type-dropdown.tsx`           | component     | event-driven            | shadcn `Select` usage in category-edit-form                                | role-match    |
| `apps/web/src/components/budgeting/wallets-tab/group-combobox.tsx`          | component     | request-response        | (no exact combobox analog)                                                 | no-analog     |
| `apps/web/src/components/budgeting/wallets-tab/price-blocked-banner.tsx`    | component     | event-driven            | inline error patterns in cushion-section                                   | role-match    |
| `apps/web/src/hooks/use-investments.ts`                                     | hook          | request-response        | `apps/web/src/hooks/use-wallets.ts`                                        | exact         |
| `apps/web/src/hooks/use-create-holding.ts`                                  | hook          | CRUD                    | `apps/web/src/hooks/use-create-wallet.ts`                                  | exact         |
| `apps/web/src/hooks/use-update-holding.ts`                                  | hook          | CRUD                    | `apps/web/src/hooks/use-update-wallet.ts`                                  | exact         |
| `apps/web/src/hooks/use-archive-holding.ts`                                 | hook          | CRUD                    | `apps/web/src/hooks/use-archive-wallet.ts`                                 | exact         |
| `apps/web/src/hooks/use-reorder-holdings.ts`                                | hook          | CRUD                    | `apps/web/src/hooks/use-reorder-wallets.ts`                                | exact         |
| `apps/web/messages/en.json` (modified)                                      | config        | —                       | existing `en.json` namespace pattern                                       | role-match    |
| `apps/web/src/components/settings/investments-section.tsx`                  | component     | request-response        | `apps/web/src/components/settings/cushion-section.tsx`                     | exact         |

---

## Pattern Assignments

### `packages/investments/src/ports/price-provider.ts` (port, request-response)

**Analog:** `packages/shared-kernel/src/ports/fx-provider.ts`

**Imports pattern** (lines 1-0 — entire file):

```typescript
import type { Currency } from "../money";

export interface FxProvider {
  rateAsOf(
    from: Currency,
    to: Currency,
    date: Date,
  ): Promise<{ rate: string; provider: string; isStale: boolean }>;
}
```

**Core port pattern** — mirror exactly with a different method signature:

```typescript
// New file: packages/investments/src/ports/price-provider.ts
export interface PriceProvider {
  currentPrice(
    symbol: string,
    provider: "twelve_data" | "coingecko" | "metals_dev",
  ): Promise<{
    price: string;
    currency: string;
    provider: string;
    fetchedAt: Date;
  }>;

  searchInstruments?(
    query: string,
    limit?: number,
  ): Promise<
    Array<{ symbol: string; displayName: string; assetClass: string }>
  >;
}

// Test stub — mirrors InMemoryFxProvider:
export class InMemoryPriceProvider implements PriceProvider {
  constructor(
    private readonly fixed: Record<
      string,
      { price: string; currency: string }
    > = {},
  ) {}
  async currentPrice(symbol: string, _provider: string) {
    const hit = this.fixed[symbol];
    if (!hit) throw new Error(`InMemoryPriceProvider: no price for ${symbol}`);
    return { ...hit, provider: "in-memory", fetchedAt: new Date() };
  }
}
```

---

### `packages/investments/src/adapters/price/twelve-data.ts` (adapter, request-response)

**Analog:** `packages/budgeting/src/adapters/fx/frankfurter.ts`

**Imports pattern** (lines 1-3):

```typescript
import type { FxProvider } from "@budget/shared-kernel";
import type { FxRateCacheRepo } from "../../ports/fx-rate-cache-repo";
```

→ Mirror as:

```typescript
import type { PriceProvider } from "../../ports/price-provider";
import type { PriceCacheRepo } from "../../ports/price-cache-repo";
```

**Constructor + fetchFn injection** (lines 29-33):

```typescript
export class FrankfurterFxProvider implements FxProvider {
  constructor(
    private readonly cache: FxRateCacheRepo,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}
```

**Cache-then-live pattern** (lines 50-80):

```typescript
// cache hit → return cached
const cached = await this.cache.lookup(from, to, yyyymmdd);
if (cached) {
  return { rate: cached.rate, provider: "frankfurter", isStale: ... };
}
// live fetch → upsert cache → return
const r = await this.fetchFn(`https://api.frankfurter.dev/v2/rate/${from}/${to}?date=${yyyymmdd}`);
if (!r.ok) throw new Error(`frankfurter http ${r.status}`);
const j = (await r.json()) as { date: string; rate: number };
const rateStr = String(j.rate); // ACL: number → string at boundary
await this.cache.upsert(from, to, j.date, rateStr, "frankfurter");
return { rate: rateStr, provider: "frankfurter", isStale: ... };
```

**Error handling / fallback** (lines 74-78):

```typescript
} catch {
  const fallback = await this.cache.mostRecentPrior(from, to, yyyymmdd);
  if (!fallback) throw new NoFxRateAvailable(from, to, yyyymmdd);
  return { rate: fallback.rate, provider: "frankfurter", isStale: true };
}
```

**Note for metals-dev.ts:** Add a `refreshCadence` guard — only call the API when invoked from the daily-snapshot job context. Export a `MetalsDailyOnlyError` when called from the hourly context.

---

### `packages/investments/src/adapters/persistence/investments-schema.ts` (schema, CRUD)

**Analog:** `packages/budgeting/src/adapters/persistence/wallets-schema.ts`

**Imports pattern** (lines 1-16):

```typescript
import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  text,
  char,
  numeric,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";
```

**Table definition + CHECK + RLS pattern** (lines 18-52):

```typescript
export const wallets = budgeting.table(
  "wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    // ... fields ...
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "wallets_wallet_type_chk",
      sql`${t.walletType} IN ('SPENDINGS','CUSHION','RESERVE')`,
    ),
    pgPolicy("wallets_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
```

**For investments table:** Use `bigint("buy_price_cents", { mode: "bigint" })` for all `_cents` columns (not `numeric`). CHECK values: `'equities','etf','bond','crypto','reit','commodity','cash_fx','real_estate','other'`.

---

### `packages/investments/src/adapters/persistence/instruments-schema.ts` + `price-cache-schema.ts` + `price-snapshot-schema.ts` (schema, reference-data)

**Analog:** `packages/budgeting/src/adapters/persistence/fx-rates-schema.ts`

**Full pattern** (entire file):

```typescript
import {
  char,
  date,
  numeric,
  text,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import { budgeting } from "@budget/platform";

/** Reference data — no RLS. GRANTs in apps/migrator/post-migration.sql. */
export const fxRates = budgeting.table(
  "fx_rates",
  {
    base: char("base", { length: 3 }).notNull(),
    quote: char("quote", { length: 3 }).notNull(),
    date: date("date").notNull(),
    rate: numeric("rate", { precision: 19, scale: 8 }).notNull(),
    provider: text("provider").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.base, t.quote, t.date] })],
);
```

**Key difference:** No `pgPolicy`, no `appRole`/`workerRole` import — reference tables. Grants live in `post-migration.sql`.

---

### `packages/budgeting/src/adapters/persistence/tasks-schema.ts` (modified — add TaskKind)

**Analog:** self — lines 39-42 hold the CHECK to extend.

**Current CHECK** (lines 39-42):

```typescript
check(
  "tasks_kind_chk",
  sql`${t.kind} IN ('RESERVE_TOPUP','CONFIRM_DRAFT','CUSHION_BELOW_TARGET')`,
),
```

**Migration SQL pattern** (must DROP + ADD, not just ALTER):

```sql
ALTER TABLE budgeting.tasks DROP CONSTRAINT tasks_kind_chk;
ALTER TABLE budgeting.tasks ADD CONSTRAINT tasks_kind_chk
  CHECK (kind IN ('RESERVE_TOPUP','CONFIRM_DRAFT','CUSHION_BELOW_TARGET','INVESTMENT_INSTRUMENT_DELISTED'));
```

**Updated Drizzle CHECK** in `tasks-schema.ts`:

```typescript
check(
  "tasks_kind_chk",
  sql`${t.kind} IN ('RESERVE_TOPUP','CONFIRM_DRAFT','CUSHION_BELOW_TARGET','INVESTMENT_INSTRUMENT_DELISTED')`,
),
```

---

### `packages/budgeting/src/ports/task-repo.ts` (modified — add emit method)

**Analog:** self — lines 30-33 are the `TaskKind` union to extend; lines 119-148 show emit method signatures.

**Extended TaskKind** (lines 30-33):

```typescript
export type TaskKind =
  | "RESERVE_TOPUP"
  | "CONFIRM_DRAFT"
  | "CUSHION_BELOW_TARGET"
  | "INVESTMENT_INSTRUMENT_DELISTED"; // Phase 9 A1
```

**New payload type** — follows `ReserveTopupPayload` (lines 52-62) pattern:

```typescript
export interface InvestmentDelistedPayload {
  holding_id: string;
  holding_name: string;
  instrument_symbol: string;
}
```

**New emit method on TaskRepo interface** — follows `emitReserveTopup` (lines 119-125) signature:

```typescript
emitInvestmentDelisted(
  tenantId: string,
  budgetId: string,
  payload: InvestmentDelistedPayload,
  tx: TenantTx,
): Promise<void>;
```

---

### `packages/tenancy/src/adapters/persistence/schema.ts` (modified — add flag)

**Analog:** self — lines 43-48 show the `reservesEnabled` + `cushionEnabled` pattern.

**Exact pattern to copy** (lines 43-48):

```typescript
// Phase 5 (D-PH5-R11): global reserves toggle...
reservesEnabled: boolean("reserves_enabled").notNull().default(true),
// Phase 6 (onboarding rewrite): pure feature flag for the cushion lane...
cushionEnabled: boolean("cushion_enabled").notNull().default(true),
```

**New column to add** — append after `cushionEnabled` (line 48):

```typescript
// Phase 9: gates the Investments section on the wallets page.
investmentsEnabled: boolean("investments_enabled").notNull().default(false),
```

---

### `apps/worker/src/handlers/instrument-price-hourly.ts` (handler, batch)

**Analog:** `apps/worker/src/handlers/fx-daily-fetch.ts`

**Full file structure to mirror** (entire 59-line file):

```typescript
/**
 * instrument-price-hourly handler — hourly pg-boss job.
 * Fetches current prices for all distinct held tracked instruments.
 * No RLS: reference-data scope; withInfraTx uses worker_role.
 */
import type { PriceProvider } from "@budget/investments/src/ports/price-provider";
import { withInfraTx } from "@budget/platform";
import { sql } from "drizzle-orm";

interface PgBossLike {
  work(
    queue: string,
    handler: (job: unknown) => Promise<unknown>,
  ): Promise<void>;
}

export function registerInstrumentPriceHourly(
  boss: PgBossLike,
  priceProvider: PriceProvider,
) {
  boss.work("instrument-price-hourly", async () => {
    // Collect distinct instrument_ids held by ≥1 active budget
    // (skip custom holdings: instrument_id IS NOT NULL)
    // (skip metals: refresh_cadence = 'daily')
    const result = await withInfraTx(async (tx) => {
      const rows = await tx.execute(sql`
        SELECT DISTINCT i.id, i.symbol, i.provider AS price_provider
        FROM budgeting.investments inv
        JOIN budgeting.instruments i ON i.id = inv.instrument_id
        WHERE inv.archived_at IS NULL
          AND inv.instrument_id IS NOT NULL
          AND i.active = true
          AND i.refresh_cadence <> 'daily'
      `);
      return rows.rows as Array<{
        id: string;
        symbol: string;
        price_provider: string;
      }>;
    });
    const instruments = result.isOk() ? result.value : [];

    let fetched = 0;
    let failed = 0;
    for (const { id, symbol, price_provider } of instruments) {
      try {
        const p = await priceProvider.currentPrice(
          symbol,
          price_provider as any,
        );
        await withInfraTx(async (tx) => {
          await tx.execute(sql`
            INSERT INTO budgeting.instrument_price_cache (instrument_id, price, currency, fetched_at)
            VALUES (${id}::uuid, ${p.price}, ${p.currency}, now())
            ON CONFLICT (instrument_id) DO UPDATE
              SET price = EXCLUDED.price, currency = EXCLUDED.currency, fetched_at = EXCLUDED.fetched_at
          `);
        });
        fetched++;
      } catch {
        failed++;
      }
    }
    return { fetched, failed };
  });
}
```

---

### `apps/worker/src/worker.ts` (modified — register 3 new jobs)

**Analog:** self — lines 35-42 show the exact 3-step registration pattern per job.

**Pattern to replicate** (lines 35-42):

```typescript
// FX daily fetcher — 17:00 Europe/Berlin
const fxCache = new DrizzleFxRateCacheRepo(workerPool());
const { fxProvider, reservePositions } = createBudgetingModule({ fxCache });
await boss.createQueue("fx-daily-fetch");
await boss.schedule("fx-daily-fetch", "0 17 * * *", null, {
  tz: "Europe/Berlin",
});
registerFxDailyFetch(
  boss as unknown as Parameters<typeof registerFxDailyFetch>[0],
  fxProvider,
);
```

**Three new blocks to append:**

```typescript
// Investments: hourly price refresh
await boss.createQueue("instrument-price-hourly");
await boss.schedule("instrument-price-hourly", "0 * * * *");
registerInstrumentPriceHourly(
  boss as unknown as Parameters<typeof registerInstrumentPriceHourly>[0],
  priceProvider,
);

// Investments: daily instrument seed + delisting check
await boss.createQueue("instruments-daily-seed");
await boss.schedule("instruments-daily-seed", "0 18 * * *", null, {
  tz: "Europe/Berlin",
});
registerInstrumentsDailySeed(
  boss as unknown as Parameters<typeof registerInstrumentsDailySeed>[0],
  priceProvider,
  taskRepo,
);

// Investments: daily price + FX snapshot (after fx-daily-fetch at 17:00)
await boss.createQueue("investment-snapshot-daily");
await boss.schedule("investment-snapshot-daily", "30 17 * * *", null, {
  tz: "Europe/Berlin",
});
registerInvestmentSnapshotDaily(
  boss as unknown as Parameters<typeof registerInvestmentSnapshotDaily>[0],
  fxProvider,
);
```

---

### `apps/api/src/routes/investments.ts` (route, CRUD)

**Analog:** `apps/api/src/routes/wallets.ts`

**Route factory pattern** (lines 1-27):

```typescript
import { Hono } from "hono";
import type { BootedDeps } from "../boot";

export function createInvestmentsRoute(deps: BootedDeps) {
  const app = new Hono<{ Variables: Record<string, any> }>();

  function pickTenant(c: any): string {
    const ids = c.get("tenantIds") as string[] | undefined;
    return ids?.[0] ?? "";
  }

  async function getSchemas() {
    const { createHoldingSchema, updateHoldingSchema, reorderHoldingsSchema } =
      await import("@budget/investments/src/contracts/api");
    return { createHoldingSchema, updateHoldingSchema, reorderHoldingsSchema };
  }
  // ...
}
```

**Reorder guard pattern** (lines 213-248 of wallets.ts):

```typescript
app.post("/reorder", async (c) => {
  // ...validate...
  const r = await deps.investments.reorderHoldings({
    tenantId,
    actorUserId: userId,
    orderedIds: parsed.data.orderedIds,
  });
  if (r.isErr()) {
    const msg = r.error.message;
    if (msg === "holding_id_not_in_section") return c.json({ error: msg }, 422);
    return c.json({ error: msg }, 422);
  }
  return c.json(r.value, 200);
});
```

**Error handling** (lines 201-207 of wallets.ts):

```typescript
if (r.isErr()) {
  const msg = r.error.message;
  if (msg === "not_found") return c.json({ error: "not_found" }, 404);
  return c.json({ error: msg }, 422);
}
return c.json(r.value, 200);
```

---

### `apps/web/src/components/budgeting/wallets-tab/investments-section.tsx` (component, request-response)

**Analog:** `apps/web/src/components/budgeting/wallets-tab/wallets-sectioned-list.tsx`

**DndContext + sensor setup** (lines 152-158):

```typescript
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  useSensor(TouchSensor, {
    activationConstraint: { delay: 300, tolerance: 5 },
  }),
  useSensor(KeyboardSensor),
);
```

**Feature flag read** (lines 65-77):

```typescript
const budgetQuery = useBudget(budgetId);
const budgetMeta = budgetQuery.data as
  | {
      investmentsEnabled?: boolean;
      defaultCurrency?: string;
      default_currency?: string;
    }
  | undefined;
const investmentsEnabled = budgetMeta?.investmentsEnabled ?? false;
const budgetCurrency =
  budgetMeta?.defaultCurrency ?? budgetMeta?.default_currency ?? "EUR";
```

**DragEnd cross-section check** (lines 190-220 — resolve section from `over.id`):

```typescript
// Group header drop — prefix "group-" identifies it as a group droppable
if (droppedId.startsWith("group-")) {
  const groupName = droppedId.slice("group-".length);
  return handleGroupAssignment(dragged, groupName);
}
// Cross-section (wallet section) drop → reject
if (isWalletSectionId(droppedId)) {
  toast.error(t("crossSectionRejected"));
  return;
}
// Intra-section reorder
```

---

### `apps/web/src/components/budgeting/wallets-tab/holding-sheet.tsx` (component, request-response)

**Analog:** `apps/web/src/components/budgeting/category-form-sheet.tsx`

**Sheet chrome pattern** (entire file — 70 lines):

```typescript
"use client";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function HoldingSheet({ open, onOpenChange, mode, holding, budgetId }: HoldingSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full bg-[var(--canvas-dark)] sm:max-w-[480px]"
      >
        <SheetHeader className="mb-6">
          <SheetTitle className="text-[var(--on-dark)]">
            {mode === "create" ? t("sheet.title.add") : t("sheet.title.edit")}
          </SheetTitle>
        </SheetHeader>
        <HoldingForm mode={mode} holding={holding} budgetId={budgetId} onSuccess={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
```

**Key difference from `category-form-sheet`:** No `<SheetTrigger>` — the trigger is external (`<DashedAddButton>` or row pen icon). `open`/`onOpenChange` are controlled externally.

---

### `apps/web/src/components/settings/investments-section.tsx` (component, request-response)

**Analog:** `apps/web/src/components/settings/cushion-section.tsx`

**Flag toggle pattern** (lines 121-146):

```typescript
async function handleEnabledChange(checked: boolean) {
  setEnabled(checked);
  setSavingFlag(true);
  try {
    const res = await api.budgets[":id"].$patch({
      param: { id: budgetId },
      json: { cushion_enabled: checked }, // → investments_enabled
    });
    if (!res.ok) throw new Error("Failed to update cushion flag");
    toast.success(
      checked ? t("cushion.feature_on_toast") : t("cushion.feature_off_toast"),
    );
  } catch {
    setEnabled(!checked);
    toast.error(t("error_save"));
  } finally {
    setSavingFlag(false);
  }
}
```

**Switch JSX pattern** (lines 265-285):

```typescript
<div className="flex items-start justify-between gap-4">
  <div className="min-w-0 space-y-1">
    <p className="text-sm font-semibold text-[var(--body)]">
      {t("investments.feature_label")}
    </p>
    <p className="text-sm text-[var(--muted-foreground)]">
      {t("investments.feature_help_text")}
    </p>
  </div>
  <Switch
    checked={enabled}
    onCheckedChange={handleEnabledChange}
    disabled={savingFlag}
    aria-label={t("investments.feature_label")}
    className="shrink-0"
  />
</div>
```

---

### `apps/web/src/components/budgeting/wallets-tab/investment-row.tsx` (component, request-response)

**Analog:** `apps/web/src/components/budgeting/wallets-tab/wallet-row.tsx`

**useSortable + drag handle pattern** (lines 19-26):

```typescript
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, Pencil } from "lucide-react";
import { RowDragHandle } from "@/components/common/row-drag-handle";
```

**useSortable binding** (from wallet-row usage pattern):

```typescript
const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
  useSortable({ id: holding.id });
const style = { transform: CSS.Transform.toString(transform), transition };
```

**Key divergences from wallet-row:**

- No inline `<InlineEditCell>` — all cells are read-only text
- Mobile: `data-expanded` attribute toggles P/L% + weight% second line
- `data-delisted` prop adds `opacity-50` + `--muted-strong` text color
- Desktop hover reveals pen + trash (not just trash)

---

### `apps/web/src/hooks/use-investments.ts` (hook, request-response)

**Analog:** `apps/web/src/hooks/use-wallets.ts`

**Full pattern** (entire 52-line file):

```typescript
"use client";
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

export function useWallets(budgetId: string, initialData?: WalletDto[]) {
  return useQuery({
    queryKey: ["budget", budgetId, "wallets"],
    queryFn: async () => {
      const res = await clientApiFetch(`/wallets`, {
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      return (json.wallets ?? []) as WalletDto[];
    },
    initialData,
  });
}
```

**Adapted for investments:**

```typescript
// queryKey: ["budget", budgetId, "investments"]
// clientApiFetch(`/investments`)
// return (json.holdings ?? []) as HoldingDto[]
```

---

### `apps/web/src/hooks/use-create-holding.ts` (hook, CRUD)

**Analog:** `apps/web/src/hooks/use-create-wallet.ts` — copy the optimistic mutation pattern.

**Pattern to replicate** (the `useMutation` block in use-create-wallet.ts):

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clientApiWrite } from "@/lib/offline-write";

export function useCreateHolding(budgetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateHoldingInput) =>
      clientApiWrite("POST", `/investments`, body),
    onMutate: async (newHolding) => {
      await queryClient.cancelQueries({
        queryKey: ["budget", budgetId, "investments"],
      });
      const previous = queryClient.getQueryData([
        "budget",
        budgetId,
        "investments",
      ]);
      queryClient.setQueryData(
        ["budget", budgetId, "investments"],
        (old: HoldingDto[] | undefined) => [
          ...(old ?? []),
          { ...newHolding, id: crypto.randomUUID(), sortOrder: 9999 },
        ],
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(
        ["budget", budgetId, "investments"],
        ctx?.previous,
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["budget", budgetId, "investments"],
      });
    },
  });
}
```

---

## Shared Patterns

### Authentication / Tenant Guard

**Source:** `apps/api/src/routes/wallets.ts` — `pickTenant()` function (lines 23-26)
**Apply to:** All route handlers in `apps/api/src/routes/investments.ts`

```typescript
function pickTenant(c: any): string {
  const ids = c.get("tenantIds") as string[] | undefined;
  return ids?.[0] ?? "";
}
```

### RLS Policy (tenant-scoped tables)

**Source:** `packages/budgeting/src/adapters/persistence/wallets-schema.ts` lines 44-50
**Apply to:** `investments-schema.ts` (holdings table only — NOT instruments/cache/snapshot)

```typescript
pgPolicy("investments_tenant_isolation", {
  as: "permissive",
  for: "all",
  to: [appRole, workerRole],
  using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
  withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
}),
```

### Reference-Data Schema (no RLS)

**Source:** `packages/budgeting/src/adapters/persistence/fx-rates-schema.ts` — entire file
**Apply to:** `instruments-schema.ts`, `price-cache-schema.ts`, `price-snapshot-schema.ts`

- Import `budgeting` from `@budget/platform` only (no `appRole`/`workerRole`)
- No `pgPolicy()` call
- Grants in `apps/migrator/post-migration.sql`

### pg-boss Job Registration (reference-data)

**Source:** `apps/worker/src/handlers/fx-daily-fetch.ts` — full 59-line file
**Apply to:** All three new handler files (`instrument-price-hourly`, `instruments-daily-seed`, `investment-snapshot-daily`)

- `withInfraTx` for all DB access
- Return `{ fetched, failed }` for observability
- `boss.work(queueName, async () => { ... })` wrapper
- `PgBossLike` interface defined locally in each handler file

### Optimistic Mutation + Offline Rollback

**Source:** `apps/web/src/lib/offline-write.ts` (`clientApiWrite`) — used in every hook
**Apply to:** `use-create-holding.ts`, `use-update-holding.ts`, `use-archive-holding.ts`, `use-reorder-holdings.ts`

- Pattern: `onMutate` optimistic update → `onError` rollback → `onSettled` invalidate
- Query key: `["budget", budgetId, "investments"]`
- All writes go through `clientApiWrite` (not raw `clientApiFetch`)

### Feature Flag Toggle (Settings)

**Source:** `apps/web/src/components/settings/cushion-section.tsx` — `handleEnabledChange` (lines 121-146) + Switch JSX (lines 265-285)
**Apply to:** `apps/web/src/components/settings/investments-section.tsx`

- `useState(initialProp)` + optimistic local flip
- `api.budgets[":id"].$patch({ json: { investments_enabled: checked } })`
- Rollback on error: `setEnabled(!checked)` + `toast.error`

### FX Conversion (P/L computation)

**Source:** `packages/budgeting/src/adapters/fx/frankfurter.ts` lines 35-40 + `packages/shared-kernel/src/ports/fx-provider.ts`
**Apply to:** `packages/investments/src/adapters/persistence/holding-repo.ts` (list query enrichment), `apps/api/src/routes/investments.ts` (GET handler)

```typescript
const { rate } = await fxProvider.rateAsOf(
  currentCurrency as Currency,
  buyCurrency as Currency,
  new Date(),
);
// Money.of(currentPriceCents).times(rate) — stays in adapter layer
```

### DnD Sensor Config

**Source:** `apps/web/src/components/budgeting/wallets-tab/wallets-sectioned-list.tsx` lines 152-158
**Apply to:** `apps/web/src/components/budgeting/wallets-tab/investments-section.tsx`

```typescript
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  useSensor(TouchSensor, {
    activationConstraint: { delay: 300, tolerance: 5 },
  }),
  useSensor(KeyboardSensor),
);
```

**Critical:** Apply `useSortable` only to the `<RowDragHandle>` element, not the full row — prevents tap-expand / long-press-drag conflict on mobile.

### Hand-Authored Migration

**Source:** Migration pattern from `drizzle/0037_*.sql` and STATE.md note (drizzle-kit BigInt serialization bug)
**Apply to:** `drizzle/0038_phase09_investments.sql`

- Hand-author the SQL file (do NOT use `npx drizzle-kit generate`)
- Add journal entry manually to `drizzle/meta/_journal.json`
- Include `CREATE EXTENSION IF NOT EXISTS pg_trgm;` before trigram index

---

## No Analog Found

| File                                                                        | Role      | Data Flow        | Reason                                                                                                                                                  |
| --------------------------------------------------------------------------- | --------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/budgeting/wallets-tab/instrument-search-input.tsx` | component | request-response | No debounced-search-with-suggestion-dropdown exists in codebase; implement using shadcn `Popover` + `Command` controlled via `useEffect` debounce timer |
| `apps/web/src/components/budgeting/wallets-tab/asset-class-chip.tsx`        | component | —                | Tiny presentational badge; no close analog; implement as `<span>` with `--surface-elevated-dark` bg + `text-caption`                                    |
| `apps/web/src/components/budgeting/wallets-tab/group-combobox.tsx`          | component | request-response | Closest is shadcn `<Command>` pattern in the component library but no project-level combobox exists; implement per shadcn Combobox docs                 |

---

## Metadata

**Analog search scope:** `packages/budgeting/`, `packages/shared-kernel/`, `packages/tenancy/`, `apps/api/src/routes/`, `apps/worker/src/handlers/`, `apps/web/src/components/budgeting/`, `apps/web/src/hooks/`, `apps/web/src/components/settings/`
**Files scanned:** 18 analog source files read directly
**Pattern extraction date:** 2026-06-21
