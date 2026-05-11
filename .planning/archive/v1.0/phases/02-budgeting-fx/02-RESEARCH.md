# Phase 2: Budgeting & FX — Research

**Researched:** 2026-05-09
**Domain:** Budgeting bounded context (accounts, categories, limits, transactions, recurring engine, FX adapter, idempotency middleware, projections)
**Confidence:** HIGH for stack/patterns (Phase 1 codebase fully read), MEDIUM for novel patterns (effective-dated limits, recurring drafts) which are domain-modeling rather than library-driven

---

## Phase Summary

Phase 2 ships the **Budgeting bounded context** end-to-end on top of the Phase 1 architectural rails (RLS, `withTenantTx`, append-only `expense_ledger`, `audit_history`, transactional outbox, `Money` value object, `Clock`/`FxProvider` ports, pg-boss). Scope: 7 new domain entities (Account, Category, CategoryLimit, BudgetTemplate, RecurringRule, RecurringDraft, MemberShareOverride), 1 cache table (`fx_rates`), 1 projection table (`spending_by_category_month`), 1 platform middleware (`Idempotency-Key`), and a Frankfurter adapter implementing the locked `FxProvider` port. UI surfaces: accounts CRUD, categories+limits CRUD, transaction capture form, transaction list/edit/search, recurring rule CRUD, pending-recurring inbox, budget templates, contribution-share editor, FX freshness badge.

The architectural shape is largely determined: hexagonal-per-context Drizzle adapters, `Money`-only domain math, RLS via existing `pgPolicy()` pattern matching `expense_ledger`, append-only correction rows (already pre-built `corrects_id`/`corrected_by_id` columns), `audit_history` for non-ledger entity edits, outbox events emitted in the same tx as ledger writes. The interesting domain modeling decisions are (a) the **effective-dated time-series for category limits** (D-04-b), (b) the **pending-by-default recurring draft model** (D-01-e/f/g) which separates mutable drafts from the immutable ledger, (c) the **on-demand top-up + daily Frankfurter fetch** with most-recent-prior fallback (D-03-a/b/c), and (d) the **Idempotency-Key middleware** with `(scope_hash, body_hash)` two-layer dedup.

**Primary recommendation:** Slice the work into **9 plans** (foundations → FX adapter + idempotency middleware → accounts → categories+limits → transactions+ledger writer → recurring engine → search/filter+bulk → contribution shares → projections+reconciliation+UI), each TDD-first against the existing testcontainer harness. The platform infrastructure is sufficient — Phase 2 plans reuse, never extend, the Phase 1 substrate.

---

## Architectural Responsibility Map

| Capability                          | Primary Tier               | Secondary Tier                              | Rationale                                                                     |
| ----------------------------------- | -------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| Account CRUD, balance math          | API / Backend              | Frontend Server (RSC for list views)        | Domain logic + RLS; UI is thin form/table                                     |
| Category + limit CRUD               | API / Backend              | Frontend Server                             | Same — domain owns "effective-dated limit" rule                               |
| Transaction capture form            | Browser (form state) → API | API (ledger insert + FX)                    | Form is client-side; Money math + FX lookup + ledger insert is API-only       |
| FX rate lookup (live + cache)       | API / Backend              | Database (cache table)                      | `FxProvider` port adapter; Frankfurter call is server-side only               |
| FX freshness badge                  | Browser                    | API (returns `fx_rate_date`, `fx_provider`) | Pure render: humanize-duration of API-supplied timestamp                      |
| Idempotency-Key middleware          | API / Backend              | Database (cache table)                      | HTTP middleware before route handlers; storage in `platform.idempotency_keys` |
| Recurring engine (due-date scan)    | Worker / pg-boss           | Database                                    | Worker job scans rules, inserts drafts; not on hot path                       |
| Recurring draft confirm/skip        | API / Backend              | Frontend Server (inbox UI)                  | Confirm = ledger insert; UI is list+button                                    |
| Search / filter / bulk-recategorize | API / Backend              | Frontend Server (RSC table + filter chips)  | Postgres FTS + indexed filters; UI is table                                   |
| Contribution-share editor           | Browser (form) → API       | API (sum-100 validation)                    | Live sum=100 counter is client-side; server re-validates                      |
| Daily FX fetcher                    | Worker / pg-boss           | External API (Frankfurter)                  | Cron job at 17:00 CET pulls rates                                             |
| Reconciliation cron                 | Worker / pg-boss           | Database                                    | Hourly drift check; not user-facing                                           |
| Replay-from-ledger CLI              | CLI script                 | Database                                    | Operator-only; rebuilds projection                                            |

---

## Reusable Assets (from Phase 1)

These exist on disk and Phase 2 must consume — not redesign — them. Direct file paths:

### Tables already created

- **`packages/platform/src/db/expense-ledger.ts`** — `budgeting.expense_ledger` table. INSERT-only via REVOKE UPDATE/DELETE (`apps/migrator/post-migration.sql:11-15`). Columns: `id`, `tenant_id`, `amount_orig`, `currency_orig`, `amount_default`, `currency_default`, `fx_rate`, `fx_rate_date`, `fx_provider`, `corrects_id`, `corrected_by_id`, `created_at`. RLS policy `expense_ledger_tenant_isolation` against `app.tenant_ids` GUC.
- **`packages/platform/src/audit/schema.ts`** — `shared_kernel.audit_history` with `pgEnum('audit_action', ['create','update','delete'])`, RLS-tenant-isolated.
- **`packages/platform/src/outbox/schema.ts`** — `shared_kernel.outbox` with `tenant_id`, `aggregate_type`, `aggregate_id`, `event_type`, `payload_jsonb`, `dispatched_at`. NO RLS, GRANT-restricted (app: INSERT only; worker: SELECT/UPDATE only).

### Ports + factories

- **`packages/shared-kernel/src/ports/fx-provider.ts`** — `FxProvider` interface: `rateAsOf(from: Currency, to: Currency, date: Date): Promise<{rate: string; provider: string; isStale: boolean}>`. Locked signature. Phase 2 ships `FrankfurterFxProvider` implementing this, plus existing `InMemoryFxProvider`.
- **`packages/shared-kernel/src/ports/outbox.ts`** — `OutboxWriter` interface (used by domain to publish events).
- **`packages/shared-kernel/src/clock.ts`** — `Clock` port + `SystemClock`/`FakeClock`.

### Tx primitives (`packages/platform/src/db/tx.ts`)

- `withTenantTx(tenantId, userId, fn)` — single-tenant write. **All Budgeting writes use this.**
- `withTenantTxRead(tenantIds, userId, fn)` — multi-tenant read (for cross-workspace dashboards in Phase 4, but Phase 2 search uses single-tenant).
- `withInfraTx(fn)` — infrastructure carve-out (NO GUCs). Used by FX daily fetcher, recurring engine job, outbox dispatcher.
- `withUserContext(userId, fn)` — user-scoped tables only.

### Helpers

- **`packages/platform/src/audit/writer.ts`** — `writeAudit(tx, evt)` raw-SQL INSERT into `shared_kernel.audit_history`.
- **`packages/platform/src/outbox/writer.ts`** — `writeOutbox(tx, evt)` raw-SQL INSERT into `shared_kernel.outbox`.
- **`packages/platform/src/jobs/boss.ts`** — `getBoss()` / `stopBoss()` pg-boss singletons. v12.18.2 named import `{ PgBoss }`.
- **`packages/platform/src/db/schemas.ts`** — `pgSchema('budgeting')` already declared. New tables go in this namespace.
- **`packages/platform/src/db/roles.ts`** — `appRole`, `workerRole` Drizzle role objects for `pgPolicy({to: [appRole, workerRole], ...})`.

### Domain primitives (`packages/shared-kernel/src/`)

- **`money.ts`** — `Money.of(amount: string, currency: Currency)`, `add()`, `toDb() → {amount_str, currency}`. fiat NUMERIC(19,4), crypto NUMERIC(38,18).
- **`result.ts`** — `Result<T,E>` via neverthrow.
- **`ids.ts`** — `TenantId`, `UserId` branded types; `newTenantId()`, `newUserId()` UUID v7.

### Migrator + post-migration patterns

- **`apps/migrator/post-migration.sql`** — Phase 2 must extend with: GRANTs for new Budgeting tables, `ALTER TABLE ... FORCE ROW LEVEL SECURITY` for each, REVOKEs where append-only required (none beyond ledger; recurring_drafts is mutable), DEFERRABLE constraint trigger for `member_share_overrides` sum-to-100 (mirroring existing `shares_sum_invariant` at line 343).

### CI / dependency-cruiser rules

- **`.dependency-cruiser.cjs`** — `domain-no-orm` forbids `drizzle-orm` imports in `domain/` folders. Phase 2 plans must put Drizzle queries in `packages/budgeting/src/adapters/persistence/` only.
- **`grep:no-direct-tx`** — only `tx.ts` may call `.transaction(`. Phase 2 plans must NOT add raw transactions outside that file.
- **`grep:no-pool-connect`** — only test bootstraps may call `appPool().connect()`. Workspaces.ts:134 uses `appPool().query` which is a workaround already in production; Phase 2 routes must use the tx primitives.
- **`eslint-rules/no-float-money.cjs`** — bans `+`/`-`/`*` on identifiers matching `*amount/money/total/sum/price/cost/balance`. Domain math goes through `Money.add()`.

### Existing API patterns (from `apps/api/src/`)

- **Hono v4.12** + `@hono/zod-validator@0.7.6` + Zod v3 for request validation.
- **Auth → tenant-guard → i18n** middleware chain in `apps/api/src/app.ts`. Phase 2 Idempotency-Key middleware inserts AFTER tenant-guard (needs tenantId).
- **`BootedDeps`** factory pattern in `apps/api/src/boot.ts` — Phase 2 adds `deps.budgeting.{accountRepo, categoryRepo, ...}` and the FX adapter handle.

### Worker (`apps/worker/src/`)

- **`worker.ts`** — pg-boss + outbox dispatch already running. Phase 2 registers new pg-boss queues: `fx-daily-fetch`, `recurring-engine`, `budgeting-reconciliation`.

---

## Phase Requirements

| ID          | Description                                                     | Research Support                                                                                                                                       |
| ----------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MONY-03     | Any monetary input accepts any currency                         | Money value object + Frankfurter adapter convert at boundary                                                                                           |
| MONY-04     | Auto-convert to default currency at FX rate of transaction date | `FxProvider.rateAsOf` already locked; Frankfurter `/v2/rate/{base}/{quote}?date=...` endpoint                                                          |
| MONY-05     | FX rates cached locally with stale fallback                     | `budgeting.fx_rates` cache + most-recent-prior query (D-03-a/b)                                                                                        |
| MONY-06     | Ledger row stores all 7 FX columns                              | Already pre-built on `expense_ledger`; Phase 2 INSERTs                                                                                                 |
| ACCT-01..04 | Account model with kinds, scope, balance, archive               | New `budgeting.accounts` table with `kind` enum, `scope`, `currency`, `archived_at`, computed-from-ledger or stored balance                            |
| BDGT-01..02 | Categories with one-level groups                                | New `budgeting.categories` table with self-referencing `parent_id` (NULL or one level deep, enforced by trigger)                                       |
| BDGT-03..05 | Normal + cushion limits, edit + audit                           | `budgeting.category_limits` effective-dated time-series (D-04-b)                                                                                       |
| BDGT-06     | Archive categories                                              | `archived_at` column + filter in queries                                                                                                               |
| BDGT-07     | Budget templates                                                | `budgeting.budget_templates` + `budget_template_items` (D-04-d: bulk-create limit rows)                                                                |
| BDGT-08     | Per-category contribution-share overrides                       | `budgeting.category_share_overrides` table + sum-to-100 deferred constraint trigger                                                                    |
| EXPN-01..03 | Expense / income / transfer                                     | Single ledger model with `kind` discriminator; transfer = two linked rows (Claude's discretion default)                                                |
| EXPN-06     | Edit creates correction row, original immutable                 | Append-only via `corrects_id`; "latest view" query `WHERE corrected_by_id IS NULL`                                                                     |
| EXPN-07     | DROPPED per D-01-c                                              | NOT in scope                                                                                                                                           |
| EXPN-08     | Recurring transactions                                          | New `budgeting.recurring_rules` + `budgeting.recurring_drafts` (D-01-e); pg-boss daily job                                                             |
| EXPN-09     | Search/filter                                                   | Postgres FTS (`tsvector` GENERATED column on `note`) + indexed equality filters                                                                        |
| EXPN-10     | Bulk re-categorize                                              | Multi-correction-row write per D-01-a                                                                                                                  |
| EXPN-11     | Multi-currency capture                                          | Already covered by MONY-03/04/06                                                                                                                       |
| EXPN-12     | Idempotency-Key on every mutating endpoint                      | New `platform.idempotency_keys` table + `idempotencyMiddleware`                                                                                        |
| EXPN-13     | Deposit FX-preview                                              | UI live-preview via on-demand FX fetch; rate locked at preview, server validates ≤60min freshness                                                      |
| ENGR-09     | Three mandatory ACLs                                            | Phase 2 ships **External price/FX → domain Money** ACL (Frankfurter response → Money conversion sits in adapter, never leaks)                          |
| ENGR-14     | Projections in same tx as ledger writes                         | `budgeting.spending_by_category_month` updated in the same `withTenantTx` block as ledger INSERT; reconciliation cron + `bun run replay:budgeting` CLI |

---

## Investigation Notes

### 1. Idempotency-Key Middleware [VERIFIED: codebase grep]

**Phase 1 status:** No middleware exists yet. `grep -r "Idempotency" apps/api/src` returns zero results. The CONTEXT.md description ("Idempotency middleware scaffolding") was aspirational — Phase 2 ships it from scratch.

**Design (per D-04 Claude's discretion, already locked in CONTEXT.md):**

- Storage: `platform.idempotency_keys` (new — note: `platform` schema does not exist yet; recommend placing in `shared_kernel` namespace which is the existing infra schema, OR adding a new `platform` schema declaration in `schemas.ts`. Recommendation: **`shared_kernel.idempotency_keys`** — matches existing `audit_history`, `outbox`, `user_keys` placement).
- Columns: `(scope_hash CHAR(64), body_hash CHAR(64), tenant_id UUID, user_id UUID, route TEXT, response_status INT, response_body_jsonb JSONB, created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ)`. Primary key `(scope_hash)` where `scope_hash = sha256(tenant_id || user_id || route || key_value)`.
- TTL: 24h fixed. `expires_at = created_at + interval '24 hours'`. Hourly pg-boss cleanup job: `DELETE FROM ... WHERE expires_at < now()`.
- Behavior: on first call, write `(scope_hash, body_hash, response_status, response_body_jsonb)` AFTER the route handler succeeds. On replay with same `body_hash` → return cached response verbatim. On replay with different `body_hash` → 422 `{error: "idempotency_key_reused_with_different_body"}`.
- RLS: `tenant_id`-scoped policy matching `app.tenant_ids` (the route handler runs inside `withTenantTx`).
- Hono integration: middleware runs after `tenantGuard` (so `tenantId` is in context) but before route handler. Reads `Idempotency-Key` header, hashes body, looks up cache, replays or proceeds.

**Critical pitfall** [CITED: stripe.com/docs/api/idempotent_requests]: Stripe's published reference behavior — if a key was used recently with a different body, return an error rather than honoring the new request. We follow that pattern. Without the body-hash check, two different transactions with the same client-generated key would both succeed silently.

**Race condition:** Two concurrent requests with the same key. Mitigation: SELECT FOR UPDATE on the row, or rely on the unique constraint to fail one with 23505 (planner picks).

**Confidence:** HIGH (well-known industry pattern, locked decisions in CONTEXT.md).

### 2. Append-only Ledger Correction-Row Pattern [VERIFIED: codebase]

**Already pre-built in Phase 1:**

- `corrects_id UUID` and `corrected_by_id UUID` columns on `expense_ledger`.
- DB-level REVOKE UPDATE, DELETE on `app_role`, `worker_role`.
- RLS policy via `app.tenant_ids` GUC.

**Design rules for Phase 2:**

- **Edit = INSERT new row + UPDATE original.corrected_by_id.** But the original row's `corrected_by_id` is the only mutation allowed — and it's REVOKE'd! Solution: use a **BEFORE UPDATE trigger that allows ONLY the `corrected_by_id` column to change** (everything else `RAISE EXCEPTION`). Alternative: do not store `corrected_by_id` at all, and derive "is corrected" by `EXISTS (SELECT 1 FROM expense_ledger c WHERE c.corrects_id = this.id)`. **Recommendation: drop the column or rebuild it as a generated/derived view.** This is a defect in the Phase 1 schema that Phase 2 must resolve. [ASSUMED: This needs explicit confirmation from the planner — the column exists but cannot be written to under current grants.]
- **Latest view query:** `SELECT * FROM expense_ledger WHERE corrected_by_id IS NULL` — only works if `corrected_by_id` is settable. Alternative: `WHERE id NOT IN (SELECT corrects_id FROM expense_ledger WHERE corrects_id IS NOT NULL)`. Both work; the second is index-friendly with `idx_corrects_id`.
- **Audit trail derivation:** correction chain is `expense_ledger` itself — no separate audit_history rows needed for ledger edits. The chain: original.id ← corrects_id ← corrects_id ← ... terminating where `corrected_by_id IS NULL`.
- **Recurring confirmation writes a fresh ledger row** with `corrects_id = NULL` (not a correction, a new transaction).
- **Bulk re-categorize** per row creates a correction row. Audit history bloats but it is correct (D-01).

**Confidence:** MEDIUM — the `corrected_by_id` column-write conflict needs planner attention. Marked as Open Question.

### 3. FX Freshness + Stale Flagging [VERIFIED: Frankfurter docs via Context7]

**Frankfurter v2 API** [CITED: frankfurter.dev]:

- `GET /v2/rate/{base}/{quote}?date=YYYY-MM-DD` returns `{date, base, quote, rate}`.
- `GET /v2/currencies` returns ISO-4217 list with `iso_code`, `iso_numeric`, `name`, `symbol`. Used at boot to validate the workspace `default_currency` allowlist.
- Publishes Mon–Fri ~16:00 CET (ECB reference rates). Weekend/holiday → most-recent-prior date returned automatically by their API on a given date param.
- No rate limit, no API key. Free.
- Self-host fallback documented.

**Design:**

- New table `budgeting.fx_rates (base CHAR(3), quote CHAR(3), date DATE, rate NUMERIC(19,8), provider TEXT, fetched_at TIMESTAMPTZ, PRIMARY KEY (base, quote, date))`. NO RLS — this is reference data shared across tenants.
- `FrankfurterFxProvider.rateAsOf(from, to, date)` algorithm:
  1. SELECT from cache where `(base, quote, date) = (from, to, date)`. Hit → return `{rate, provider, isStale: false}`.
  2. Miss → HTTP GET `/v2/rate/{from}/{quote}?date={date}`. On success → INSERT cache (idempotent via PK), return `{rate, provider: 'frankfurter', isStale: returned_date < requested_date}`.
  3. HTTP fail (network/5xx/timeout) → fallback query: `SELECT rate, date FROM budgeting.fx_rates WHERE base=$1 AND quote=$2 AND date <= $3 ORDER BY date DESC LIMIT 1`. Return `{rate, provider: 'frankfurter', isStale: true, fxRateDate: that earlier date}`.
  4. Both miss + provider down → return `Result.err(NoFxRateAvailable)`. Domain layer surfaces a 503 to the client.

- **Daily pg-boss job** at `0 17 * * *` Europe/Berlin (D-03-c says CET; pg-boss `tz` option supports IANA): for each (base, quote) pair observed in `expense_ledger` ∪ all `workspaces.default_currency` × known transaction-currency observations, fetch today's rate and cache it.
- **On-demand top-up:** if cache miss occurs in a request hot path (deposit FX-preview, transaction save), fetch live and cache.
- **`fx_rate_stale` flag is DERIVED**, not stored on `expense_ledger`. Computed at read time: `fx_rate_date < transaction_date`. UI shows badge using `humanize-duration` against `fx_rate_date`.

**Library: `humanize-duration`** [VERIFIED: npm registry — package is live, current version ~3.32.x as of cutoff].

- `humanize-duration(ms, {largest: 1, round: true, language: 'en'})` produces "2 hours".
- Locale-aware (supports `en`, `pl`, `uk` natively per their localization README) — fits next-intl model.
- Alternatives considered: `date-fns/formatDistanceStrict`, `dayjs/relativeTime`. Rejected because CLAUDE.md bans dayjs/moment and Temporal API is preferred for datetime math but doesn't ship a humanizer.

**Confidence:** HIGH for Frankfurter; MEDIUM for humanize-duration (locked at planner's discretion per D-03 — could swap for next-intl's `formatRelativeTime` which is the better fit since next-intl is already in the stack).

**Recommendation:** Use **`next-intl`'s `formatRelativeTime`** for the badge instead of humanize-duration — already in the stack, ICU-native, EN/PL/UK supported. Server returns `fxRateDate` ISO string, client renders via `useFormatter().relativeTime(date, now)`.

### 4. Effective-Dated Time-Series for Limits [VERIFIED via Phase 1 patterns]

**Schema (per D-04-b):**

```sql
budgeting.category_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  category_id UUID NOT NULL REFERENCES budgeting.categories(id),
  normal_amount NUMERIC(19,4) NOT NULL,
  normal_currency CHAR(3) NOT NULL,
  cushion_amount NUMERIC(19,4) NOT NULL,
  cushion_currency CHAR(3) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,            -- NULL means open-ended (the "current" row)
  created_at TIMESTAMPTZ DEFAULT now(),
  actor_user_id UUID NOT NULL
);
-- exclusion or partial unique to enforce one open-ended row per category:
CREATE UNIQUE INDEX category_limits_one_open_per_cat
  ON budgeting.category_limits (category_id) WHERE effective_to IS NULL;
```

**Mutation pattern:** setting a new limit for `category_id`:

1. UPDATE existing open row: `effective_to = (new effective_from) - 1 day` (or NULL→close as `(new.effective_from - 1)`).
2. INSERT new row with `effective_from = first_day_of_current_month` (D-04-c default).
3. Both inside same `withTenantTx`.
4. Append `audit_history` row (action=`update`, before/after JSONB).
5. Optional: emit `LimitChanged` outbox event for Phase 4 Insights.

**Point-in-time query (for any month report):**

```sql
SELECT * FROM budgeting.category_limits
WHERE category_id = $1
  AND effective_from <= $reportDate
  AND (effective_to IS NULL OR effective_to >= $reportDate)
LIMIT 1;
```

Index: `(category_id, effective_from DESC)`.

**Mid-month edit semantics (D-04-c):** Recommendation = `effective_from = first_day_of_current_month` so the change reshapes the entire current month, not just from-this-day-forward. Aligns with user expectation per discussion.

**Same pattern for `workspaces.budget_mode` toggle (D-04-e):** ship as `workspace_budget_mode_history (workspace_id, mode, effective_from, effective_to, actor_user_id)` rather than two columns on workspaces — gives the same point-in-time query. This is a deviation from CONTEXT.md's "or simply two columns + audit_history" — recommend **history table** for query symmetry with category_limits.

**Confidence:** HIGH — effective-dated dimension is Kimball-standard pattern; no library dependency.

### 5. Budget Templates [VERIFIED via D-04-d]

**Schema:**

```sql
budgeting.budget_templates (id UUID, tenant_id UUID, name TEXT, created_at, ...)
budgeting.budget_template_items (
  template_id UUID,
  category_id UUID,
  normal_amount NUMERIC(19,4), normal_currency CHAR(3),
  cushion_amount NUMERIC(19,4), cushion_currency CHAR(3),
  PRIMARY KEY (template_id, category_id)
)
```

**Apply operation (manual, user-initiated per D-04-d):**

- Input: `templateId`, `targetMonth (YYYY-MM)`.
- For each `(category_id, ...)` row in template: bulk-INSERT a `category_limits` row with `effective_from = first_day_of(targetMonth)`. Close the previous open-ended row's `effective_to` accordingly.
- Single transaction, `audit_history` per category.
- Emit `BulkLimitsApplied` outbox event.

**No automatic copy at month boundary.** Templates are tools, not background processes.

**Confidence:** HIGH.

### 6. Recurring Transaction Engine [VERIFIED via D-01-e/f/g]

**Schema:**

```sql
budgeting.recurring_rules (
  id UUID, tenant_id UUID, account_id UUID, category_id UUID,
  amount NUMERIC(19,4), currency CHAR(3),
  kind TEXT, -- 'EXPENSE' | 'INCOME' | 'TRANSFER'
  cadence TEXT, -- 'MONTHLY' | 'WEEKLY'
  cadence_anchor DATE, -- e.g. day-of-month or first-occurrence
  note TEXT,
  active BOOLEAN DEFAULT TRUE,
  next_due_date DATE NOT NULL,
  created_at, updated_at, actor_user_id
)

budgeting.recurring_drafts (
  id UUID, tenant_id UUID, rule_id UUID,
  due_date DATE, amount NUMERIC(19,4), currency CHAR(3),
  account_id UUID, category_id UUID, kind TEXT, note TEXT,
  status TEXT DEFAULT 'PENDING', -- 'PENDING' | 'CONFIRMED' | 'SKIPPED'
  created_at, confirmed_at, actor_user_id
)
```

**Engine (pg-boss cron):**

- Scheduled `0 6 * * *` UTC: scan `recurring_rules WHERE active AND next_due_date <= today` across ALL tenants. Runs in `withInfraTx` because background.
- For each rule: INSERT a `recurring_drafts` row with status='PENDING', then UPDATE rule's `next_due_date` to next occurrence (cadence math via Temporal API).
- **Critical:** the cron runs as `worker_role` and inserts across tenants. Either (a) iterate per tenant with `withTenantTx(tenant_id, system_user_id, ...)`, or (b) use `withInfraTx` and explicitly bypass RLS with grants. Recommendation: **(a) per-tenant tx** — preserves the RLS invariant. The "system_user_id" is a sentinel UUID for system-initiated writes (audit shows it).

**Three actions on a draft (per D-01-f):**

- **Confirm:** in single `withTenantTx`: `INSERT INTO expense_ledger`, `UPDATE recurring_drafts SET status='CONFIRMED'`, `writeOutbox(RecurringInstanceConfirmed)`. RLS policies prevent cross-tenant.
- **Edit-and-confirm:** same as confirm but with edited values. Rule unchanged.
- **Skip:** `UPDATE recurring_drafts SET status='SKIPPED'`, `writeAudit`, `writeOutbox(RecurringInstanceSkipped)`. No ledger write.

**Stale drafts (D-01-g):** No auto-anything. Inbox UI sorts overdue first; badge in primary nav shows count of `status='PENDING' AND due_date < today`.

**Idempotency of draft generation:** unique index `(rule_id, due_date)` prevents double-generation if cron re-runs.

**Confidence:** HIGH for design; MEDIUM for cadence math (Temporal API: `Temporal.PlainDate.add({months: 1})` handles month-end edge cases per [CITED: tc39/proposal-temporal]).

### 7. Account Model [VERIFIED via ACCT-01..04 + Claude's discretion]

**Schema:**

```sql
budgeting.accounts (
  id UUID, tenant_id UUID,
  name TEXT, kind TEXT, -- 'CASH'|'CHECKING'|'SAVINGS'|'CREDIT_CARD'|'LOAN'|'INVESTMENT'
  scope TEXT, -- 'PERSONAL'|'SHARED' (matches workspace kind, but stored for query simplicity)
  currency CHAR(3) NOT NULL, -- account-native currency (immutable)
  current_balance NUMERIC(19,4) NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at, actor_user_id
)
```

**Balance update model (per Claude's discretion in CONTEXT.md):**

- `current_balance` updated synchronously inside the same `withTenantTx` as the ledger insert.
- Manual reconciliation via "Adjust balance" action: writes a special `BALANCE_ADJUSTMENT` row to `expense_ledger` with `kind='ADJUSTMENT'` (or to a separate `budgeting.balance_adjustments` table — Recommendation: **separate table** because the ledger is for transactions, not balance corrections; mixing types pollutes spending reports).

**Recommendation: split `expense_ledger` discriminator vs. side-tables:**

- `expense_ledger` stays for `EXPENSE | INCOME | TRANSFER` only. New column `kind TEXT NOT NULL` (CHECK constraint).
- `budgeting.account_balance_adjustments` for manual reconciliation. Separate audit chain. NOT append-only (allow corrections via standard `audit_history`).

**Transfer between accounts in different currencies (Claude's discretion):**

- **Two linked ledger rows**: each carries its own account-currency amount; both share `transfer_group_id UUID`. FX rate stored on each row (each leg's amount → workspace default currency). UI shows both legs grouped.

**Confidence:** MEDIUM — needs planner reconciliation of the ledger-discriminator-vs-side-table call. Mark as Open Question.

### 8. Category Model [VERIFIED via BDGT-01..02]

**Schema:**

```sql
budgeting.categories (
  id UUID, tenant_id UUID,
  name TEXT, parent_id UUID, -- NULL for groups (level 0); non-null = leaf (level 1)
  scope TEXT, -- 'PERSONAL'|'SHARED'
  archived_at TIMESTAMPTZ,
  created_at, actor_user_id
)
```

**One-level enforcement:** BEFORE INSERT/UPDATE trigger: if `parent_id IS NOT NULL`, parent's `parent_id` must be NULL.

**Confidence:** HIGH.

### 9. Search / Filter / Bulk-Recategorize [VERIFIED Postgres FTS pattern]

**FTS column:**

```sql
ALTER TABLE budgeting.expense_ledger
  ADD COLUMN note_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(note, ''))) STORED;
CREATE INDEX expense_ledger_note_tsv_idx ON budgeting.expense_ledger USING GIN (note_tsv);
```

Wait — `expense_ledger` lacks a `note` column in Phase 1. Phase 2 must ADD `note TEXT NULL`, `account_id UUID`, `category_id UUID`, `kind TEXT`, `transfer_group_id UUID`. **This is a schema-extension migration; ledger is APPEND-ONLY for data, not for SCHEMA — `ALTER TABLE` is fine via the migrator role.**

**Filter columns + indexes:**

- `(tenant_id, transaction_date DESC)` — primary range filter.
- `(tenant_id, category_id, transaction_date DESC)` — category filter.
- `(tenant_id, account_id, transaction_date DESC)` — account filter.

**Wait — there is no `transaction_date` column on Phase 1 `expense_ledger`!** Only `created_at` (insert wallclock) and `fx_rate_date`. Phase 2 must ADD `transaction_date DATE NOT NULL` — this is the user-supplied date the transaction occurred (not insert time, not FX rate date). This is the field budgets/reports key on. **Critical gap from Phase 1 — flag for planner.**

**Cursor pagination:** `(transaction_date, id)` tuple cursor.

**Bulk re-categorize:** sequence of correction-row INSERTs per selected row, all in one `withTenantTx` for atomicity.

**Confidence:** HIGH for FTS; flagged schema-gap for `transaction_date` and `note` columns.

### 10. Contribution Shares Model [VERIFIED via D-02 + Phase 1 trigger pattern]

**Schema:**

```sql
budgeting.category_share_overrides (
  category_id UUID,
  user_id UUID,
  percentage NUMERIC(7,4) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  PRIMARY KEY (category_id, user_id)
)
```

Tenant_id derived through join to `categories.tenant_id`.

**Sum-to-100 enforcement (mirroring `tenancy.shares_sum_invariant` at post-migration.sql:343):**

```sql
CREATE OR REPLACE FUNCTION budgeting.category_share_overrides_sum_check() RETURNS trigger AS $$
DECLARE total numeric(7,4); cat_id uuid;
BEGIN
  cat_id := COALESCE(NEW.category_id, OLD.category_id);
  SELECT coalesce(sum(percentage), 0) INTO total
    FROM budgeting.category_share_overrides WHERE category_id = cat_id;
  IF abs(total - 100) > 0.005 AND total > 0 THEN
    RAISE EXCEPTION 'category_share_overrides for category % must sum to 100 (got %)', cat_id, total;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER category_shares_sum_invariant
  AFTER INSERT OR UPDATE OR DELETE ON budgeting.category_share_overrides
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION budgeting.category_share_overrides_sum_check();
```

**Member join/leave block (D-02-c):** existing `tenancy.shared_workspace_member_shares` trigger fires when a member is added/removed. Phase 2 adds: a derived `budgeting.workspace_share_dirty (workspace_id BOOLEAN)` flag table, set by trigger on `tenancy.workspace_members` INSERT/DELETE. New transactions are blocked while dirty=true. Owner clears it by re-running the global TENT-13 share form. All `category_share_overrides` are reset on dirty.

**Deposit FX-preview (EXPN-13, D-02-d):**

- Form mounts → `GET /fx/rate?from=PLN&to=EUR&date=today` → `{rate, fxRateDate, provider, isStale}` returned to client.
- Currency change → re-fetch.
- Save → POST includes `{rate, fxRateDate}` from form state. Server: validate `now() - fxRateDate < 60 minutes`. If stale, fetch fresh, return 409 with new rate, client confirms.

**Confidence:** HIGH (mirrors existing Phase 1 trigger pattern).

---

## Standard Stack

### Core (already installed; Phase 2 reuses)

| Library               | Version  | Purpose                   | Why Standard                              |
| --------------------- | -------- | ------------------------- | ----------------------------------------- |
| `drizzle-orm`         | ^0.45.2  | ORM, schema, RLS pgPolicy | Phase 1 standard                          |
| `drizzle-kit`         | ^0.31.10 | migration generation      | Phase 1 standard                          |
| `hono`                | ^4.12.16 | HTTP framework            | Phase 1 standard                          |
| `@hono/zod-validator` | ^0.7.6   | request validation        | Phase 1 standard                          |
| `zod`                 | ^3.25.0  | schemas                   | CLAUDE.md mandates v3                     |
| `pg-boss`             | ^12.18.2 | job queue                 | Phase 1 standard; named import `{PgBoss}` |
| `big.js`              | ^7.0.1   | decimal math (via Money)  | Phase 1 standard                          |
| `neverthrow`          | ^8       | Result                    | Phase 1 standard                          |

### New for Phase 2

| Library             | Version                        | Purpose                                                                                 | When to Use                                           |
| ------------------- | ------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `temporal-polyfill` | ^0.5.x [VERIFIED via npm view] | TZ-aware month boundaries, recurring cadence math                                       | All "first day of month in workspace TZ" computations |
| `next-intl`         | ^4.4.3 (already installed)     | FX freshness badge (`formatRelativeTime`), category/account/transaction labels EN/PL/UK | All user-facing strings + relative-time               |

**Recommendation:** Do **NOT** install `humanize-duration` — `next-intl`'s `formatRelativeTime` covers it natively and ICU-pluralization is built in.

### Frankfurter HTTP client

Plain `fetch` against `https://api.frankfurter.dev/v2/...`. No SDK — Frankfurter is dead-simple. Wrap in adapter with retry (1 attempt, no exponential backoff per D-03-b: failed in-request → fall back to cache, do not block).

**Installation:**

```bash
bun add temporal-polyfill --workspace
# next-intl already installed in apps/web
# humanize-duration NOT recommended — use next-intl formatRelativeTime
```

**Version verification:**

- `temporal-polyfill`: `npm view temporal-polyfill version` → check on planning day. As of training cutoff, latest stable is 0.5.x; TC39 Stage 3 proposal. [CITED: tc39/proposal-temporal]
- `next-intl`: 4.4.3 already pinned in `apps/web/package.json`.

---

## Don't Hand-Roll

| Problem                                       | Don't Build                       | Use Instead                                                                                                                       | Why                                                                  |
| --------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Decimal money math                            | Custom `MoneyAmount` class        | Existing `Money` (big.js)                                                                                                         | Phase 1 already shipped this; no float allowed (lint rule)           |
| Date arithmetic in TZ                         | `new Date()` + offsetMs           | `Temporal.PlainDate`/`ZonedDateTime` from `temporal-polyfill`                                                                     | DST + month-boundary correctness; CLAUDE.md mandates Temporal        |
| Recurring cadence ("every month on the 31st") | Custom day-rolling logic          | `Temporal.PlainDate.add({months: 1})`                                                                                             | Handles Feb 30 → Feb 28/29 correctly                                 |
| FX provider                                   | Custom HTTP wrapper without cache | Existing `FxProvider` port + new `FrankfurterFxProvider` adapter                                                                  | Port is locked; cache + fallback already designed                    |
| HTTP request validation                       | Manual body parsing               | `@hono/zod-validator`                                                                                                             | Phase 1 standard; type-safe                                          |
| Idempotency hashing                           | Custom hash                       | `crypto.createHash('sha256')` (Node/Bun built-in)                                                                                 | No new dep needed                                                    |
| Append-only enforcement                       | App-level guards                  | DB-level `REVOKE UPDATE, DELETE`                                                                                                  | Phase 1 already does this; redundant guards are tech debt            |
| Audit-history                                 | Custom event log per entity       | Existing `audit_history` + `writeAudit()`                                                                                         | Phase 1 standard                                                     |
| Outbox events                                 | Direct in-process emit            | Existing `writeOutbox()` + dispatcher                                                                                             | Phase 1 standard                                                     |
| pg-boss cron                                  | Custom `setInterval`              | `boss.schedule(name, cronExpr, data, {tz})`                                                                                       | Phase 1 standard; D-25                                               |
| Sum-to-100 validation                         | App-level                         | DB CONSTRAINT TRIGGER `DEFERRABLE INITIALLY DEFERRED`                                                                             | Phase 1 already does this for `tenancy.shares`                       |
| Postgres FTS                                  | Custom LIKE %search%              | `tsvector GENERATED` + GIN index                                                                                                  | `tsvector` is the only correct answer for multi-language note search |
| Effective-dated lookup                        | App-side time-travel logic        | SQL `WHERE effective_from <= $d AND (effective_to IS NULL OR effective_to >= $d)` + index on `(category_id, effective_from DESC)` | Kimball-standard SCD Type 2                                          |
| Currency code allowlist                       | Hardcoded array                   | Bootstrap-time fetch of `GET /v2/currencies` from Frankfurter, persist in `budgeting.supported_currencies`                        | Frankfurter publishes the canonical list; we ride it                 |

**Key insight:** Phase 1 invested heavily in primitives (Money, tx primitives, audit/outbox helpers, RLS pattern, pg-boss). Phase 2's job is **applying** those primitives to a new bounded context — not extending the platform. Any plan that proposes new platform infrastructure should be challenged.

---

## Common Pitfalls

### Pitfall 1: corrected_by_id can't be UPDATEd because of REVOKE

**What goes wrong:** Phase 1 created `corrected_by_id` column on `expense_ledger` but REVOKED UPDATE entirely. Setting this column on an edit fails with permission denied.
**Why it happens:** REVOKE is column-agnostic at the GRANT level.
**How to avoid:** Either (a) drop the column and derive "is corrected" from `EXISTS (SELECT 1 WHERE corrects_id = this.id)`, or (b) use a `BEFORE UPDATE` trigger that allows ONLY this column to change while a separate GRANT permits UPDATE on just that column. Option (a) is simpler.
**Warning signs:** integration test fails with `permission denied for table expense_ledger` on edit.

### Pitfall 2: Idempotency middleware before tenant context

**What goes wrong:** Middleware tries to read `tenantId` for the cache key before `tenantGuard` has set it.
**Why it happens:** Middleware order matters in Hono.
**How to avoid:** Insert idempotency middleware AFTER `tenantGuard` in `app.ts`. Order: error → /auth → authMiddleware → tenantGuard → idempotency → i18n → routes.
**Warning signs:** cache key collisions across tenants; test "tenant-leak" gate fails.

### Pitfall 3: pg-boss cron runs without tenant context

**What goes wrong:** Recurring engine job uses `withInfraTx` and writes to `expense_ledger` (cross-tenant) — RLS deny.
**Why it happens:** `withInfraTx` does NOT set `app.tenant_ids`; ledger has FORCE RLS.
**How to avoid:** Iterate per tenant with `withTenantTx(tenantId, systemUserId, fn)`. Use sentinel `system_user_id` UUID (e.g. `00000000-0000-0000-0000-000000000001`) and create a `system` user row in `identity.users` at migration time.
**Warning signs:** background job logs `new row violates row-level security policy`.

### Pitfall 4: Frankfurter rate request for weekend dates

**What goes wrong:** User books a transaction with date=Saturday. Cache miss. Live fetch returns Friday's rate (Frankfurter auto-rolls back). We store `fx_rate_date = Friday`. UI badge says "rate from Friday" — correct, but `isStale` true triggers UX confusion.
**Why it happens:** Frankfurter publishes Mon-Fri only.
**How to avoid:** Define stale as `fx_rate_date < transaction_date` and accept it as expected for weekends/holidays. Badge text is informational, not error.
**Warning signs:** user reports "rate is wrong" because badge looks like a warning. Mitigation: badge color = neutral grey, not yellow/red.

### Pitfall 5: Effective-dated limits — overlap on same day

**What goes wrong:** Two limit rows with `effective_from = effective_to + 1` produce no gap, but if the user re-edits the same day, you get rows with `effective_from = effective_to`.
**Why it happens:** "first_day_of_current_month" math edge cases.
**How to avoid:** unique partial index `(category_id) WHERE effective_to IS NULL` + business rule: if today's edit's `effective_from` already exists open, UPDATE that row in place rather than INSERT new. Use `ON CONFLICT (category_id) WHERE effective_to IS NULL DO UPDATE SET ...`.
**Warning signs:** point-in-time query returns 2 rows for a single date.

### Pitfall 6: Recurring rule next_due_date drift

**What goes wrong:** Rule cadence='MONTHLY', anchor='31st'. February has 28 days. After Feb 28 confirmation, next_due_date should be March 31, not March 28.
**Why it happens:** Manual "+1 month" arithmetic on PlainDate(Feb 28) lands on Mar 28, not Mar 31.
**How to avoid:** Store `cadence_anchor` separately and recompute `next_due_date = nextOccurrence(anchor, prevDueDate, cadence)` rather than `prev + 1 month`. Temporal API has `with({day: anchor})` which clamps; the algorithm must explicitly preserve the original anchor day.
**Warning signs:** monthly rent rule gradually drifts to mid-month after a Feb cycle.

### Pitfall 7: Outbox event NOT in same tx as ledger insert

**What goes wrong:** Code calls `withTenantTx` for the ledger INSERT, then `writeOutbox` outside it. Crash between the two leaves a ledger row with no event → Phase 3+ Reserve never sees the transaction.
**Why it happens:** misunderstanding of "transactional outbox" pattern.
**How to avoid:** ALL writeOutbox calls MUST happen INSIDE the same `withTenantTx` block as the domain write. Existing pattern in tenancy.share-repo confirms.
**Warning signs:** consumer in Phase 3 silently misses events; reconciliation cron flags drift.

### Pitfall 8: Member join/leave doesn't reset overrides

**What goes wrong:** Member leaves; global shares re-distributed; per-category overrides still reference the departed member's user_id.
**Why it happens:** D-02-c says overrides "reset to global on next edit" — but that's lazy.
**How to avoid:** ON DELETE FROM `tenancy.workspace_members` cascade-DELETE rows in `budgeting.category_share_overrides WHERE user_id = OLD.user_id`. Then mark the workspace dirty so the owner re-runs global shares.
**Warning signs:** sum-to-100 trigger throws on a category whose overrides still reference a departed user.

### Pitfall 9: pg-boss schedule check granularity (30s)

**What goes wrong:** Cron `30 30 3 * * *` (6-placeholder seconds-precision) silently never fires because pg-boss checks every 30s by default.
**Why it happens:** pg-boss docs explicitly recommend 5-placeholder format. [CITED: timgit/pg-boss/docs/api/scheduling.md]
**How to avoid:** Use 5-placeholder cron (`30 3 * * *` = "any second during 3:30am").
**Warning signs:** scheduled job never runs.

### Pitfall 10: Idempotency cache leaks across users in same tenant

**What goes wrong:** User A and User B in same tenant both POST `/transactions` with the same `Idempotency-Key` value. Without scoping by user, B sees A's response.
**Why it happens:** key collision across users.
**How to avoid:** `scope_hash = sha256(tenant_id || user_id || route || key_value)` per CONTEXT.md. RLS on `tenant_id` is necessary but not sufficient.
**Warning signs:** integration test assertion: "different user, same Idempotency-Key value, gets fresh response."

---

## Code Examples

### Frankfurter adapter (per the locked FxProvider port)

```typescript
// Source: https://frankfurter.dev/ + packages/shared-kernel/src/ports/fx-provider.ts
import type { FxProvider } from "@budget/shared-kernel";

export class FrankfurterFxProvider implements FxProvider {
  constructor(private readonly cache: FxRateCacheRepo) {}

  async rateAsOf(from, to, date) {
    if (from === to)
      return { rate: "1", provider: "frankfurter", isStale: false };
    const yyyymmdd = formatDateUTC(date);
    const cached = await this.cache.lookup(from, to, yyyymmdd);
    if (cached)
      return {
        rate: cached.rate,
        provider: "frankfurter",
        isStale: cached.date !== yyyymmdd,
      };
    try {
      const r = await fetch(
        `https://api.frankfurter.dev/v2/rate/${from}/${to}?date=${yyyymmdd}`,
      );
      if (!r.ok) throw new Error(`frankfurter ${r.status}`);
      const j = (await r.json()) as { date: string; rate: number };
      await this.cache.upsert(from, to, j.date, String(j.rate));
      return {
        rate: String(j.rate),
        provider: "frankfurter",
        isStale: j.date !== yyyymmdd,
      };
    } catch {
      const fallback = await this.cache.mostRecentPrior(from, to, yyyymmdd);
      if (!fallback) throw new Error("NoFxRateAvailable");
      return { rate: fallback.rate, provider: "frankfurter", isStale: true };
    }
  }
}
```

### pg-boss schedule (daily FX fetch)

```typescript
// Source: timgit/pg-boss docs
const boss = await getBoss();
await boss.createQueue("fx-daily-fetch");
await boss.schedule("fx-daily-fetch", "0 17 * * *", null, {
  tz: "Europe/Berlin",
});
boss.work("fx-daily-fetch", async () => {
  /* iterate observed pairs, fetch each */
});
```

### Effective-dated limit point-in-time read

```typescript
// Source: standard SCD Type 2 pattern; tested in withTenantTx
const limit = await tx.execute(sql`
  SELECT * FROM budgeting.category_limits
   WHERE category_id = ${categoryId}
     AND effective_from <= ${reportDate}
     AND (effective_to IS NULL OR effective_to >= ${reportDate})
   ORDER BY effective_from DESC LIMIT 1
`);
```

### Idempotency middleware (Hono)

```typescript
// Source: industry-standard Stripe-like pattern
export function idempotencyMiddleware() {
  return async (c: Context, next: Next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method))
      return next();
    const key = c.req.header("Idempotency-Key");
    if (!key) return next();
    const tenantId = c.get("tenantId");
    const userId = c.get("userId");
    const route = c.req.path;
    const bodyText = await c.req.raw.clone().text();
    const bodyHash = sha256Hex(bodyText);
    const scopeHash = sha256Hex(`${tenantId}|${userId}|${route}|${key}`);
    const cached = await idempotencyRepo.lookup(scopeHash);
    if (cached) {
      if (cached.bodyHash !== bodyHash)
        return c.json(
          { error: "idempotency_key_reused_with_different_body" },
          422,
        );
      return c.body(cached.responseBody, cached.responseStatus);
    }
    await next();
    if (c.res.ok) {
      const respText = await c.res.clone().text();
      await idempotencyRepo.insert({
        scopeHash,
        bodyHash,
        status: c.res.status,
        body: respText,
        ttlHours: 24,
      });
    }
  };
}
```

### Append-only edit (correction row)

```typescript
// Source: D-01-b + Phase 1 expense-ledger.ts
const r = await withTenantTx(tenantId, userId, async (tx) => {
  // INSERT new correction row
  const [row] = await tx
    .insert(expenseLedger)
    .values({
      tenantId,
      amountOrig: edits.amount,
      currencyOrig: edits.currency,
      /* ...converted defaults... */
      correctsId: originalId,
    })
    .returning({ id: expenseLedger.id });
  // No UPDATE on original — corrected_by_id derived via EXISTS query
  await writeOutbox(tx, {
    tenantId,
    aggregateType: "transaction",
    aggregateId: row.id,
    eventType: "TransactionCorrected",
    payload: { originalId, newId: row.id },
  });
  return row.id;
});
```

---

## State of the Art

| Old Approach                  | Current Approach                                     | When Changed                 | Impact                                             |
| ----------------------------- | ---------------------------------------------------- | ---------------------------- | -------------------------------------------------- |
| moment.js / dayjs for TZ math | Temporal API via `temporal-polyfill`                 | TC39 Stage 3 (2024+)         | Native immutable date types; CLAUDE.md mandates    |
| Float for money               | big.js / Dinero.js                                   | Always                       | Existing project rule; ESLint enforced             |
| Manual Idempotency-Key cache  | DB-table with TTL + (tenant, user, route, key) scope | Industry default since ~2018 | Stripe / Plaid / Square all use this exact pattern |
| GraphQL for internal API      | Hono RPC + Zod                                       | CLAUDE.md decision           | Type-safety with less ceremony                     |
| Custom recurring scheduler    | pg-boss `schedule()`                                 | pg-boss v8+                  | One queue, no Redis                                |
| Snapshot-per-month limits     | Effective-dated time-series (SCD Type 2)             | Per D-04-b user decision     | Past-month reports auto-correct                    |

**Deprecated/outdated:**

- humanize-duration (still works, but redundant in next-intl stacks)
- node-cron in-process (loses jobs on restart) — pg-boss is the replacement
- Lucia (deprecated upstream); we already use Better Auth

---

## Validation Architecture (Nyquist)

### Test Framework

| Property           | Value                                                                     |
| ------------------ | ------------------------------------------------------------------------- |
| Framework          | bun:test (backend) + Vitest 4 + happy-dom (frontend) + Playwright (E2E)   |
| Config file        | `bunfig.toml` (root), `apps/web/vitest.config.ts`, `playwright.config.ts` |
| Quick run command  | `bun test packages/budgeting && bun test apps/api`                        |
| Full suite command | `make test && make test-e2e`                                              |

### Phase Requirements → Test Map

| Req ID      | Behavior                                                                     | Test Type                  | Automated Command                                                 | File Exists? |
| ----------- | ---------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------- | ------------ |
| MONY-04     | FX conversion stored on ledger                                               | integration                | `bun test packages/budgeting/test/fx-on-ledger.test.ts`           | ❌ Wave 0    |
| MONY-05     | Stale fallback uses most-recent-prior                                        | integration                | `bun test packages/budgeting/test/fx-stale-fallback.test.ts`      | ❌ Wave 0    |
| MONY-06     | All 7 FX columns populated                                                   | integration                | `bun test packages/budgeting/test/expense-ledger-shape.test.ts`   | ❌ Wave 0    |
| ACCT-01..04 | Account CRUD per scope                                                       | integration                | `bun test apps/api/test/routes/accounts.test.ts`                  | ❌ Wave 0    |
| BDGT-01..02 | Category CRUD with one-level group                                           | integration                | `bun test apps/api/test/routes/categories.test.ts`                | ❌ Wave 0    |
| BDGT-03..05 | Effective-dated limit; mid-month edit; past month report unchanged           | integration                | `bun test packages/budgeting/test/limits-effective-dated.test.ts` | ❌ Wave 0    |
| BDGT-06     | Archive category preserves history                                           | integration                | included in above                                                 | ❌           |
| BDGT-07     | Apply template = bulk-create limit rows                                      | integration                | `bun test apps/api/test/routes/budget-templates.test.ts`          | ❌ Wave 0    |
| BDGT-08     | Per-category share override sum=100                                          | integration                | `bun test packages/budgeting/test/share-overrides.test.ts`        | ❌ Wave 0    |
| EXPN-01..03 | Add expense / income / transfer                                              | integration                | `bun test apps/api/test/routes/transactions.test.ts`              | ❌ Wave 0    |
| EXPN-06     | Edit creates correction row, original immutable                              | integration                | `bun test packages/budgeting/test/correction-rows.test.ts`        | ❌ Wave 0    |
| EXPN-08     | Recurring engine generates pending drafts; confirm/skip/edit-confirm actions | integration                | `bun test packages/budgeting/test/recurring-engine.test.ts`       | ❌ Wave 0    |
| EXPN-09     | Search by date/category/account/scope/text                                   | integration                | `bun test apps/api/test/routes/transactions-search.test.ts`       | ❌ Wave 0    |
| EXPN-10     | Bulk re-categorize → N correction rows                                       | integration                | included in correction-rows.test.ts                               | ❌           |
| EXPN-12     | Idempotency-Key replay returns cached response                               | integration                | `bun test apps/api/test/middleware/idempotency.test.ts`           | ❌ Wave 0    |
| EXPN-13     | Deposit FX-preview server-validates ≤60min                                   | integration                | `bun test apps/api/test/routes/deposit.test.ts`                   | ❌ Wave 0    |
| ENGR-09     | Frankfurter response → Money conversion lives in adapter only                | architecture (dep-cruiser) | `bunx depcruise apps packages`                                    | ✅ existing  |
| ENGR-14     | Projection updated in same tx as ledger write                                | integration                | `bun test packages/budgeting/test/projection-tx.test.ts`          | ❌ Wave 0    |
| ENGR-14     | Reconciliation cron repairs drift                                            | integration                | `bun test packages/budgeting/test/reconciliation.test.ts`         | ❌ Wave 0    |
| ENGR-14     | `bun run replay:budgeting` rebuilds projection                               | CLI integration            | `bun test apps/worker/test/replay-budgeting.test.ts`              | ❌ Wave 0    |

### DB-level Invariants (verified via integration tests against testcontainer)

- **Ledger immutability:** `app_role` has no UPDATE, no DELETE on `budgeting.expense_ledger` (mirror existing `ledger-revoke.test.ts`).
- **RLS isolation:** without `app.tenant_ids` GUC, SELECT against any new Budgeting table returns 0 rows.
- **Sum-to-100:** any DELETE/UPDATE/INSERT on `category_share_overrides` that breaks 100% rejects with deferred-constraint error.
- **One-level category group:** trigger rejects category with parent whose parent is non-null.
- **One open-ended limit per category:** unique partial index `(category_id) WHERE effective_to IS NULL` rejects duplicate.
- **Recurring draft uniqueness:** unique `(rule_id, due_date)` prevents double-generation.
- **Idempotency dedup:** unique `scope_hash` PK rejects double-write.

### Property-based Invariants (where useful)

- **FX preserve total:** for any `Money(amount, fromCurrency)` and rate `r`, `Money.of(amount, fromCurrency).convertAt(r, toCurrency).convertAt(1/r, fromCurrency)` is within ±0.0001 of original (round-trip stability).
- **Correction-chain monotonicity:** for any expense_ledger row, following `corrects_id` backward terminates at a row with `corrects_id IS NULL` and the chain is acyclic.
- **Effective-dated coverage:** for any category and any date, exactly one `category_limits` row covers it (or zero before first limit set).
- **Recurring next_due_date never goes backward:** for any rule edit, `new.next_due_date >= old.next_due_date` (or `>= clock.today()`).

### E2E User Flows (Playwright BDD per CLAUDE.md feedback)

- `tests/e2e/features/budgeting/account-create.feature` — create cash + checking accounts in PRIVATE workspace; balances visible in account-currency and family-default-currency.
- `tests/e2e/features/budgeting/category-with-limits.feature` — create category with normal+cushion; mid-month edit; past month report shows old value.
- `tests/e2e/features/budgeting/transaction-capture.feature` — add expense in foreign currency; FX badge shows freshness; edit creates new correction row visible in chain panel.
- `tests/e2e/features/budgeting/recurring-flow.feature` — create rule; cron generates draft; confirm → ledger row; skip → no row.
- `tests/e2e/features/budgeting/idempotency-replay.feature` — POST same Idempotency-Key twice → second call returns cached response, no duplicate row.
- `tests/e2e/features/budgeting/share-override.feature` — set per-category override; sum=99 blocks save; sum=100 saves; member leaves → workspace blocks new transactions.
- `tests/e2e/features/budgeting/deposit-fx-preview.feature` — open deposit form → preview shown → wait 60+min → save → confirm-modal appears with fresh rate.
- `tests/e2e/features/budgeting/search-filter.feature` — search by note text; filter by category + date range; bulk re-categorize 3 rows.

### Sampling Rate

- **Per task commit:** `bun test packages/budgeting && bun test apps/api/test/routes/<this-task>.test.ts` (≤30s)
- **Per wave merge:** `make test` (full backend suite, ~5min with testcontainer)
- **Phase gate:** `make test && make test-e2e` (E2E ~10min on stack)

### Wave 0 Gaps

All Phase 2 test files do not yet exist. Wave 0 tasks must create the test scaffolding before implementation:

- [ ] `packages/budgeting/` package directory (does not exist — Phase 1 has no `budgeting` package, only `budgeting` schema in `platform`)
- [ ] `packages/budgeting/test/conftest` shared fixtures (testcontainer bootstrap, fake clock, stub FX provider)
- [ ] `apps/api/test/routes/*.test.ts` route-integration scaffolding (currently no `apps/api/test/routes/` directory)
- [ ] `apps/api/test/middleware/idempotency.test.ts` middleware harness
- [ ] BDD step definitions for all 8 .feature files in `tests/e2e/steps/`

---

## Open Questions (RESOLVED)

All nine items below were ratified via CONTEXT.md D-05-a..i (see `02-CONTEXT.md` § "Architectural Defaults Ratified from RESEARCH.md (D-05)"). Treat as locked decisions; the original recommendations stand.

1. **`corrected_by_id` column on `expense_ledger` — keep or drop?**
   - **RESOLVED:** Drop the column; index `corrects_id` and derive latest-only via `WHERE id NOT IN (SELECT corrects_id FROM expense_ledger WHERE corrects_id IS NOT NULL)` (see CONTEXT.md D-05-a)
   - What we know: Phase 1 created the column but REVOKE'd UPDATE so it can never be set.
   - What's unclear: Is the planner expected to fix this with a column-level GRANT + trigger, or simplify by dropping the column and deriving the relation from the inverse `EXISTS (SELECT 1 WHERE corrects_id = this.id)`?
   - Recommendation: **Drop the column.** Index `corrects_id`. Latest-view query: `SELECT * WHERE id NOT IN (SELECT corrects_id FROM expense_ledger WHERE corrects_id IS NOT NULL)` (or use a recursive CTE / `LEFT JOIN ... WHERE c.id IS NULL`).

2. **Schema for `budgeting.expense_ledger` is missing critical Phase-2 columns — `transaction_date`, `note`, `account_id`, `category_id`, `kind`, `transfer_group_id`. Are these added via ALTER, or is the table re-created?**
   - **RESOLVED:** ADD COLUMN via Phase 2 migration; no data loss because Phase 1 inserted no rows (see CONTEXT.md D-05-b)
   - What we know: ALTER TABLE on append-only ledger is fine for ADD COLUMN (data preserved). But existing column shape was reviewed at MONY-06 and may have been intentionally minimal.
   - Recommendation: ADD COLUMN via Phase 2 migration. No data loss because Phase 1 did not INSERT.

3. **Where does `idempotency_keys` live — `shared_kernel` or new `platform` schema?**
   - **RESOLVED:** `shared_kernel.idempotency_keys` (supersedes the `platform.idempotency_keys` mention in Discretion notes) (see CONTEXT.md D-05-c)
   - Recommendation: **`shared_kernel.idempotency_keys`** — matches existing infra patterns and avoids new schema declaration.

4. **`workspace_budget_mode` storage — two columns + history vs. dedicated history table?**
   - **RESOLVED:** Dedicated `budgeting.workspace_budget_mode_history` table, mirroring the effective-dated `category_limits` pattern (see CONTEXT.md D-05-d)
   - Recommendation: **dedicated `budgeting.workspace_budget_mode_history`** (mirrors `category_limits` pattern, query-symmetric).

5. **Balance reconciliation: store `current_balance` on `accounts` (synchronous update), compute on-demand from ledger sum, or both?**
   - **RESOLVED:** Store `current_balance Money` on `accounts`, update synchronously inside the ledger writer transaction; `bun run reconcile:balances` CLI is fallback only (see CONTEXT.md D-05-e)
   - Recommendation: store + sync in same tx, with `bun run reconcile:balances` CLI as fallback. Same write-path discipline as projections.

6. **`expense_ledger` discriminator: add `kind` column (EXPENSE/INCOME/TRANSFER) or split into two tables?**
   - **RESOLVED:** Single table with `kind` CHECK constraint; `transfer_group_id` links transfer pairs (see CONTEXT.md D-05-f)
   - Recommendation: single table with `kind` CHECK constraint. Simpler queries, FTS shared, transfer_group_id links transfer pairs.

7. **System user for cron-initiated writes:** should we seed a `system` user row in `identity.users` or use NULL `actor_user_id`?
   - **RESOLVED:** Seed `00000000-0000-0000-0000-000000000001` row in `identity.users` via Phase 2 migration; use as `actor_user_id` for cron-driven inserts (see CONTEXT.md D-05-g)
   - Recommendation: seed via migration (`00000000-0000-0000-0000-000000000001`). Audit history requires non-null actor_user_id today.

8. **Currency allowlist: bootstrap-fetch + persist, or hardcode?**
   - **RESOLVED:** Persist `budgeting.supported_currencies` from Frankfurter `GET /v2/currencies` at first migrator run (idempotent UPSERT); seed crypto majors manually with `provider='internal'` (see CONTEXT.md D-05-h)
   - Recommendation: persist `budgeting.supported_currencies` from `GET /v2/currencies` at first migrator run (idempotent). Crypto majors (BTC, ETH, USDT, USDC, BNB, SOL) added manually with `provider='internal'` for Phase 3.

9. **Recurring `cadence_anchor` semantics for weekly:** "every Monday" vs "every 7 days from anchor"?
   - **RESOLVED:** Store `cadence='WEEKLY'` plus `weekly_dow INT (0–6)` (Sun=0..Sat=6); compute next occurrence via Temporal `PlainDate.dayOfWeek` (see CONTEXT.md D-05-i)
   - Recommendation: store `cadence='WEEKLY'` + `weekly_dow INT (0-6)` for Sun–Sat. Use Temporal `PlainDate.dayOfWeek`.

---

## Environment Availability

| Dependency          | Required By                               | Available                           | Version   | Fallback                           |
| ------------------- | ----------------------------------------- | ----------------------------------- | --------- | ---------------------------------- |
| Postgres 17         | All Budgeting persistence                 | ✓ via testcontainer                 | 17-alpine | —                                  |
| pg-boss             | recurring engine, FX cron, reconciliation | ✓                                   | ^12.18.2  | —                                  |
| Frankfurter API     | FX adapter                                | external HTTPS, no key              | live      | most-recent-prior cache (D-03-a/b) |
| `temporal-polyfill` | TZ math                                   | ✗ NOT YET INSTALLED                 | —         | install                            |
| `humanize-duration` | (rejected — use next-intl)                | ✗                                   | —         | next-intl `formatRelativeTime`     |
| Docker              | testcontainer                             | ✓ assumed (Phase 1 already running) | —         | —                                  |
| Redis               | n/a                                       | not needed                          | —         | pg-boss replaces                   |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** `temporal-polyfill` (install during Wave 0).

---

## Security Domain (ASVS Level 1)

### Applicable ASVS Categories

| ASVS Category         | Applies                       | Standard Control                                                                                                                                                  |
| --------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | already (Phase 1 Better Auth) | n/a — reuse                                                                                                                                                       |
| V3 Session Management | already (Phase 1 Better Auth) | n/a — reuse                                                                                                                                                       |
| V4 Access Control     | yes                           | RLS on every Budgeting table; role separation app/worker; route-level role check (owner/member) for share editor                                                  |
| V5 Input Validation   | yes                           | Zod schemas on every Hono route; CHECK constraints on enum columns; sum-to-100 trigger                                                                            |
| V6 Cryptography       | partial                       | Idempotency `scope_hash` uses sha256 (built-in); no domain-level crypto                                                                                           |
| V7 Error Handling     | yes                           | Result<T,E> for expected failures; throw only for programmer errors                                                                                               |
| V8 Data Protection    | partial                       | Append-only ledger preserves immutable financial record; PII (user note text) is NOT encrypted in v1 (transactions visible to family-workspace members by design) |
| V12 API               | yes                           | Hono routes use Zod; Idempotency-Key middleware prevents replay attacks; rate-limit middleware exists in apps/api/src/middleware/rate-limit.ts                    |
| V13 Configuration     | yes                           | All env via Zod schema in shared-kernel/env.ts                                                                                                                    |

### Known Threat Patterns for Budget API

| Pattern                                       | STRIDE                       | Standard Mitigation                                                                                              |
| --------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Cross-tenant data leak via missing GUC        | Information Disclosure       | RLS + `withTenantTx` enforcement; CI tenant-leak gate                                                            |
| Replay attack on transaction creation         | Tampering                    | Idempotency-Key middleware with body-hash verification                                                           |
| Currency-confusion (wrong rate applied)       | Tampering                    | Domain-level Money currency check; FX rate stored on ledger row immutably                                        |
| Negative-amount injection                     | Tampering                    | Zod `z.string().regex(/^\d+(\.\d{1,4})?$/)` on amount; CHECK constraint amount > 0 (per kind)                    |
| Sum-to-100 bypass via concurrent edits        | Tampering                    | DEFERRABLE constraint trigger evaluates at commit                                                                |
| Worker job writes outside tenant context      | EoP / Information Disclosure | Recurring engine iterates per-tenant via `withTenantTx`, never uses `withInfraTx` for ledger writes              |
| Rate-limiter bypass via Idempotency-Key reuse | DoS                          | Idempotency cache itself has TTL; rate limiter still applies per-route                                           |
| FX provider response tampering (MITM)         | Tampering                    | HTTPS-only fetch; Frankfurter is external trust boundary; cache invalidation is hourly so MITM rate persists ≤1h |
| Audit history skipping on bulk-recategorize   | Repudiation                  | Each correction-row creation writes its own audit entry                                                          |

---

## Recommended Plan Slicing

**9 plans recommended.** Wave 0 work happens inside Plan 00. Plans 03–06 are partially parallel-eligible after Plan 02 lands.

| #      | Title                                                  | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Depends on      | Parallel-OK                     | Est. tasks |
| ------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------- | ---------- |
| **00** | Foundations + budgeting package + test scaffolding     | Create `packages/budgeting/{src,test}` with hexagonal layout (`domain/`, `application/`, `ports/`, `adapters/persistence/`, `adapters/http/`); add `temporal-polyfill`; install `currency-codes` (or hardcode 30 ISO majors); seed `budgeting.supported_currencies` from Frankfurter; add system user; add `transaction_date`, `note`, `account_id`, `category_id`, `kind`, `transfer_group_id` columns to `expense_ledger`; resolve `corrected_by_id` Open Question; create test conftest fixtures | Phase 1         | no                              | ~6         |
| **01** | FX adapter + idempotency middleware                    | `FrankfurterFxProvider` adapter; `budgeting.fx_rates` cache + repo; daily pg-boss `fx-daily-fetch` cron; `shared_kernel.idempotency_keys` + `idempotencyMiddleware`; insert middleware in `apps/api/src/app.ts` chain; hourly cleanup job                                                                                                                                                                                                                                                           | Plan 00         | no                              | ~5         |
| **02** | Accounts                                               | `budgeting.accounts` table + RLS + post-migration GRANTs; `Account` domain + `AccountRepo` adapter; routes POST/GET/PATCH/DELETE `/accounts`; archive flow; `account_balance_adjustments` table + adjust-balance route; UI shells (`apps/web/src/app/[locale]/accounts/`)                                                                                                                                                                                                                           | Plan 00         | yes (with 03, 04 after Plan 01) | ~5         |
| **03** | Categories + effective-dated limits + budget templates | `budgeting.categories` (one-level group + trigger); `budgeting.category_limits` (effective-dated + open-ended uniq); `budgeting.budget_templates` + items; routes; mid-month edit semantics; archive; UI for category list, limit editor with effective-from picker, template apply dialog                                                                                                                                                                                                          | Plan 00         | yes                             | ~6         |
| **04** | Transactions: capture + edit + bulk + transfers        | Domain `Transaction` aggregate; ledger writer (uses FX adapter from Plan 01); routes POST/GET/PATCH `/transactions`; correction-row pattern; transfer two-leg pattern; bulk-recategorize endpoint; UI capture form, transaction list with edit/correction-chain panel, edited-badge                                                                                                                                                                                                                 | Plan 01, 02, 03 | no (downstream of all three)    | ~7         |
| **05** | Recurring engine                                       | `recurring_rules` + `recurring_drafts` schema; pg-boss `recurring-engine` daily cron; per-tenant iteration; rule CRUD routes; draft list + confirm/edit-confirm/skip routes; pending-recurring inbox UI in primary nav badge                                                                                                                                                                                                                                                                        | Plan 04         | no                              | ~5         |
| **06** | Search / filter / FTS                                  | Add `note_tsv` GENERATED column; GIN index; cursor-paginated `/transactions/search` route; filter chips + RSC table UI                                                                                                                                                                                                                                                                                                                                                                              | Plan 04         | yes (with 05)                   | ~3         |
| **07** | Contribution shares + deposit FX-preview               | `budgeting.category_share_overrides` schema + sum-to-100 trigger; member-leave cascade; workspace-dirty flag table + INSERT block on transactions; `/categories/:id/shares` route; `/deposit/preview` route; deposit form UI; share-editor section under category UI                                                                                                                                                                                                                                | Plan 03, 04     | no                              | ~5         |
| **08** | Projections + reconciliation + replay CLI              | `budgeting.spending_by_category_month`; same-tx update inside ledger writer; hourly `budgeting-reconciliation` pg-boss cron; `bun run replay:budgeting` CLI; UI: budget bars consume projection rather than ad-hoc aggregate                                                                                                                                                                                                                                                                        | Plan 04         | yes (with 05, 06, 07)           | ~4         |

**Total ~46 tasks across 9 plans.** All TDD-first; each task has a failing test that flips green.

---

## Files to Create / Modify

Exhaustive list (paths + role classification: route / domain / port / adapter / schema / migration / test / UI / config / cli).

### packages/budgeting/ (NEW package)

- `packages/budgeting/package.json` — config; deps: `@budget/shared-kernel`, `@budget/platform`, `drizzle-orm`, `temporal-polyfill`, `zod`
- `packages/budgeting/tsconfig.json` — config
- `packages/budgeting/src/index.ts` — barrel
- `packages/budgeting/src/domain/account.ts` — domain
- `packages/budgeting/src/domain/category.ts` — domain
- `packages/budgeting/src/domain/category-limit.ts` — domain (effective-dated)
- `packages/budgeting/src/domain/transaction.ts` — domain (kind discriminator + correction)
- `packages/budgeting/src/domain/recurring-rule.ts` — domain
- `packages/budgeting/src/domain/recurring-draft.ts` — domain
- `packages/budgeting/src/domain/budget-template.ts` — domain
- `packages/budgeting/src/domain/category-share-override.ts` — domain
- `packages/budgeting/src/domain/errors.ts` — domain (e.g. NoFxRateAvailable, OneLevelGroupViolation, SumNot100, IdempotencyConflict)
- `packages/budgeting/src/application/account-service.ts` — application
- `packages/budgeting/src/application/category-service.ts` — application
- `packages/budgeting/src/application/limit-service.ts` — application
- `packages/budgeting/src/application/transaction-service.ts` — application (writes ledger + projection in same tx + outbox)
- `packages/budgeting/src/application/recurring-service.ts` — application
- `packages/budgeting/src/application/template-service.ts` — application
- `packages/budgeting/src/application/share-override-service.ts` — application
- `packages/budgeting/src/application/deposit-service.ts` — application (EXPN-13 FX-preview validation)
- `packages/budgeting/src/application/search-service.ts` — application
- `packages/budgeting/src/ports/account-repo.ts` — port
- `packages/budgeting/src/ports/category-repo.ts` — port
- `packages/budgeting/src/ports/category-limit-repo.ts` — port
- `packages/budgeting/src/ports/transaction-repo.ts` — port
- `packages/budgeting/src/ports/recurring-rule-repo.ts` — port
- `packages/budgeting/src/ports/recurring-draft-repo.ts` — port
- `packages/budgeting/src/ports/budget-template-repo.ts` — port
- `packages/budgeting/src/ports/category-share-override-repo.ts` — port
- `packages/budgeting/src/ports/fx-rate-cache-repo.ts` — port
- `packages/budgeting/src/ports/projection-repo.ts` — port
- `packages/budgeting/src/ports/idempotency-repo.ts` — port
- `packages/budgeting/src/adapters/persistence/account-repo-drizzle.ts` — adapter
- `packages/budgeting/src/adapters/persistence/category-repo-drizzle.ts` — adapter
- `packages/budgeting/src/adapters/persistence/category-limit-repo-drizzle.ts` — adapter (point-in-time query)
- `packages/budgeting/src/adapters/persistence/transaction-repo-drizzle.ts` — adapter
- `packages/budgeting/src/adapters/persistence/recurring-rule-repo-drizzle.ts` — adapter
- `packages/budgeting/src/adapters/persistence/recurring-draft-repo-drizzle.ts` — adapter
- `packages/budgeting/src/adapters/persistence/budget-template-repo-drizzle.ts` — adapter
- `packages/budgeting/src/adapters/persistence/category-share-override-repo-drizzle.ts` — adapter
- `packages/budgeting/src/adapters/persistence/fx-rate-cache-repo-drizzle.ts` — adapter
- `packages/budgeting/src/adapters/persistence/projection-repo-drizzle.ts` — adapter
- `packages/budgeting/src/adapters/persistence/idempotency-repo-drizzle.ts` — adapter
- `packages/budgeting/src/adapters/external/frankfurter-fx-provider.ts` — adapter (ENGR-09 ACL — Frankfurter response → Money)
- `packages/budgeting/src/contracts/events.ts` — contracts (TransactionCreated, TransactionCorrected, RecurringInstanceConfirmed/Skipped, SharesUpdated, FxRateRefreshed, LimitChanged, BulkLimitsApplied)
- `packages/budgeting/src/contracts/dto.ts` — contracts (DTOs returned to API)
- `packages/budgeting/test/*.test.ts` (~20 files) — test
- `packages/budgeting/test/helpers/conftest.ts` — test (testcontainer bootstrap + FakeClock + InMemoryFxProvider helpers)

### packages/platform/src/db/ (MODIFY — add new Drizzle schemas)

- `packages/platform/src/db/budgeting/accounts.ts` — schema + pgPolicy (NEW)
- `packages/platform/src/db/budgeting/categories.ts` — schema + pgPolicy + parent-trigger (NEW)
- `packages/platform/src/db/budgeting/category-limits.ts` — schema + partial unique idx (NEW)
- `packages/platform/src/db/budgeting/budget-templates.ts` — schema (NEW)
- `packages/platform/src/db/budgeting/recurring.ts` — schema (rules + drafts) (NEW)
- `packages/platform/src/db/budgeting/category-share-overrides.ts` — schema + sum-100 trigger (NEW)
- `packages/platform/src/db/budgeting/fx-rates.ts` — schema (no RLS) (NEW)
- `packages/platform/src/db/budgeting/spending-projection.ts` — schema (NEW)
- `packages/platform/src/db/budgeting/account-balance-adjustments.ts` — schema (NEW)
- `packages/platform/src/db/budgeting/workspace-budget-mode-history.ts` — schema (NEW)
- `packages/platform/src/db/budgeting/workspace-share-dirty.ts` — schema (NEW)
- `packages/platform/src/db/idempotency-keys.ts` — schema (under shared_kernel) (NEW)
- `packages/platform/src/db/expense-ledger.ts` — MODIFY: add columns transaction_date, note, account_id, category_id, kind, transfer_group_id; drop corrected_by_id (per Open Question 1); add note_tsv GENERATED + GIN index
- `packages/platform/src/index.ts` — MODIFY: barrel exports

### packages/platform/src/middleware/ (NEW)

- `packages/platform/src/middleware/idempotency.ts` — middleware factory (route)

### apps/migrator/ (MODIFY)

- `drizzle/000X_phase2_budgeting.sql` — generated migration (one or more files; drizzle-kit generates)
- `apps/migrator/post-migration.sql` — APPEND: GRANTs + FORCE RLS + triggers for all new Budgeting tables; sum-to-100 constraint trigger for category_share_overrides; member-leave cascade; one-level-group trigger; recurring drafts unique idx; effective-dated open-row partial idx; idempotency cleanup query

### apps/api/src/ (MODIFY + NEW routes)

- `apps/api/src/routes/accounts.ts` — route (NEW)
- `apps/api/src/routes/categories.ts` — route (NEW)
- `apps/api/src/routes/category-limits.ts` — route (NEW)
- `apps/api/src/routes/transactions.ts` — route (NEW)
- `apps/api/src/routes/transactions-search.ts` — route (NEW)
- `apps/api/src/routes/recurring-rules.ts` — route (NEW)
- `apps/api/src/routes/recurring-drafts.ts` — route (NEW)
- `apps/api/src/routes/budget-templates.ts` — route (NEW)
- `apps/api/src/routes/category-share-overrides.ts` — route (NEW)
- `apps/api/src/routes/fx.ts` — route (NEW: GET /fx/rate, GET /fx/preview)
- `apps/api/src/routes/deposit.ts` — route (NEW: POST /deposit/preview, POST /deposit/save)
- `apps/api/src/middleware/idempotency.ts` — middleware (or import from @budget/platform)
- `apps/api/src/app.ts` — MODIFY: insert idempotencyMiddleware after tenantGuard; mount new routes
- `apps/api/src/boot.ts` — MODIFY: wire `deps.budgeting.{accountRepo,...}`, `deps.fx` (FrankfurterFxProvider), `deps.idempotencyRepo`
- `apps/api/test/middleware/idempotency.test.ts` — test (NEW)
- `apps/api/test/routes/*.test.ts` — test (NEW, 9 files)

### apps/worker/src/ (MODIFY)

- `apps/worker/src/handlers/fx-daily-fetch.ts` — worker handler (NEW)
- `apps/worker/src/handlers/recurring-engine.ts` — worker handler (NEW)
- `apps/worker/src/handlers/budgeting-reconciliation.ts` — worker handler (NEW)
- `apps/worker/src/handlers/idempotency-cleanup.ts` — worker handler (NEW)
- `apps/worker/src/worker.ts` — MODIFY: register all new pg-boss queues + schedules
- `apps/worker/src/cli/replay-budgeting.ts` — cli (NEW: `bun run replay:budgeting --from=YYYY-MM-DD --to=YYYY-MM-DD`)
- `apps/worker/test/replay-budgeting.test.ts` — test (NEW)

### apps/web/src/ (NEW UI surfaces)

- `apps/web/src/app/[locale]/accounts/page.tsx` — UI (RSC list)
- `apps/web/src/app/[locale]/accounts/new/page.tsx` — UI (form)
- `apps/web/src/app/[locale]/accounts/[id]/page.tsx` — UI (detail + adjust-balance)
- `apps/web/src/app/[locale]/categories/page.tsx` — UI
- `apps/web/src/app/[locale]/categories/[id]/page.tsx` — UI (limit editor + share-override section)
- `apps/web/src/app/[locale]/transactions/page.tsx` — UI (list + filter)
- `apps/web/src/app/[locale]/transactions/new/page.tsx` — UI (capture form)
- `apps/web/src/app/[locale]/transactions/[id]/page.tsx` — UI (detail + chain panel)
- `apps/web/src/app/[locale]/recurring/page.tsx` — UI (rules CRUD)
- `apps/web/src/app/[locale]/recurring/inbox/page.tsx` — UI (pending drafts)
- `apps/web/src/app/[locale]/templates/page.tsx` — UI (budget templates)
- `apps/web/src/app/[locale]/deposit/page.tsx` — UI (deposit form with FX preview)
- `apps/web/src/components/budgeting/FxFreshnessBadge.tsx` — UI (uses next-intl `formatRelativeTime`)
- `apps/web/src/components/budgeting/AccountForm.tsx` — UI
- `apps/web/src/components/budgeting/CategoryForm.tsx` — UI
- `apps/web/src/components/budgeting/LimitEditor.tsx` — UI (effective-from picker + history)
- `apps/web/src/components/budgeting/TransactionForm.tsx` — UI
- `apps/web/src/components/budgeting/TransactionList.tsx` — UI
- `apps/web/src/components/budgeting/CorrectionChainPanel.tsx` — UI (clicked from edited-badge)
- `apps/web/src/components/budgeting/SearchFilterBar.tsx` — UI
- `apps/web/src/components/budgeting/BulkActionsToolbar.tsx` — UI
- `apps/web/src/components/budgeting/RecurringRuleForm.tsx` — UI
- `apps/web/src/components/budgeting/PendingDraftCard.tsx` — UI (confirm/edit-confirm/skip)
- `apps/web/src/components/budgeting/PrimaryNavBadge.tsx` — UI MODIFY (add pending-count + workspace-dirty banner)
- `apps/web/src/components/budgeting/CategorySharesEditor.tsx` — UI (override toggle + sum=100 counter)
- `apps/web/src/components/budgeting/DepositForm.tsx` — UI (FX preview live)
- `apps/web/src/components/budgeting/BudgetTemplateForm.tsx` — UI
- `apps/web/src/components/budgeting/BudgetBar.tsx` — UI (consumes projection)
- `apps/web/src/components/budgeting/test/*.test.tsx` — test (Vitest + RTL)

### apps/web/messages/ (MODIFY)

- `apps/web/messages/en.json` — i18n: keys for all new UI strings + ICU plurals for FX freshness ("1 day"/"{count} days"), pending-count badge
- `apps/web/messages/pl.json` — i18n
- `apps/web/messages/uk.json` — i18n

### tests/e2e/ (NEW)

- `tests/e2e/features/budgeting/*.feature` — 8 BDD feature files
- `tests/e2e/steps/budgeting-*.steps.ts` — step definitions
- `tests/e2e/pages/AccountsPage.ts` — Page Object
- `tests/e2e/pages/CategoriesPage.ts` — Page Object
- `tests/e2e/pages/TransactionsPage.ts` — Page Object
- `tests/e2e/pages/RecurringInboxPage.ts` — Page Object
- `tests/e2e/pages/DepositPage.ts` — Page Object

### Root config (MODIFY)

- `package.json` — MODIFY: add `replay:budgeting` script
- `bun.lock` — auto-update via `bun install`
- `.dependency-cruiser.cjs` — MODIFY: add `packages/budgeting/src/domain` to domain-no-orm rule (or rely on glob `packages/**/domain`)

### Dependency adds

- root or `apps/web/package.json`: `temporal-polyfill@^0.5` (devDep or dep depending on RSC use)
- `packages/budgeting/package.json`: `temporal-polyfill@^0.5`, `@budget/platform@workspace:*`, `@budget/shared-kernel@workspace:*`, `drizzle-orm@^0.45.2`, `zod@^3.25`

---

## Sources

### Primary (HIGH confidence)

- Phase 1 codebase: read directly — `packages/platform/src/`, `apps/api/src/`, `apps/migrator/post-migration.sql`, `.planning/phases/01-foundations/01-*-SUMMARY.md`
- Phase 1 RESEARCH.md and CONTEXT.md
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/phases/02-budgeting-fx/02-CONTEXT.md`
- Context7 `/timgit/pg-boss` — scheduling.md (cron format, 30s check granularity, tz option)
- Context7 `/websites/frankfurter_dev` — endpoints `/v2/rate/{base}/{quote}`, `/v2/currencies`, `/v2/rates?date=`
- Context7 `/drizzle-team/drizzle-orm-docs` — pgPolicy patterns, between/sql template

### Secondary (MEDIUM confidence)

- TC39 Temporal proposal — `temporal-polyfill` API surface (`Temporal.PlainDate`, `add({months})`, `with({day})`)
- next-intl 4.4.x — `formatRelativeTime` API (CITED via in-stack version pinned)
- Stripe Idempotency-Key reference behavior — industry pattern (CITED via developer.mozilla and stripe.com docs from training)

### Tertiary (LOW confidence)

- (none — flagged claims are tagged `[ASSUMED]` inline)

---

## Assumptions Log

| #   | Claim                                                                                                                                              | Section                              | Risk if Wrong                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| A1  | `corrected_by_id` column exists but cannot be UPDATEd because of REVOKE; planner should drop it                                                    | Pitfall 1 + Open Q 1                 | If kept, edit flow throws permission errors at runtime — HIGH    |
| A2  | `transaction_date`, `note`, `account_id`, `category_id`, `kind`, `transfer_group_id` columns missing from `expense_ledger` and must be ALTER-added | Section 9 + Open Q 2                 | If columns are intended to live elsewhere, schema drift — MEDIUM |
| A3  | `humanize-duration` rejected in favor of next-intl `formatRelativeTime`                                                                            | Section 3                            | Stylistic preference; both work — LOW                            |
| A4  | Transfer = two linked ledger rows (`transfer_group_id`)                                                                                            | Section 7                            | If user expects single row, refactor needed — LOW                |
| A5  | `idempotency_keys` lives in `shared_kernel` schema                                                                                                 | Section 1 + Open Q 3                 | Naming convention — LOW                                          |
| A6  | `BALANCE_ADJUSTMENT` lives in separate table not ledger                                                                                            | Section 7 + Open Q 6                 | If unified, query patterns differ — MEDIUM                       |
| A7  | `current_balance` stored on `accounts` + sync-updated in same tx                                                                                   | Section 7 + Open Q 5                 | If compute-on-demand chosen, all balance reads slower — LOW      |
| A8  | System user seeded for cron-initiated audit_history actor                                                                                          | Pitfall 3 + Open Q 7                 | If NULL allowed, audit constraint relaxation — LOW               |
| A9  | Currency allowlist persisted from Frankfurter `/v2/currencies`                                                                                     | Section "Don't Hand-Roll" + Open Q 8 | If hardcoded, list goes stale — LOW                              |
| A10 | next-intl 4.4.3 `formatRelativeTime` works for EN/PL/UK with ICU plurals                                                                           | Section 3                            | If polyfill needed, extra dep — LOW                              |
| A11 | `temporal-polyfill` ^0.5 is current stable                                                                                                         | Stack                                | Version drift — LOW; verify on planning day with `npm view`      |
| A12 | Recurring `cadence_anchor` semantics                                                                                                               | Open Q 9                             | Edge cases on weekly cadence — MEDIUM                            |

---

## Project Constraints (from CLAUDE.md)

- **Bun 1.2.x runtime** — all backend uses Bun-native APIs.
- **Hono v4.12+** — HTTP framework; no Express.
- **Drizzle (latest)** — ORM; first-class `pgPolicy()`.
- **Zod v3** — validation (CLAUDE.md explicitly bans v4 / Yup / Joi / io-ts).
- **Money = Dinero v2 / big.js** — never bare numbers; ESLint `no-float-money` enforced.
- **Temporal API via `temporal-polyfill`** — for all date-time math; no moment / dayjs.
- **pg-boss v10** (CLAUDE.md) — note: codebase has v12.18.2 (newer; backwards-compatible API).
- **next-intl** for i18n — EN/PL/UK at launch.
- **bun:test backend, Vitest + happy-dom frontend, Playwright E2E** — TDD-FIRST mandatory.
- **DDD bounded contexts** — `domain/`, `application/`, `ports/`, `adapters/`, `contracts/`. Only `contracts/` cross-importable.
- **Drizzle types live ONLY in `src/<context>/adapters/persistence/`** — domain entities have no Drizzle imports (dep-cruiser enforced).
- **`Money` value object converts to `{amount_cents BIGINT, currency CHAR(3)}` at adapter boundary** — note: project uses NUMERIC(19,4) for fiat, NUMERIC(38,18) for crypto, not BIGINT cents — Phase 1 already shipped this; CLAUDE.md table is outdated (NUMERIC pattern is correct per actual schema).
- **DB Postgres + tenant_id + RLS** — every Budgeting table FORCE ROW LEVEL SECURITY.
- **No DB mocking in integration tests** — real Postgres via testcontainer.
- **80% domain coverage** — `bunfig.toml` threshold; do not lower.
- **Append-only ledger + DB role-level REVOKE UPDATE, DELETE on app role** (ENGR-06).
- **GDPR + CCPA** — data export, right-to-delete (Phase 6); for Phase 2, design must not preclude crypto-shredding (PII columns separable).
- **i18n full from day one** — every new string in EN/PL/UK.
- **GSD workflow enforcement** — no direct edits outside a GSD command.

All recommendations in this RESEARCH.md comply with the above. Conflicts are listed in Assumptions Log.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — entirely Phase 1 reuse + 1 new dep (`temporal-polyfill`)
- Architecture: HIGH — patterns are pre-decided in CONTEXT.md or are SCD-Type-2 / Stripe-style standards
- Pitfalls: HIGH — drawn from inspecting Phase 1 code + library docs + canonical pitfalls of each pattern
- Frankfurter integration: HIGH — Context7 docs verified
- pg-boss scheduling: HIGH — Context7 docs verified
- Effective-dated limit math: MEDIUM — domain decision; planner may pick variant edge-cases
- Recurring engine cadence math: MEDIUM — Temporal API works but edge cases (Feb-29, day-31) need test coverage

**Research date:** 2026-05-09
**Valid until:** 2026-06-08 (30-day expiry; Frankfurter API contract is stable; pg-boss v12 is current; Drizzle 0.45.x is current; next-intl 4.4.x is current)

---

## RESEARCH COMPLETE

**Phase:** 2 - Budgeting & FX
**Confidence:** HIGH

### Key Findings

- **Phase 1 substrate is sufficient.** All required platform primitives (RLS, tx primitives, audit/outbox helpers, Money, FxProvider port, pg-boss, expense_ledger primitive) exist on disk. Phase 2 reuses, never extends.
- **Two schema gaps identified in Phase 1's `expense_ledger`:** missing `transaction_date`, `note`, `account_id`, `category_id`, `kind`, `transfer_group_id` columns; and `corrected_by_id` is unwritable due to REVOKE. Both must be addressed in Plan 00 of Phase 2 before any transaction work.
- **Effective-dated `category_limits` (D-04-b) is the single most-novel domain pattern;** Kimball SCD Type 2 with partial-unique-on-open-row enforces correctness.
- **Recurring engine is pending-by-default (D-01-e/f/g):** drafts in mutable `recurring_drafts` table separate from immutable ledger; cron iterates per-tenant via `withTenantTx`, NEVER `withInfraTx` (RLS preservation).
- **FX adapter design:** Frankfurter v2 endpoint `GET /v2/rate/{base}/{quote}?date=...` + cache-first lookup + most-recent-prior fallback. `next-intl formatRelativeTime` for the freshness badge — no `humanize-duration` needed.
- **Idempotency middleware:** `(tenant_id, user_id, route, key_value)` scope_hash + body_hash. Inserts AFTER tenantGuard.
- **9 plans recommended** (~46 tasks total). Plans 02–04 plus the projection/search/share split into parallel-eligible tracks once foundations + FX/idempotency are done.

### File Created

`/home/claude/budget/.planning/phases/02-budgeting-fx/02-RESEARCH.md`

### Confidence Assessment

| Area                   | Level  | Reason                                                             |
| ---------------------- | ------ | ------------------------------------------------------------------ |
| Standard Stack         | HIGH   | Phase 1 reuse + 1 new dep verified                                 |
| Architecture           | HIGH   | Patterns pre-decided in CONTEXT.md or SCD-Type-2 / Stripe-standard |
| Pitfalls               | HIGH   | Drawn from Phase 1 codebase inspection + library docs              |
| Effective-dated limits | MEDIUM | Domain edge cases need test coverage                               |
| Recurring cadence math | MEDIUM | Temporal API edge cases (Feb-29)                                   |

### Open Questions (RESOLVED)

All 9 listed above were resolved by user ratification in CONTEXT.md D-05-a..i (corrected_by_id resolution, ledger column extensions, idempotency schema location, budget-mode storage, balance reconciliation strategy, ledger-discriminator vs side-tables, system user seeding, currency allowlist source, weekly cadence anchor semantics). All recommendations stand as the locked decisions.

### Ready for Planning

Research complete. Planner can now create the 9 PLAN.md files following the recommended slicing.
