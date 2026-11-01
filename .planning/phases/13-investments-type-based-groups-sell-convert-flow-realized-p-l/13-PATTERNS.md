# Phase 13: Investments type groups, sell/convert, realized P/L - Pattern Map

**Mapped:** 2026-10-25
**Files analyzed:** 22 new/modified
**Analogs found:** 20 / 22

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `drizzle/0087_investment_history.sql` | migration | CRUD + batch backfill | `drizzle/0054_investment_group_flows.sql` | exact |
| `drizzle/meta/_journal.json` (idx 87) | config | - | idx 86 block (`0086_investment_price_subcent`) | exact |
| `apps/migrator/post-migration.sql` (GRANT+FORCE RLS) | config | - | L779-785 investments block | exact |
| `packages/investments/src/adapters/persistence/history-schema.ts` | model (Drizzle) | CRUD | `.../investments-schema.ts` | exact |
| `packages/investments/src/adapters/persistence/history-repo.ts` | repo adapter | CRUD, tx | `.../holding-repo.ts` | exact |
| `packages/investments/src/ports/history-repo.ts` | port | CRUD | `ports/holding-repo.ts` | exact |
| `packages/investments/src/domain/{sell-booking,contributions,type-group}.ts` | domain (pure) | transform | `domain/portfolio-metrics.ts`, `domain/deposit-value.ts` | role-match |
| `packages/investments/src/application/{sell-holding,adjust-holding,delete-history-entry,list-history,type-summary}.ts` | use-case | request-response | `application/update-holding.ts`, `archive-holding.ts` | exact |
| `packages/investments/src/contracts/{api.ts,factory.ts}` | contract/DI | - | themselves | modify |
| `apps/api/src/routes/investments.ts` (+ sell/adjust/history/type-summary) | route | request-response | same file `/:id/archive`, `PATCH /:id` | exact |
| `apps/api/test/routes/investments-history.test.ts` | test (integration) | request-response | `apps/api/test/routes/investments.test.ts` | exact |
| `packages/investments/test/domain/*.test.ts` | test (unit) | transform | `test/domain/holding-metrics.test.ts` | exact |
| `packages/budgeting/src/application/get-overview-wealth.ts` | use-case | transform | itself (`costOf`/`pickAdj` L232-242) | modify |
| `packages/budgeting/src/adapters/persistence/wealth-snapshot-repo.ts` | repo | read | itself L35-60 | modify (likely untouched) |
| `packages/platform/src/demo/manifest.ts` | config | - | `budgeting.investments` entry L305, wipe list L548 | exact |
| `apps/web/src/lib/investment-grouping.ts` | utility (pure) | transform | itself (rewrite type-keyed) | modify |
| `apps/web/src/lib/investment-types.ts` | config | - | itself (`UiType`, `UI_TYPE_ORDER`) | modify |
| `apps/web/src/hooks/use-investments.ts` (+ type-summary/history hooks) | hook | request-response | `useInvestments` L89-102 | exact |
| `.../wallets-tab/sell-sheet.tsx`, `history-section.tsx` | component | request-response | `holding-sheet.tsx` | role-match |
| `.../wallets-tab/investment-type-header.tsx` | component | event-driven | `investment-group-header.tsx` | exact |
| `apps/web/test/investments/*.test.tsx` | test (Vitest) | - | `investment-group-header.test.tsx` | exact |
| `apps/web/e2e/{features,page-objects,steps}/investments-history.*` | e2e | - | `investments-wallet.feature`, `InvestmentsPo.ts`, `investments.steps.ts` | exact |
| `apps/web/messages/{en,pl,uk}.json` | i18n | - | existing `Investments` namespace | exact |

## Pattern Assignments

### `drizzle/0087_investment_history.sql` (migration)

**Analog:** `drizzle/0054_investment_group_flows.sql` L19-60. Header comment explaining WHY, `--> statement-breakpoint` between every statement, idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`).

```sql
CREATE TABLE IF NOT EXISTS budgeting.investment_group_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  budget_id uuid NOT NULL,
  ...
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS investment_group_flows_lookup_idx ON ... (budget_id, tenant_id, group_name);
--> statement-breakpoint
ALTER TABLE budgeting.investment_group_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgeting.investment_group_flows FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS investment_group_flows_tenant_isolation ON budgeting.investment_group_flows;
CREATE POLICY investment_group_flows_tenant_isolation ON budgeting.investment_group_flows
  AS PERMISSIVE FOR ALL TO app_role, worker_role
  USING (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON budgeting.investment_group_flows TO app_role, worker_role;
```

Add to 0087: FK `budget_id -> tenancy.budgets ON DELETE CASCADE`, kind CHECK, drop+add `investments_ui_type_chk` (stocks merge, D-10/11), UPDATE ui_type remap, Start-row `INSERT ... SELECT` from non-archived holdings (RESEARCH pitfall 3: assert rowcount in a test).

**Journal** (`drizzle/meta/_journal.json` tail): copy idx 86 block; `idx: 87`, `when` > 1782742801012, `tag: "0087_investment_history"`, `version: "7"`, `breakpoints: true`. Missing entry = silently never runs.

**post-migration.sql** (L779-785): GRANT + `ALTER TABLE ... FORCE ROW LEVEL SECURITY` for the new table, same block style:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON budgeting.investments TO app_role, worker_role;
ALTER TABLE budgeting.investments FORCE ROW LEVEL SECURITY;
```

### `history-schema.ts` (Drizzle model)

**Analog:** `packages/investments/src/adapters/persistence/investments-schema.ts` L1-60. Header: "types + RLS policy only; FK authored in SQL migration". Imports:
```ts
import { sql } from "drizzle-orm";
import { pgPolicy, uuid, text, char, numeric, bigint, integer, timestamp, date, check } from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";
export const investments = budgeting.table("investments", { id: uuid("id").primaryKey().defaultRandom(), tenantId: uuid("tenant_id").notNull(), ... },
  (t) => [ check(...), pgPolicy("investments_tenant_isolation", { as: "permissive", for: "all", to: [appRole, workerRole], ... }) ]);
```
Money = `bigint(..., {mode:"bigint"})`, quantity = `numeric(28,8)`.

### `history-repo.ts` + port

**Analog:** `adapters/persistence/holding-repo.ts` L1-67, 100-118; port `ports/holding-repo.ts`. Port has NO drizzle. Adapter uses raw `sql` via `tx.execute`, `withTenantTx`, bigint bound as strings, `::text` casts on read, throw on `r.isErr()`.
```ts
import Big from "big.js";
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
type DrizzleTx = { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };
...
const r = await withTenantTx(TenantId(tenantId), UserId(userId), async (tx) => {
  const res = await (tx as DrizzleTx).execute(sql`INSERT ... RETURNING id::text AS id, buy_price_cents::text AS buy_price_cents ...`);
  return mapRow(res.rows[0]);
});
if (r.isErr()) throw r.error;   // withTenantTx returns a Result: silent no-op trap
return r.value;
```
Sell = ONE tx updating the holding and inserting history rows (sharing `transfer_id` for convert legs). Wealth-side read analog: `packages/budgeting/src/adapters/persistence/wealth-snapshot-repo.ts` L35-60 (`withTenantTx(TenantId(budgetId), UserId(SYSTEM_USER_ID), ...)`, `BigInt(row.x as string)`).

### Domain pure files

**Analog:** `domain/portfolio-metrics.ts` (big.js, no drizzle), `domain/deposit-value.ts`. Money helpers to reuse: `centsToMoney`/`moneyToCents` in `packages/budgeting/src/application/compute-budget-wealth-now.ts` L81-87 (`Money.of(dec, currency as Currency)`). Tests: `packages/investments/test/domain/holding-metrics.test.ts` (`import { describe, test, expect } from "bun:test"`, relative `../../src/domain/...` imports). `portfolio-metrics.ts` L157-190 `groupWeights` keyed by `h.group` must be re-keyed by `uiType`.

### Use-cases (sell/adjust/delete/list/type-summary)

**Analog:** `application/archive-holding.ts` (full file, factory + neverthrow) and `update-holding.ts` L1-40 (read-modify-write with `findById` then `err(new Error("not_found"))`).
```ts
import { ok, err, type Result } from "neverthrow";
export function archiveHolding(deps: { holdingRepo: HoldingRepo }) {
  return async (input: { tenantId: string; holdingId: string; actorUserId: string }): Promise<Result<{ ok: true }, Error>> => {
    try { await deps.holdingRepo.archive(input.tenantId, input.actorUserId, input.holdingId); return ok({ ok: true }); }
    catch (e) { return err(e as Error); }
  };
}
```
FX: `deps.fxProvider.rateAsOf(from, to, date)` as `list-holdings.ts` does; test stub `{ rateAsOf: async () => ({ rate: "1", provider: "stub", isStale: false }) }`. `NoFxRateAvailable` -> 422, never default 1.
Wire in `contracts/factory.ts` L32-52: add `historyRepo` dep and entries beside `archiveHolding: archiveHolding({ holdingRepo })`.
Zod: `contracts/api.ts` L54 `UI_TYPE_TO_HOLDING_TYPE` add `stocks: "equities"`, remove equity/etf/etb/reit keys. New sell/adjust schemas must not inherit `quantity.default("1")`.

### `apps/api/src/routes/investments.ts` (route)

**Analog:** same file L9-20, L172-225.
```ts
const app = new Hono<{ Variables: Record<string, any> }>();
function pickTenant(c: any): string { const ids = c.get("tenantIds") as string[] | undefined; return ids?.[0] ?? ""; }
...
app.post("/:id/archive", async (c) => {
  const session = c.get("session");
  const tenantId = pickTenant(c);
  const userId = (c.get("userId") as string) ?? session?.user?.id;
  const { id: holdingId } = c.req.param();
  const r = await deps.investments.archiveHolding({ tenantId, holdingId, actorUserId: userId });
  if (r.isErr()) return c.json({ error: r.error.message }, 422);
  return c.json(r.value);
});
```
PATCH pattern (L175-206): `if (!session) 401`, `c.req.json().catch(() => null)` -> 422, `schema.safeParse` -> 422 with `issues`, `not_found` -> 404. Server errors: `serverError(c, "code", r.error)` (L102). Serialize bigint to string (`serializeHolding`). Add `POST /:id/sell`, `POST /:id/adjust`, `GET /:id/history`, `DELETE /history/:entryId`, `GET /type-summary`. Group order: reuse `PUT /budgets/:id/ui-prefs` in `apps/api/src/routes/budget-members.ts` L239-259 (merge; RESEARCH A3 per-member vs per-budget open).

### `apps/api/test/routes/investments-history.test.ts`

**Analog:** `apps/api/test/routes/investments.test.ts` L1-120. Real PG, env guards, `resetPools()`, `createFixture()` (BEGIN, insert identity.users, tenancy.budgets with `investments_enabled`, budget_members, COMMIT), `buildApp(fix)` with dynamic imports of `createInvestmentsModule`, `Drizzle*Repo`, stub `fxProvider`. Add cross-tenant RLS case (history invisible), and `make ci-gate` leak case.
```ts
const DB_APP_RAW = process.env.DATABASE_URL_APP; ...
process.env.DATABASE_URL_APP = DB_APP_RAW.replace("@db:", "@localhost:");
const { resetPools } = await import("@budget/platform"); resetPools();
```

### Overview hybrid contributions (`get-overview-wealth.ts`)

**Analog:** itself L232-242:
```ts
const costOf = (r: { investment_cost_basis_cents: bigint | null }): bigint =>
  input.net && view === "investments" ? (r.investment_cost_basis_cents ?? 0n) : 0n;
const pickAdj = (r) => pick(r) - costOf(r);
```
Used at L244-249, 264, 325-326 (series, live point, dynamics). Replace `costOf` with: if point date >= budget's first history entry -> `contributionsAsOf(date)` via new port (rate per (ccy,date), memoized), else stored snapshot cost. Live point uses today's rate. Hex: ports only, bigint, FX via `FxProvider.rateAsOf`. Tests extend `packages/budgeting/test/overview/get-overview-cards.test.ts` / `compute-budget-wealth-now.test.ts`. Worker snapshot (`boot.ts` L456, `investmentCostBasisCents`) stays unchanged (D-08).

### Demo manifest

**Analog:** `packages/platform/src/demo/manifest.ts` L303-320 (`{ table: "budgeting.investments", mode: "copy", columns: { id, tenant_id: tenant, budget_id: ref("tenancy.budgets"), ... } }`) and wipe list L540-552. Add history table in both; `qty_delta` scaling like `quantity`, money cols like money. `group_name` left in place. Test: `packages/platform/test/demo-preflight.test.ts`.

### Web: `investment-types.ts`, `investment-grouping.ts`

Modify in place. `UiType` union (L14-28): replace `equity|etf|etb|reit` with `stocks`; update `UI_TYPE_ORDER`. `investment-grouping.ts` L1-30 `buildInvestmentEntries` / `InvestmentEntry = group|loose` -> type-keyed, no loose entries, no cross-group drag; delete `computeJoinBands` and tests (RESEARCH pitfall 14). Keep helpers pure, tested in `apps/web/test/investments/investment-grouping.test.ts`.

### Web hooks

**Analog:** `apps/web/src/hooks/use-investments.ts` L89-102. Keep cache a plain `HoldingDto[]`; new hooks under own keys.
```ts
useQuery({ queryKey: ["budget", budgetId, "investments"],
  queryFn: async () => { const res = await clientApiFetch(`/budgets/${budgetId}/investments`, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) throw new Error(await res.text()); const json = await res.json(); return (json.holdings ?? []) as HoldingDto[]; }, initialData });
```
New keys: `["budget", id, "investments", "type-summary"]`, `[..., "history", holdingId]`. Writes: `clientApiWrite(path, init)` from `apps/web/src/lib/offline-write.ts` L64 (throws `OfflineWriteError` on 5xx/network; 4xx returned for caller). Sell = ONE request. Invalidate investments, type-summary, history, overview wealth keys.

### Web components

- `investment-type-header.tsx`: copy `investment-group-header.tsx` (header doc L1-12: row-like, desktop inline, mobile tap toggles sub-line, chevron collapse, `dragHandle` injected via parent `useSortable`). Add realized sub-line (D-15). Keep testids pattern `investment-group-<key>`, `-toggle-`, `-chevron-` (used by `InvestmentsPo`).
- `sell-sheet.tsx` / `history-section.tsx`: copy `holding-sheet.tsx` (shadcn `Sheet, SheetContent, SheetHeader, SheetTitle` imports L21-24; props interface L80; controlled `<Sheet` L640; `data-testid="holding-sheet"`). Sell "new investment" reuses its type forms. Remove group field (and `group-combobox.tsx`).
- `investments-section.tsx`: single flat SortableContext rule from `INVESTMENTS-DND.md`; rewrite doc.
- Vitest: `apps/web/test/investments/investment-group-header.test.tsx` L1-30 pattern: `vi.mock("next-intl", () => ({ useTranslations: (_ns) => (key, params) => map[key] ?? key, useLocale: () => "en" }))`, `render/screen/fireEvent`. Run `cd apps/web && bunx vitest run test/investments`.

### E2E

**Analogs:** `apps/web/e2e/features/investments-wallet.feature` (tag line `@investments-wallet`, `Background: Given I am signed in as a fresh user`, `Given investments are enabled for my budget`), `page-objects/InvestmentsPo.ts` (class with `constructor(private page: Page)`, `getByTestId` accessors), `steps/investments.steps.ts` L1-30:
```ts
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
import { InvestmentsPo } from "../page-objects/InvestmentsPo";
const { Given, When, Then } = createBdd(test);
```
DB seeding via `withBudgetGuc(budgetId, run)` (sets `app.tenant_ids` GUC in a tx). New files `investments-history.feature` (`@investments-history`), `InvestmentsHistoryPo.ts`, steps. Update group steps in `investments.steps.ts`; remove `@skip` drag-into-group scenario. Re-run `bddgen`. Base URL https://budget-dev.madonzy.com.

### i18n

`apps/web/messages/{en,pl,uk}.json` (79K/85K/113K). Existing `Investments` namespace (en.json ~L769, L1509/1532 area). Add keys to ALL three locales in the same edit (sell steps, history kinds, `incl. realized`, type names for `stocks`; drop group-combobox keys). Rebuild `web` after.

## Shared Patterns

- **Tenant from `pickTenant(c)`**, never client; RLS second layer; `withTenantTx` result must be checked (`isErr()`).
- **Hex rule:** Drizzle only in `adapters/persistence/`; ports/domain pure; Money to `{amount_cents, currency}` at adapter boundary; quantity `numeric(28,8)` as string.
- **Error shape:** use-cases return `Result<_, Error>`; routes map `not_found`->404, others->422, infra->`serverError`.
- **RLS migration quartet:** table + ENABLE/FORCE RLS + `tenant_isolation` policy + GRANT (0054) plus FORCE/GRANT in `post-migration.sql` plus `_journal.json`.
- **Offline writes** via `clientApiWrite` only.
- **GDPR:** add new table to Phase 10-06 account-deletion cascade list and export (not found in this scan; planner should grep `account-deletion`).

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `domain/contributions.ts` (per-date FX conversion on read) | domain | No existing "convert entries at each chart point's date" helper; closest is distinct-pair FX batching in `get-budget-home-summary.ts` / `compute-budget-wealth-now.ts`. Use RESEARCH design with `rateFor(ccy,date)` callback. |
| Soft-delete reverse of ledger (`deleted_at` history) | adapter | No soft-deleted ledger in investments; follow RESEARCH schema. |

## Metadata

**Analog search scope:** `packages/investments`, `packages/budgeting` (overview, wealth repo), `apps/api/src/routes`, `apps/api/test/routes`, `drizzle/`, `apps/migrator`, `apps/web/{src,test,e2e,messages}`, `packages/platform/src/demo`
**Files scanned:** ~35
**Pattern extraction date:** 2026-10-25
