# Phase 14: Multi-currency budgets - Pattern Map

**Mapped:** 2026-11-03
**Files analyzed:** 14 new-file kinds (plus ~25 modified aggregation sites, listed in RESEARCH Q1)
**Analogs found:** 13 / 14 (the SQL function has only a partial analog)

Scope note: CONTEXT D-13 (no tolerance) supersedes RESEARCH A2 and the tolerance parameter in `settleReserveByCurrency`. Do not copy any dead-band into the pure settle function.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `drizzle/0104_multi_currency.sql` | migration | batch/DDL+backfill | `drizzle/0101_amount_updated_at.sql` (backfill, function), `0103` (ADD COLUMN IF NOT EXISTS) | exact |
| `drizzle/meta/_journal.json` (idx 104) | config | - | entries idx 102/103 | exact |
| `apps/migrator/post-migration.sql` (only if a grant is needed) | config | - | lines 698-730 (`category_reserve_adjustments`, ledger column grants) | exact |
| `budgeting.fx_convert()` SQL function (in 0104) | utility (DB fn) | transform | `0101` `CREATE OR REPLACE FUNCTION` shape only; no scalar-function analog | partial |
| `packages/budgeting/src/adapters/persistence/fx-sql.ts` | utility | transform | RESEARCH "Code Examples" + `overview-repo.ts` sql templates | role-match |
| `packages/budgeting/test/adapters/fx-convert-fn.test.ts` and `.../ledger/read-time-conversion.test.ts` | test (DB integration) | CRUD | `packages/budgeting/test/adapters/overview-repo-needs-split.test.ts` + fx seed from `fx-rate-cache-repo.test.ts` | exact |
| `apps/api/test/architecture/no-raw-converted-sum.test.ts` | test (guard) | file-I/O scan | `apps/api/test/routes/route-coverage-audit.test.ts` (readdirSync walk) + `dep-cruiser-domain-isolation.test.ts` (location, ROOT) | role-match |
| `apps/web/e2e/features/multi-currency.feature` | test (E2E) | request-response | `reserves.feature`, `wallet-currency-gap.feature` | exact |
| `apps/web/e2e/page-objects/MultiCurrencyPo.ts` (or extend `ReservesPo.ts` / `SettingsPo.ts`) | test (PO) | - | `ReservesPo.ts` | exact |
| `apps/web/e2e/steps/multi-currency.steps.ts` | test (steps) | request-response + SQL seed | `reserves.steps.ts` (`withTenantClient`), `wallet-section-share.steps.ts` (HTTP seed), `budgets-aggregate.steps.ts` (`seedFxRates`) | exact |
| `apps/web/test/components/budgeting/task-banner-row-lines.test.tsx`, `wallet-row-reserve-currency.test.tsx` | test (Vitest) | - | `apps/web/test/components/budgeting/task-banner-row.test.tsx`, `apps/web/test/components/wallet-row.test.tsx` | exact |
| `apps/web/messages/{en,pl,uk}.json` | config (i18n) | - | `currencyReadOnlyAria` (~1919/1942/1942), `currency_locked_tooltip` (254) | exact |
| `packages/budgeting/src/domain/reserve-settle.ts` | domain pure fn | transform | no direct analog; follow `domain/reserve-engine.ts` (bigint cents, pure) | no analog (see below) |

## Pattern Assignments

### `drizzle/0104_multi_currency.sql` (migration)

**Analog:** `drizzle/0101_amount_updated_at.sql`, `0103_better_auth_17_columns.sql`

**Header and idempotent add** (0103 lines 1-7):
```sql
-- 0103: better-auth 1.7 checks the Drizzle schema ...
ALTER TABLE identity.sessions ADD COLUMN IF NOT EXISTS active_organization_id text;
--> statement-breakpoint
ALTER TABLE tenancy.budgets ADD COLUMN IF NOT EXISTS logo text;
```

**Backfill via correlated UPDATE, `--> statement-breakpoint` between every statement** (0101 lines 5-20):
```sql
ALTER TABLE budgeting.wallets ADD COLUMN IF NOT EXISTS balance_updated_at timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
UPDATE budgeting.wallets w
   SET balance_updated_at = COALESCE((SELECT max(a.occurred_at) FROM ... ), w.created_at);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION budgeting.stamp_wallet_balance_updated() RETURNS trigger
LANGUAGE plpgsql AS $$ ... $$;
```

**Apply to Phase 14** (three-step per RESEARCH Q5; tenant_id = budget id):
```sql
ALTER TABLE budgeting.categories ADD COLUMN IF NOT EXISTS currency char(3);
--> statement-breakpoint
UPDATE budgeting.categories c SET currency = b.default_currency
  FROM tenancy.budgets b WHERE b.id = c.tenant_id AND c.currency IS NULL;
--> statement-breakpoint
ALTER TABLE budgeting.categories ALTER COLUMN currency SET NOT NULL;
--> statement-breakpoint
ALTER TABLE budgeting.category_reserve_adjustments ADD COLUMN IF NOT EXISTS currency char(3) NOT NULL DEFAULT 'PLN'; -- then backfill from budget default; DEFAULT keeps old INSERTs valid
```
Traps to carry (memory `project_migration_rls_data_loss`): `categories` and `category_reserve_adjustments` are FORCE RLS. An UPDATE as a non-bypass role silently touches 0 rows. Add a test asserting `count(*) WHERE currency IS NULL = 0` after migrate, and run the migration as the migrator/owner. Per `project_drizzle_journal_registration`, the .sql file does nothing until registered in `_journal.json`.

**Journal entry** (`drizzle/meta/_journal.json` tail; next is idx 104, `when` > 1783730000000):
```json
{ "idx": 103, "version": "7", "when": 1783730000000, "tag": "0103_better_auth_17_columns", "breakpoints": true }
```
New: `{ "idx": 104, "version": "7", "when": 1783740000000, "tag": "0104_multi_currency", "breakpoints": true }`.

**Grants/RLS in post-migration.sql, not the numbered file** (`apps/migrator/post-migration.sql` 698-730). The file REVOKEs on every migrate, so numbered-file GRANTs vanish (0100 re-applied at line 714 for that reason):
```sql
GRANT UPDATE (note, transaction_date, ..., deferred_at) ON budgeting.expense_ledger TO app_role;
GRANT UPDATE (deferred_at, updated_at, amount_converted_cents, fx_rate, fx_as_of) ON budgeting.expense_ledger TO worker_role;
ALTER TABLE budgeting.category_reserve_adjustments FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON budgeting.category_reserve_adjustments TO app_role, worker_role;
REVOKE UPDATE, DELETE ON budgeting.category_reserve_adjustments FROM app_role, worker_role;
```
A new column on `category_reserve_adjustments` is covered by the table-level INSERT. `categories.currency` needs an UPDATE grant only if app_role has column-level grants on `categories`; check first. `fx_convert()` is a function in the `budgeting` schema: add `GRANT EXECUTE ON FUNCTION budgeting.fx_convert(bigint,text,text,date) TO app_role, worker_role;` here if default privileges do not cover it. `fx_rates` already grants SELECT.

### `budgeting.fx_convert()` SQL function

**Analog:** `0101` for the `CREATE OR REPLACE FUNCTION schema.name(...) ... AS $$ ... $$;` shape (plpgsql trigger there; this one is `LANGUAGE sql STABLE`). Body: RESEARCH Pattern 1.
**Mandatory:** cast text side to `::bpchar` (`fx_rates.base/quote` are `char(3)`; without it 78.9 s vs 23 ms). Columns are `base, quote, date, rate, provider, fetched_at` (not `base_currency`). Never fabricate a rate of 1; NULL propagates.

### `packages/budgeting/src/adapters/persistence/fx-sql.ts`

**Analog:** Drizzle `sql` templates in `overview-repo.ts` / `transaction-repo.ts` (Drizzle only in adapters/persistence). Use RESEARCH "SQL fragment helper" verbatim. Bind `today` from `serverNow()` (as `reserve-event-loader-repo.ts` does), never `current_date`. `sql` array params expand inline (memory `feedback_drizzle_sql_template_array_expansion`): use `sql.join` for `IN (...)`.

### `packages/budgeting/test/adapters/fx-convert-fn.test.ts`, `ledger/read-time-conversion.test.ts` (bun:test, DB integration + fx_rates seed)

**Analog 1 (tenant fixture, real Postgres, app_role):** `packages/budgeting/test/adapters/overview-repo-needs-split.test.ts` lines 13-91.

**Imports and env normalisation** (lines 13-26):
```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
for (const k of ["DATABASE_URL_APP", "DATABASE_URL_WORKER"] as const) {
  if (process.env[k]) process.env[k] = process.env[k]!.replace("@db:", "@localhost:");
}
const TENANT = crypto.randomUUID();
```

**Seed user + budget via raw pool with GUCs, then rows inside `withTenantTx`** (lines 36-90): `SET app.current_user_id`, `SET app.tenant_ids = '{TENANT}'`, `INSERT INTO identity.users ...`, `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)`, then `const r = await withTenantTx(TenantId(TENANT), UserId(USER), async (tx) => { await tx.execute(sql`INSERT INTO budgeting.categories ...`) }); if (r.isErr()) throw r.error;`. Teardown deletes children then `tenancy.budgets` (lines 93-105). New tests must also insert `currency` in the categories INSERT once 0104 lands.

**Analog 2 (fx_rates seed, exact columns):** `packages/budgeting/test/fx-rate-cache-repo.test.ts` lines 1-61 and `apps/worker/test/fx-history-backfill.test.ts:91`.
```typescript
// worker_role has SELECT+INSERT+UPDATE on fx_rates; migrator is the only role that can DELETE
await workerPool.query(
  `INSERT INTO budgeting.fx_rates (base, quote, date, rate, provider)
   VALUES ('GBP','CHF','2023-06-01', 9.9, 'test')
   ON CONFLICT (base, quote, date) DO UPDATE SET rate = 9.9`);
// cleanup (migrator pool):  DELETE FROM budgeting.fx_rates WHERE provider = 'test'
```
Use a unique `provider` tag and delete by it. Do NOT copy `seedFxRate` in `packages/budgeting/test/helpers.ts:125-148`: it inserts `tenant_id, base_currency, quote_currency, rate_date, source`, which are not the real columns (stale; Wave 0 should either fix it or add a new helper). Seed rates on each tx date plus a later date with different rates so ordering errors show (RESEARCH Q7 fixture). Perf test: run as `app_role` with RLS GUCs set, assert under 500 ms.

### `apps/api/test/architecture/no-raw-converted-sum.test.ts` (grep guard)

**Analog:** `apps/api/test/routes/route-coverage-audit.test.ts` (fs walk) + `apps/api/test/architecture/dep-cruiser-domain-isolation.test.ts` (ROOT resolution, location).

**Imports / walk** (route-coverage-audit lines 29-31, 44-52):
```typescript
import { describe, test, expect } from "bun:test";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const routesDir = join(import.meta.dir, "..", "..", "src", "routes");
const routeFiles = readdirSync(routesDir).filter((f) => f.endsWith(".ts") && !f.startsWith("_") && f !== "index.ts");
const missing: string[] = [];
// ... push offenders, then expect(missing).toEqual([]) with a readable message
```
**ROOT** (dep-cruiser test line 22): `const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");` then walk `packages/*/src` and `apps/*/src` with `readdirSync(..., { recursive: true })` (Bun/Node 20+), skip `node_modules`, read each `.ts`, flag `/amount_converted_cents/` outside an explicit `ALLOWLIST` (named, with a one-line reason per entry, like `EXCLUDED_ROUTES`/`CONSOLIDATED` in the analog). Allowlist per RESEARCH Pitfall 2: create/edit/materialise/scheduled-engine/draft repos, `expense-ledger-draft-schema.ts`, worker writers, demo manifest/refresh. Failure message lists offending files. Make it RED first (many sites), goes GREEN in plan 14-03.

### `apps/web/e2e/features/multi-currency.feature`, `page-objects/*Po.ts`, `steps/multi-currency.steps.ts`

Rules (memory `feedback_e2e_gherkin`): `.feature` + Page Object + fresh user; no raw `.spec.ts`; base URL `https://budget-dev.madonzy.com`; tag the feature (`@tasks-redesign` style tag on line 1).

**Feature analog:** `apps/web/e2e/features/reserves.feature` lines 1-26 and `wallet-currency-gap.feature`:
```gherkin
@tasks-redesign
Feature: Reserves tab — ...
  Background:
    Given I am signed in as a fresh user
    And the budget has a category "Groceries" with a monthly limit of 50000 cents
    And the budget has a RESERVE wallet "Buffer" holding 10000 cents

  Scenario: ...
    When I open the reserves tab for the budget
    Then the available cell for "Groceries" is visible
```
Reuse existing steps (`I am signed in as a fresh user`, category-with-limit, RESERVE wallet) from `common-steps.ts` / `reserves.steps.ts`; add only new ones. A new scenario set: budget currency change PLN to EUR keeps "100 zł" suffix on the PLN row; quick entry in a EUR category; category currency change converts limit; reserve task shows "Top up 120 zł and 15 €".

**Steps imports and fixture** (`wallet-section-share.steps.ts` 1-6):
```typescript
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
import { WalletSectionsPo } from "../page-objects/WalletSectionsPo";
const { Given, Then } = createBdd(test);
```
**HTTP seed with session** (same file 8-37): `fetch(`${freshUser.baseUrl}/api/wallets`, { method: "POST", headers: { "content-type": "application/json", cookie: freshUser.cookieHeader, Origin: freshUser.baseUrl, "X-Budget-ID": freshUser.budgetId }, body })`; throw on `!ok`. Use this for creating wallets/categories/transactions and for PATCHing the budget currency.

**Direct SQL seed under RLS** (`reserves.steps.ts` 15-45): `withTenantClient(budgetId, fn)` opens a pool on `DATABASE_URL_APP.replace("@db:", "@localhost:")`, `BEGIN`, `SELECT set_config('app.tenant_ids', $1, true)` with `{budgetId}`, runs fn, `COMMIT`. Use it for tasks with `lines` payload (extend `tasks.steps.ts` payload builder which sets `shortfallCents`).

**FX seed** (`budgets-aggregate.steps.ts` 222-252, `seedFxRates` + `deleteSeededFx`):
```typescript
await pool.query(
  `INSERT INTO budgeting.fx_rates (base, quote, date, rate, provider, fetched_at)
   VALUES ($1, $2, $3::date, $4, 'e2e-seed', now())
   ON CONFLICT DO NOTHING RETURNING base, quote, date::text AS date`, [base, quote, day, rate]);
// register cleanup: afterScenario(deleteSeededFx) — only the migrator can DELETE; delete only rows this run inserted
```
Note exact UTC date (memory `project_e2e_fx_cache_live_api`).

**Page Object analog** `ReservesPo.ts` lines 1-30: class with `constructor(private page: Page)`, locators by `data-testid` documented in the header (`reserves-row-<categoryId>`, `reserves-balance-<categoryId>`, `reserves-totals-footer`), `rowByCategory(name)`, async `assert...` methods using `expect(...)`. Add new testids in the components (category currency picker, budget currency select, reserve wallet currency cell, task lines) and list them in the PO header.

### Vitest component tests (`apps/web/test/components/...`)

Run with `cd apps/web && bunx vitest run <file>` (memory `feedback_bun_run_test_cwd_trap`).

**Task banner analog** `apps/web/test/components/budgeting/task-banner-row.test.tsx` lines 14-80:
```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    const dict: Record<string, string> = { "bdp.tasks.title.RESERVE_TOPUP": "Top up reserve by {amount}", /* ... */ };
    const tpl = dict[key] ?? key;
    if (!vars) return tpl;
    return Object.entries(vars).reduce((s, [k, v]) => s.replace(new RegExp(`{${k}}`, "g"), String(v)), tpl);
  },
}));
import { TaskBannerRow, type TaskSummary } from "@/components/budgeting/task-banner-row";
function makeTask(kind, payload = {}) { /* defaults: RESERVE_TOPUP: { shortfall_cents: 5000, currency: "EUR" } */ }
```
Extend `makeTask` payload with `lines: [{currency, shortfall_cents, direction, equiv?}]` and assert the joined string. Format with `Intl.ListFormat` per locale (RESEARCH "Don't Hand-Roll").

**Wallet row analog** `apps/web/test/components/wallet-row.test.tsx` lines 1-50: header comment lists coverage ("Persisted RESERVE wallet: Currency cell is read-only plain text"). That assertion becomes RED and must be INVERTED (D-09: RESERVE currency cell is an `InlineEditCell`). Mocks: `next-intl` with a key map including `currencyAria`, `currencyReadOnlyAria`; `@dnd-kit/core` `useDraggable` stub; `WalletDto` from `@/hooks/use-wallets`. Remove `currencyReadOnlyAria` from the map when the key is pruned.

Also named in RESEARCH: `foreign-amount.test.tsx`, `transaction-slider-default-currency.test.tsx`, budget-identity-section (existing file locations: grep `apps/web/test/components` first; none of `category-slider`/`transaction-slider`/`budget-identity` tests were found by name, so they may live under a different folder or need creating, follow the two analogs above).

### i18n key in en / pl / uk

**Analog keys:** `apps/web/messages/en.json:1919` (`bdp.tab.wallets.row.currencyReadOnlyAria`), `:254` (`...currency_locked_tooltip`), and the task titles at ~:1999-2003 (`bdp.tasks.title.RESERVE_TOPUP`, `...detail...`).
```json
"currencyAria": "Currency. Click to edit.",
"currencyReadOnlyAria": "Currency {ccy}. Reserve wallets must match budget currency.",
```
pl (line 1942): `"currencyReadOnlyAria": "Waluta {ccy}. Portfele rezerw muszą używać waluty budżetu."`; uk (line 1942): `"Валюта {ccy}. Гаманці резервів мають збігатися з валютою бюджету."`.
Rules: add the SAME dotted key path in all three files in one change; prune keys together (the two keys above go away with D-01/D-09, `currency_locked_tooltip` is in `settings...` at line 254 of all three, identical position). A parity check exists as a pattern: `apps/web/test/components/budgeting/spendings-grid/column-header-copy.test.ts` imports `en/pl/uk` (`import en from "../../../../messages/en.json"`) and compares copy. Copy that approach for a new key-parity assertion. Tests that resolve real keys: `reserve-rebalance.test.tsx:17` imports `messages/en.json` and walks the path. i18n JSON is bundled at build, so rebuild web (`make build-web` + `make restart-web`) before claiming done. Never say "draft" in user-facing copy.

## Shared Patterns

### Tenant tx + RLS GUC (backend DB access)
**Source:** `overview-repo-needs-split.test.ts` (tests), `@budget/platform` `withTenantTx` (code). Returns a `Result`; a silent no-op without Postgres (memory `feedback_withtenanttx_returns_result`), so always `if (r.isErr()) throw r.error`. Drizzle only in `adapters/persistence/`; `Money` converts to cents at the adapter boundary.

### Test env URL rewrite
**Source:** all DB tests: `process.env.DATABASE_URL_APP.replace("@db:", "@localhost:")`. Run through infisical (`make test`); fallback `docker compose exec db psql -U postgres -d budget` for reads.

### Rate semantics parity
`CacheOnlyFxProvider` (exact date, else most recent prior, else throw `NoFxRateAvailable`) equals SQL `date <= on_date ORDER BY date DESC LIMIT 1`. TS paths reuse `sumWalletsToCurrency` (`compute-budget-wealth-now.ts:100`) and `FxRateCacheRepo`.

### Rounding
`round(numeric)` in SQL equals big.js `new Big(x).times(rate).round(0)` half-away-from-zero (`create-transaction.ts:138`). Negative (refund) rows must match.

### E2E base conventions
Fresh user via `fresh-user-per-scenario` fixture; `https://budget-dev.madonzy.com`; bounded waits only (memory `feedback_bounded_waits_in_e2e`); re-run `bddgen` after adding steps.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `packages/budgeting/src/domain/reserve-settle.ts` (`settleReserveByCurrency`) | domain pure fn | transform | Nothing nets per-currency balances. Copy only the style of `domain/reserve-engine.ts` (pure, bigint cents, no Drizzle). Inputs: `need`/`wallets` maps by currency, `rate(from,to)` at today's rate, budget currency. NO tolerance parameter (D-13/D-15). Own currency first (D-11), then net across currencies (D-15), `equiv` in the BUDGET currency (D-16). Exactness: bigint/Big only, round half away from zero. |
| `fx_convert()` | SQL scalar function | transform | No existing scalar SQL function; only trigger functions in 0101/0102. Use RESEARCH Pattern 1. |

## Metadata

**Analog search scope:** `drizzle/`, `apps/migrator/post-migration.sql`, `packages/budgeting/test`, `apps/api/test/{architecture,routes}`, `apps/web/e2e/{features,steps,page-objects}`, `apps/web/test/components`, `apps/web/messages`, `apps/worker/test`
**Pattern extraction date:** 2026-11-03
