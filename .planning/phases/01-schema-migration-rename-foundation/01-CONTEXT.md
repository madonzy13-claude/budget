# Phase 1: Schema Migration & Rename Foundation - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Single Drizzle migration that takes v1.0 schema to v1.1: rename `workspaces`→`budgets` and `accounts`→`wallets` (tables + FK columns), drop legacy columns (`transactions.kind`, `transactions.account_id`, `transactions.to_account_id`, `transactions.direction`, `accounts.scope`), add new columns (`wallets.wallet_type` enum SPENDINGS/CUSHION/RESERVE, `budgets.cushion_mode_enabled` boolean, `category_limits.cushion_amount_cents`, `categories.sort_index`), create new `tasks` table, rename existing SCD-2 table `workspace_budget_mode_history`→`budget_mode_history`. Nuke dev DB. Cascade the rename into domain entity classes (`Workspace`→`Budget`, `Account`→`Wallet` in `packages/budgeting`, `packages/tenancy`), Hono route mounts (`/workspaces/*`→`/budgets/*`, `/accounts/*`→`/wallets/*` with old paths returning 404), i18n message keys (`workspaces.*`→`budgets.*`, `accounts.*`→`wallets.*` across EN/PL/UK), and `apps/web/lib/api-client.ts` URL constants so v1.0 web pages keep working until Phase 3 restructures them. Tenant-leak CI gate stays 6/6 green against renamed tables.

**Out of phase (Phase 2 territory):** reshaping Hono request/response bodies for the new categorical-only transaction schema, FX side-slider amounts, recurring-engine extended cadence, reserves auto-compute SQL view, share-link backend routes. Phase 1 only does mechanical renames + DROP COLUMN + minimum compile-fix on route handlers.

**Out of phase (Phase 3 territory):** web UI restructuring (top-nav budget switcher, home page cards, BDP tab frame). v1.0 web pages survive Phase 1 because `api-client.ts` URLs are updated to `/budgets/*` and `/wallets/*` paths.

</domain>

<decisions>
## Implementation Decisions

### Migration shape

- **D-01:** Hybrid Drizzle-natural migration. Rename schema files in place + edit table names → Drizzle-kit auto-generates `ALTER TABLE … RENAME TO` and `ALTER TABLE … RENAME COLUMN` for surviving tables/columns (`workspaces`→`budgets`, `workspace_id`→`budget_id`, `accounts`→`wallets`, `account_id`→`wallet_id`, `workspace_budget_mode_history`→`budget_mode_history`). DROP statements for removed columns (`transactions.kind`, `transactions.account_id`, `transactions.to_account_id`, `transactions.direction`, `accounts.scope`). CREATE statements for net-new (`tasks` table, `wallet_type` enum, `categories.sort_index`, `budgets.cushion_mode_enabled`, `category_limits.cushion_amount_cents`). One numbered migration file `drizzle/0012_*.sql` produced by `drizzle-kit generate`. RLS policies reattach automatically via Postgres RENAME semantics.
- **D-02:** Dev DB nuke (MIG-09) is the recovery path — migration is idempotent at the schema level but not at the data level. Acceptable because no production deployment exists.

### Cushion-mode history

- **D-03:** Dual storage. Add `budgets.cushion_mode_enabled boolean default false` for cheap current-state reads (UI toggle, single-row read on every BDP render). Rename existing SCD-2 table `workspace_budget_mode_history`→`budget_mode_history` (and its `workspace_id`→`budget_id` column) — RSCM-02 reads it for historical-month evaluation. Toggle writes both atomically inside a transaction: flip the boolean and close the open SCD-2 row (`effective_to = today`) + insert new SCD-2 row with `effective_from = today`. Existing `mode` text CHECK constraint stays `('NORMAL','CUSHION')`; mapping is `false ↔ NORMAL`, `true ↔ CUSHION`.
- **D-04:** Existing `workspace-budget-mode-history-schema.ts` file is the renamed target. Drizzle policy `workspace_budget_mode_history_tenant_isolation` rename + sql ref to `tenant_ids` setting unchanged. Schema file moves to `budget-mode-history-schema.ts`.

### Plan granularity inside Phase 1

- **D-05:** Layered waves, four plans, executed sequentially:
  - **01-01 Schema migration & dev DB nuke** — edit `*-schema.ts` files, run `drizzle-kit generate`, write `0012_phase01_rename.sql`, dev DB nuke, RLS policy verification, tenant-leak CI gate updated to target renamed tables (MIG-01..09, MIG-13).
  - **01-02 Domain entity rename** — `Workspace`→`Budget`, `Account`→`Wallet` across `packages/budgeting/src/domain/`, `packages/tenancy/src/`, plus repos in `packages/budgeting/src/adapters/persistence/` (e.g. `account-repo.ts`→`wallet-repo.ts`). Minimum compile-fix on anything referencing dropped columns (MIG-12).
  - **01-03 API route rename** — `apps/api/src/routes/{workspaces,accounts}.ts`→`{budgets,wallets}.ts`, mount paths flipped, dropped-column field refs stripped from queries (route SHAPES otherwise unchanged), `app.ts` route registration updated, `/budgets/health` smoke check returns 200, `/workspaces/*` returns 404 with no aliases (MIG-11).
  - **01-04 i18n + web client + CI gate verification** — `apps/web/messages/{en,pl,uk}.json` keys renamed (`workspaces.*`→`budgets.*`, `accounts.*`→`wallets.*` — including all the sub-trees), `apps/web/src/lib/api-client.ts` URL constants updated to `/budgets` and `/wallets`, search for any remaining hardcoded `/workspaces` or `/accounts` URLs in web pages and update, `make ci-gate` 6/6 green, smoke test on each tab of v1.0 web UI still loads via renamed routes (MIG-10).
- **D-06:** Each plan ships as one execution batch with atomic commits per `gsd-executor` defaults. Plan order is dependency-strict (schema before domain before API before web client).

### Phase 1 ↔ Phase 2 boundary

- **D-07:** Route bodies receive minimum compile-fix in Phase 1. Strip references to dropped columns (`kind`, `account_id`, `to_account_id`, `direction`, `accounts.scope`) from Drizzle queries and repos so the app builds. Hono request/response Zod schemas, response payloads, and route handler logic otherwise stay v1.0-shaped. Phase 2 reshapes them (new categorical txn schema, FX fields, drafts endpoints, reserves view, share-link routes). This keeps the Phase 1 surface bounded.
- **D-08:** Web client URL constants updated in Phase 1 (`apps/web/src/lib/api-client.ts`). v1.0 pages calling `/workspaces/[id]` etc. transparently hit `/budgets/[id]` afterwards. No 404 gap between Phase 1 and Phase 3 ship. UI structure (sidebar, page layouts) untouched in Phase 1 — Phase 3 owns that.
- **D-09:** No temporary route aliases. Roadmap success criterion #5 is strict: `/workspaces/*` and `/accounts/*` return 404 immediately after Phase 1 ships. Catches any missed call site.

### Late additions from research (2026-05-11, post-research)

- **D-10:** Rename request header `X-Workspace-ID` → `X-Budget-ID` in Phase 1, lockstep with table/route renames. Sites confirmed by research: `apps/api/src/middleware/tenant-guard.ts:43`, `apps/web/src/lib/api-client.ts:23-25`, `apps/web/src/lib/workspace-fetch.ts:24-26`. Plan 01-03 (API) and 01-04 (web client) split the work. Keeps the Phase 1 surface fully renamed; no Phase-1↔Phase-3 inconsistency.
- **D-11:** Keep cushion column name as `cushion_amount` (already exists per `packages/budgeting/src/adapters/persistence/category-limits-schema.ts:25`). MIG-05's `_cents` suffix wording is cosmetic and does NOT apply — the existing schema column is the source of truth. SCD-2 versioning pattern remains as decided in D-03.
- **D-12:** Retain `balance_adjustments` table in Phase 1. Rename FK columns `workspace_id`→`budget_id` and `account_id`→`wallet_id` as part of the standard rename pass. Rationale: WALT-03 manual wallet-balance edit path uses this table. Dev-DB-nuke wipes row data; schema survives.
- **D-13:** DROP `categories.scope` column in Phase 1 (in addition to MIG-03's listed drops). Rationale: scope (`PERSONAL`/`SHARED`) is redundant with budget-level visibility — a budget's `is_shared` flag determines all its categories' visibility under v1.1 IA. Cascades into ~8 call sites: `packages/budgeting/src/domain/category.ts` (entity field), `packages/budgeting/src/adapters/persistence/category-repo.ts:47,61,72`, `packages/budgeting/src/application/create-category.ts:65`, `packages/budgeting/src/application/find-category-by-id.ts:24`, `packages/budgeting/src/application/rename-category.ts:42`, `packages/budgeting/src/application/archive-category.ts:43`, `packages/budgeting/src/contracts/api.ts:53,59`, `apps/web/src/components/budgeting/transaction-filter-chips.tsx`, `tests/e2e/steps/budget.steps.ts:161,641`, `tests/e2e/pages/TransactionsPage.ts:132`. Plan 01-02 owns domain/application/repo strip + contract update; plan 01-04 owns web filter-chip + E2E rewrite.

### Claude's Discretion

- Tasks table internals (RLS policy shape, indexes on `(budget_id, status)` and `(kind)`, FK to `budgets(id) ON DELETE CASCADE`, `kind` enum vs text+CHECK) — apply the same RLS pattern as `workspace_budget_mode_history` (tenant_id-anchored, `appRole + workerRole`). Generators and reads land in Phase 7; Phase 1 just creates the empty table.
- `categories.sort_index` default = 0 for fresh categories; onboarding wizard seeding (Phase 6) assigns increments. Phase 1 just adds the column with `default 0 not null`.
- i18n key rename approach: rewrite each locale JSON in place (drop `workspaces` and `accounts` top-level keys, write `budgets` and `wallets` with the same sub-trees). Codemod via `sed`/`jq` over the three files is acceptable; manual review pass on each file for `i18n_key_path` strings inside component code.
- Drizzle migration file naming: `drizzle/0012_phase01_v11_rename.sql` (next sequential number after `0011_plan_02_08_recurring.sql`).
- Cushion column lifecycle on `category_limits`: parallel SCD-2 column means the row gets versioned when EITHER `planned_amount_cents` OR `cushion_amount_cents` changes. Reuse existing SCD-2 versioning pattern from `category_limits` (close old row + insert new row with `effective_from = today`).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements

- `.planning/ROADMAP.md` §Phase 1 — phase goal + 5 success criteria + dependency graph
- `.planning/REQUIREMENTS.md` §MIG (MIG-01..MIG-13) — 13 atomic requirements, all in Phase 1
- `.planning/REQUIREMENTS.md` §ENGR (ENGR-04) — tenant-leak CI gate constraint
- `.planning/v1.1-SPEC.md` §1 (rename matrix), §8 (cushion-mode history algorithm), §14 (migration approach + dev DB nuke), §16 (suggestive plan slicing — supersedes the 03-xx labels with the 01-xx layered waves above)

### Project conventions

- `CLAUDE.md` — TDD-first, Drizzle types ONLY in `adapters/persistence/`, `Money` value object at adapter boundary, RLS via `pgPolicy()`, dependency-cruiser blocks domain imports of drizzle-orm / Hono / adapters
- `apps/migrator/post-migration.sql` — RLS policy bootstrap + role grants (`app`, `worker`) — must keep targeting renamed tables

### Existing schema (in-scope for rename)

- `packages/budgeting/src/adapters/persistence/accounts-schema.ts` — rename to `wallets-schema.ts`; rename table + add `wallet_type` enum + drop `scope`
- `packages/budgeting/src/adapters/persistence/categories-schema.ts` — add `sort_index INTEGER not null default 0`
- `packages/budgeting/src/adapters/persistence/category-limits-schema.ts` — add `cushion_amount_cents bigint` (parallel SCD-2 column)
- `packages/budgeting/src/adapters/persistence/workspace-budget-mode-history-schema.ts` — rename file to `budget-mode-history-schema.ts`; rename table + `workspace_id`→`budget_id`
- `packages/budgeting/src/adapters/persistence/transaction-repo.ts` — strip `kind`, `account_id`, `to_account_id`, `direction` from queries
- `packages/budgeting/src/adapters/persistence/account-repo.ts` — rename to `wallet-repo.ts`
- `packages/budgeting/src/adapters/persistence/recurring-drafts-schema.ts` — verify FK rename to `budget_id` propagates
- `packages/budgeting/src/adapters/persistence/recurring-rules-schema.ts` — same
- `packages/budgeting/src/adapters/persistence/balance-adjustments-schema.ts` — drop or rename; verify whether still needed under new IA (income/transfer ledger gone — see SPEC §7)
- `packages/tenancy/src/adapters/persistence/schema.ts` — workspaces table location; rename
- `drizzle/0000_giant_shotgun.sql` through `drizzle/0011_plan_02_08_recurring.sql` — sequence head; new migration is `0012_*.sql`

### Domain entities to rename

- `packages/budgeting/src/domain/account.ts` — rename file + class `Account`→`Wallet`
- `packages/tenancy/src/` — `Workspace` entity + repos; rename file paths + classes
- All importers of these entities under `packages/**/src/**` and `apps/api/src/**`

### Routes to rename

- `apps/api/src/routes/workspaces.ts` → `budgets.ts`
- `apps/api/src/routes/accounts.ts` → `wallets.ts`
- `apps/api/src/app.ts` — mount paths flipped; old paths removed (no aliases)
- `apps/api/src/middleware/tenant-guard.ts` — verify it doesn't hardcode old route names

### i18n + web client

- `apps/web/messages/en.json` — rewrite `workspaces.*` → `budgets.*`, `accounts.*` → `wallets.*` sub-trees
- `apps/web/messages/pl.json` — same; PL translation preserved
- `apps/web/messages/uk.json` — same; UK translation preserved
- `apps/web/src/lib/api-client.ts` — URL constants flipped to `/budgets` and `/wallets`
- `apps/web/src/**/*.tsx` — search for hardcoded `/workspaces` or `/accounts` URL strings and update

### CI gate

- `make ci-gate` Makefile target — actual gate is 5 backend tests + 1 Playwright `apps/web/e2e/cross-tenant-cache.spec.ts` per `scripts/ci/run-tenant-leak.sh:9-10`. `scripts/ci/USER-DATA-TABLES.txt:30-32,43` and `tests/ci-gate/fixtures/seed-two-tenants.ts:17,90,153,169,188-218` need updating from `workspaces`/`accounts` → `budgets`/`wallets`
- `bunfig.toml` — 80% domain coverage threshold; do not lower (ENGR-01)

### Research findings (2026-05-11)

- `packages/tenancy/src/adapters/persistence/schema.ts` — `tenancy.workspaces` lives in `tenancy` schema (not `budgeting`). `apps/migrator/post-migration.sql` has 23+ references at lines 185-388 (policies, triggers, GRANTs) — MUST be edited in lockstep with `0012_*.sql` or container boot fails.
- **`identity.accounts` (Better Auth provider accounts) MUST NOT be renamed.** Only `budgeting.accounts` becomes `wallets`. Confirmed by research §Q1.
- **Better Auth org plugin field binding:** `workspace_members.workspace_id` column may rename to `budget_id` safely, BUT the JS field name `organizationId` must stay (plugin contract). Affects domain class field naming in `packages/tenancy/`.
- **`workspace_share_dirty` is in `budgeting` schema** (per `post-migration.sql:473`). Rename target: `budgeting.budget_share_dirty`.
- **Drizzle-kit RENAME detection is interactive (TTY-only).** Existing `drizzle/0011_plan_02_08_recurring.sql` was hand-authored — same pattern for `0012_phase01_v11_rename.sql`. Planner instructs executor to hand-author the SQL, not rely on `drizzle-kit generate`.
- **MIG-03 wording mismatch:** real ledger table is `budgeting.expense_ledger` (not `transactions`). Columns `direction` and `to_account_id` do NOT currently exist in the schema; MIG-03 wording is forward-looking but only `kind`, `account_id` (and `accounts.scope` per MIG) actually need DROP. Planner should treat MIG-03 as "drop whatever of {kind, account_id, to_account_id, direction} currently exists" — silently no-op the absent ones.
- **pg-boss queues unaffected** (separate schema). One worker handler affected: `apps/worker/src/handlers/recurring-engine.ts:36,77,96,99` + its test fixture — references to renamed identifiers, included in plan 01-02 scope.

### Design system

- `DESIGN.md` — Binance dark canvas, single yellow accent, Inter + IBM Plex Sans (carried from memory; UI scope is Phase 3+ so only relevant for grep-anchoring locale keys)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **SCD-2 versioning pattern** — `category_limits` already uses `effective_from`/`effective_to` SCD-2 columns. Apply the same pattern to the new `cushion_amount_cents` column (close+insert on edit).
- **RLS policy primitive** — `pgPolicy(...)` with `tenant_id = ANY(current_setting('app.tenant_ids', true)::uuid[])` is reused on every multi-tenant table. New `tasks` and renamed `budget_mode_history` follow this exact shape.
- **`withTenantTx` primitive** — wraps every DB write with tenant scope. Survives rename — only the table names inside its queries change.
- **`appRole` / `workerRole`** — imported from `@budget/platform`; reattach to renamed tables via Drizzle `pgPolicy.to[]`.

### Established Patterns

- **Drizzle types live ONLY in `adapters/persistence/`** — domain entities are plain classes. Rename touches both layers but keeps the boundary.
- **Hexagonal layering enforced by dependency-cruiser** — Phase 1 rename must not introduce any drizzle/Hono import into `domain/`. Verify after each plan commit.
- **Money value object at adapter boundary** — `amount_*_cents BIGINT + currency CHAR(3)` columns stay; no domain change.
- **pg-boss queue lives in `pgboss` schema** — outside the budgeting schema, untouched by rename. Verify no `pg_boss` job refs hardcode old table names (`account_id`, etc.) inside payloads.

### Integration Points

- **`apps/migrator/post-migration.sql`** — runs after Drizzle migrations on container start. Updates RLS policies and grants. Must be edited in lockstep with the new migration.
- **`docker-compose.yml`** — `make dev-build` rebuilds web+api+worker+migrator images. After Phase 1 plans land, full image rebuild required (i18n bundled at build time per `CLAUDE.md`).
- **Tenant-leak CI gate (6 tests)** — verify the test file references the renamed tables. Probably under `apps/api/test/` or `tests/ci-gate/`; planner locates exact path during research.
- **`apps/web/src/middleware.ts`** — verify the workspace-context header injection mechanism (header is `x-workspace-id` per session memory S183) is renamed to `x-budget-id` consistently with route paths.

</code_context>

<specifics>
## Specific Ideas

- User explicitly chose `Drizzle-natural` migration shape over hand-written DROP+CREATE. Reasoning: smaller diff, RLS auto-reattach, replay-safe if dev DB ever survives a nuke.
- User explicitly chose layered-wave plans over a single sweep PR. Reasoning: each layer (schema / domain / API / i18n+web) is independently reviewable and revertable.
- User chose minimum compile-fix on route bodies. Phase 2 will reshape them; Phase 1 just keeps the app compiling.
- User chose to update `api-client.ts` in Phase 1 to prevent a 404 gap between Phase 1 ship and Phase 3 web restructure.
- Existing `workspace-budget-mode-history-schema.ts` is the renamed target — do NOT delete and recreate; do RENAME so SCD-2 history rows survive into v1.1 (even though dev DB is nuked, the schema file is the source of truth for any later replay).

</specifics>

<deferred>
## Deferred Ideas

- **Income tracking + transfer ledger** — v1.1 explicitly drops these (REQUIREMENTS.md §Out of scope). Schema columns gone in Phase 1; if reintroduced, would be a future-milestone schema addition.
- **Wallet↔transaction linkage** — v1.1 explicitly drops (REQUIREMENTS.md §Out of scope). Transactions purely categorical.
- **Materialized view for reserves auto-compute** — Phase 2 decision per Risk Register row 2. Phase 1 ships the schema only; the SQL view lands in Phase 2.
- **`balance_adjustments` table fate** — unclear whether v1.1 needs it (income/transfer gone). Planner of plan 01-01 decides whether to DROP in Phase 1 or leave dormant for later cleanup. Note for plan-phase.
- **Drag-reorder UI** — `categories.sort_index` column added in Phase 1; UI lands in Phase 4 (GRID-09).
- **Tasks generators + UI** — `tasks` table created empty in Phase 1; generators (RESERVE_TOPUP, CONFIRM_DRAFT, STALE_WALLET, MONTH_END_REVIEW) and banner UI land in Phase 7.

</deferred>

---

_Phase: 1-Schema Migration & Rename Foundation_
_Context gathered: 2026-05-11_
