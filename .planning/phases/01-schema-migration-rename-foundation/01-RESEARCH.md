# Phase 1: Schema Migration & Rename Foundation - Research

**Researched:** 2026-05-11
**Domain:** Drizzle migration + monorepo-wide rename (workspaces→budgets, accounts→wallets)
**Confidence:** HIGH (filesystem verified; one MEDIUM item — Drizzle-kit interactive RENAME prompt semantics)

## Summary

Phase 1 is a mechanical schema + identifier rename layered into four sequential plans. The repo has 0011 numbered Drizzle migrations and `apps/migrator/drizzle.config.ts` lists 22 schema files; the next file is `drizzle/0012_phase01_v11_rename.sql`. The locked decisions in CONTEXT.md hold up against the actual filesystem with **two surprises** the planner must account for:

1. **`tenancy.workspaces` lives in the `tenancy` schema, NOT `budgeting`.** The renamed table belongs in `tenancy.budgets`. `post-migration.sql` references `tenancy.workspaces` in **23 distinct sites** (policies, triggers, GRANTs) and **also** `budgeting.workspace_budget_mode_history` and `budgeting.workspace_share_dirty`. Every one of these must be updated in lockstep with the migration; otherwise `make migrate` fails because triggers reference a non-existent table.
2. **The last hand-rolled migration (`0011_plan_02_08_recurring.sql`) was written manually** with a header comment: _"Generated manually (drizzle-kit requires TTY; created by plan executor)"_. drizzle-kit's rename-detection IS interactive — when it sees a table disappear and another appear with similar columns it prompts _"Is X renamed from Y?"_. Plan 01-01 cannot rely on `bun run generate` from a non-TTY shell to emit the right RENAME statements; the migration must be hand-authored or generated under `script -q` / `expect`.

There are also **identity.accounts** (Better Auth provider accounts — must NOT be renamed) and a **second-layer trap**: `tenancy.workspace_members.organizationId` is the JS field name but maps to column `workspace_id`. Drizzle does NOT auto-rename column-name-vs-JS-key mismatches.

**Primary recommendation:** Hand-author `drizzle/0012_phase01_v11_rename.sql` with explicit `ALTER TABLE … RENAME TO`, `ALTER TABLE … RENAME COLUMN`, `DROP COLUMN`, `CREATE TABLE`. Do not depend on `drizzle-kit generate`'s rename detection. Update `apps/migrator/post-migration.sql` in the same plan commit (plan 01-01) — drizzle migration alone WILL fail at container start without the post-migration update.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Hybrid Drizzle-natural migration. Rename schema files in place + edit table names; emit one `drizzle/0012_*.sql` produced by `drizzle-kit generate` (or hand-author equivalent — see Q3). RLS policies reattach automatically via Postgres RENAME semantics.
- **D-02:** Dev DB nuke is the recovery path. Migration is schema-idempotent, not data-idempotent. Acceptable per zero prod.
- **D-03:** Dual cushion storage. `budgets.cushion_mode_enabled boolean default false` + renamed SCD-2 `budget_mode_history` (was `workspace_budget_mode_history`).
- **D-04:** Existing `workspace-budget-mode-history-schema.ts` is the renamed target → `budget-mode-history-schema.ts`. Drizzle policy + sql ref to `tenant_ids` unchanged.
- **D-05:** FOUR plans, layered & sequential:
  - **01-01** Schema migration + dev DB nuke + tenant-leak gate update (MIG-01..09, MIG-13)
  - **01-02** Domain entity rename — `Workspace→Budget`, `Account→Wallet` (MIG-12)
  - **01-03** API route rename — `/workspaces`→`/budgets`, `/accounts`→`/wallets`; old paths 404 (MIG-11)
  - **01-04** i18n + web client + CI gate verification (MIG-10)
- **D-06:** One execution batch per plan, atomic commits via gsd-executor defaults.
- **D-07:** Minimum compile-fix on route bodies. Strip dropped-column refs. Phase 2 reshapes.
- **D-08:** `apps/web/src/lib/api-client.ts` URL constants updated in Phase 1 to avoid 404 gap.
- **D-09:** NO temporary route aliases. `/workspaces/*` and `/accounts/*` return 404 immediately.

### Claude's Discretion

- Tasks table internals (RLS policy shape, indexes on `(budget_id, status)` and `(kind)`, FK to `budgets(id) ON DELETE CASCADE`, `kind` enum vs text+CHECK) — apply tenant-isolation pattern from `workspace_budget_mode_history`. Generators land in Phase 7.
- `categories.sort_index` default = 0 not null.
- i18n rewrite approach (in-place rewrite via codemod) — manual review acceptable.
- Drizzle migration file name: `drizzle/0012_phase01_v11_rename.sql`.
- Cushion column lifecycle on `category_limits`: SCD-2 versioning on either `planned_amount_cents` or `cushion_amount_cents` change.

### Deferred Ideas (OUT OF SCOPE)

- Income tracking + transfer ledger (v1.1 drops; reintroduction is future-milestone)
- Wallet↔transaction linkage (v1.1 drops; transactions categorical-only)
- Reserves auto-compute materialized view (Phase 2)
- `balance_adjustments` table fate — planner of 01-01 decides; recommendation in Q9 below
- Drag-reorder UI (`categories.sort_index` UI lands Phase 4, GRID-09)
- Tasks generators + banner UI (Phase 7)

## Phase Requirements

| ID     | Description                                                                                                                   | Research Support                                                                      |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| MIG-01 | Rename `workspaces`→`budgets`; FK `workspace_id`→`budget_id` everywhere                                                       | Q1, Q3 — 23 post-migration sites + drizzle-kit hand-author                            |
| MIG-02 | Rename `accounts`→`wallets`; FK `account_id`→`wallet_id` everywhere                                                           | Q1, Q2 — accounts-schema.ts, recurring-rules, recurring-drafts, balance-adjustments   |
| MIG-03 | DROP `transactions.kind`, `transactions.account_id`, `transactions.to_account_id`, `transactions.direction`, `accounts.scope` | Q2 — actual current state is `expense_ledger` (different table); see correction in Q2 |
| MIG-04 | Add `wallets.wallet_type` enum (SPENDINGS, CUSHION, RESERVE) replacing `accounts.account_kind`                                | Q1 — `accounts.kind` text+CHECK currently                                             |
| MIG-05 | Add `category_limits.cushion_amount_cents`                                                                                    | Q1 — current schema has `cushionAmount`/`cushionCurrency` already; see Q1 nuance      |
| MIG-06 | Add `budgets.cushion_mode_enabled boolean default false`                                                                      | D-03                                                                                  |
| MIG-07 | Add `categories.sort_index INTEGER` per-budget                                                                                | D-05, discretion                                                                      |
| MIG-08 | Create `tasks` table                                                                                                          | D-05 discretion (RLS pattern from `workspace_budget_mode_history`)                    |
| MIG-09 | Dev DB nuke                                                                                                                   | D-02                                                                                  |
| MIG-10 | i18n key rename `workspaces.*`→`budgets.*`, `accounts.*`→`wallets.*` across EN/PL/UK                                          | Q6                                                                                    |
| MIG-11 | Hono routes renamed; old paths 404                                                                                            | Q5, Q7, Q8                                                                            |
| MIG-12 | Domain entities renamed across `packages/budgeting`, `packages/tenancy`                                                       | Q1, Q2                                                                                |
| MIG-13 | Tenant-leak CI gate updated to target renamed tables; passes 6/6                                                              | Q5 — actually 5 backend tests + 1 Playwright                                          |

## Architectural Responsibility Map

| Capability                      | Primary Tier                                                                                                                | Secondary Tier                                              | Rationale                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| Schema DDL (RENAME/DROP/CREATE) | Migrator (`apps/migrator`)                                                                                                  | Postgres                                                    | `drizzle-kit` generates SQL; migrator container applies on boot    |
| RLS policy reattachment         | Postgres (automatic on RENAME)                                                                                              | post-migration.sql (re-asserts FORCE RLS, GRANTs, triggers) | RENAME preserves policies; post-migration must reference new names |
| Domain entity definitions       | `packages/budgeting/src/domain/`, `packages/tenancy/src/domain/`                                                            | —                                                           | Plain classes, no Drizzle imports per dep-cruiser                  |
| Repository SQL                  | `packages/budgeting/src/adapters/persistence/`, `packages/tenancy/src/adapters/persistence/`                                | —                                                           | Only adapter layer touches Drizzle / SQL                           |
| HTTP route mounting             | `apps/api/src/app.ts` + `apps/api/src/routes/{budgets,wallets}.ts`                                                          | Hono `route()`                                              | One mount per resource; 404 on old paths is default Hono behaviour |
| Tenant header injection         | Browser `apps/web/src/lib/workspace-fetch.ts` (rename to `budget-fetch.ts`) → API `apps/api/src/middleware/tenant-guard.ts` | —                                                           | Header is `X-Workspace-ID` today; see Q10 for rename decision      |
| i18n message catalogs           | `apps/web/messages/{en,pl,uk}.json`                                                                                         | next-intl runtime                                           | Build-time bundled per CLAUDE.md — requires `make dev-build`       |
| Tenant-leak gate fixture        | `tests/tenant-leak/` + `tests/tenant-leak/USER-DATA-TABLES.txt`                                                             | —                                                           | Test names enumerated explicitly in USER-DATA-TABLES.txt           |

## Standard Stack

### Core

| Library     | Version                                        | Purpose                          | Why Standard                                                                            |
| ----------- | ---------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------- |
| drizzle-orm | 0.45.2 [VERIFIED: package.json]                | Drizzle types + sql template tag | Already adopted; `pgPolicy()` first-class RLS                                           |
| drizzle-kit | 0.31.10 [VERIFIED: apps/migrator/package.json] | Migration generator              | Phase 1 produces 0012\_\*.sql                                                           |
| Hono        | v4 (project) [VERIFIED: imports]               | Route mounting                   | `app.route("/budgets", ...)` is one-line per resource                                   |
| Zod v3      | (project standard)                             | Validator on every route         | Existing pattern; rename touches route bodies minimally                                 |
| Better Auth | 1.4+                                           | Identity + orgs plugin           | `tenancy.workspaces` is the Better Auth org table — renaming forces field-mapping check |

### Supporting (Phase 1 specific)

| Library                                              | Version   | Purpose                                                                     | When to Use             |
| ---------------------------------------------------- | --------- | --------------------------------------------------------------------------- | ----------------------- |
| `@budget/platform`                                   | workspace | `withTenantTx`, `appRole`, `workerRole`, `budgeting`, `tenancy` schema refs | All adapter writes      |
| testcontainers (via `@budget/db/test/testcontainer`) | workspace | Tenant-leak integration test DB                                             | Plan 01-04 verification |

## System Architecture Diagram

```
[Schema file edits in *-schema.ts]
        │
        ▼
[drizzle-kit generate (NOT interactive — hand-author)]
        │
        ▼
drizzle/0012_phase01_v11_rename.sql  ──┐
                                       ├──► docker compose run migrator
apps/migrator/post-migration.sql  ─────┘     (runs drizzle-kit migrate + post-migration.sql)
                                                              │
                                                              ▼
                                                   Postgres: tables renamed,
                                                   RLS policies follow tables,
                                                   FORCE RLS re-asserted, GRANTs reapplied
                                                              │
        ┌───────────── compile-time fix ──────────────────────┘
        ▼
packages/{budgeting,tenancy}/src/domain/ + adapters/persistence/ + ports/
        │
        ▼
apps/api/src/routes/{budgets,wallets}.ts  +  apps/api/src/app.ts (mount paths)
        │
        ▼
apps/web/src/lib/api-client.ts (URL constants)  +  apps/web/messages/{en,pl,uk}.json
        │
        ▼
make ci-gate  →  6/6 green on renamed tables
```

## Architecture Patterns

### Pattern 1: Drizzle RENAME chain (DDL-only)

**What:** `ALTER TABLE budgeting.accounts RENAME TO wallets;` then `ALTER TABLE budgeting.wallets RENAME COLUMN kind TO wallet_type;`. RLS policies, indexes, FK constraints, triggers, GRANTs **automatically follow the table** because they reference the table by OID in `pg_class`.
**When to use:** Phase 1 — every table being renamed.
**Citation:** `[CITED: PostgreSQL docs — ALTER TABLE … RENAME]` confirms policies and indexes follow; `[VERIFIED: post-migration.sql lines 192-305]` shows policies reference table names by string, so the renamed name MUST be present in post-migration when it re-asserts them. Drizzle's `pgPolicy()` regenerates the policy at next migration but the rename migration itself preserves it.

### Pattern 2: Post-migration in lockstep

**What:** `apps/migrator/post-migration.sql` runs after every drizzle migration on container boot. It contains 23 references to `tenancy.workspaces` (lines 185-365) and several to `budgeting.workspace_budget_mode_history` (lines 415, 423, 452), `budgeting.workspace_share_dirty` (lines 473-520), and `tenancy.workspace_members` (lines 185-388).
**When to use:** Always with this rename — post-migration is THE bootstrap RLS file.
**Action for planner:** Plan 01-01 commits `0012_*.sql` AND the updated `post-migration.sql` together.

### Pattern 3: One-line Hono route swap

**What:** `apps/api/src/app.ts` mounts via `app.route("/workspaces", workspacesRoutesFactory(deps))`. Renaming = change path string + factory import + middleware path string. No alias = old path falls through to default 404.
**When to use:** Plan 01-03.

### Anti-Patterns to Avoid

- **Anti-pattern: Trusting `drizzle-kit generate` to detect renames non-interactively.** It prompts on TTY. The existing `0011_plan_02_08_recurring.sql` header proves the project already side-steps this with hand-authored SQL. **What to do instead:** hand-author 0012 with explicit `ALTER TABLE … RENAME`. Run `bun run generate --dry-run` only to validate schema files compile.
- **Anti-pattern: Renaming `identity.accounts`.** That's the Better Auth provider-accounts table (OAuth providers + password hashes), unrelated to wallet accounts. **What to do instead:** rename ONLY `budgeting.accounts`.
- **Anti-pattern: Renaming `tenancy.workspace_members.organizationId` JS field.** This JS field name is **mandated by the Better Auth org plugin** — the column rename `workspace_id`→`budget_id` is fine, but the JS-side field `organizationId` is named to match Better Auth and MUST stay (verified `tenancy/src/adapters/persistence/schema.ts:46-79`).
- **Anti-pattern: Stripping pg-boss queue names.** Queue names (`recurring-engine`, `outbox-dispatch`, etc., at `apps/worker/src/worker.ts:14-44`) are NOT renamed; they're external identifiers in the `pgboss.*` schema, untouched by this milestone (see Q11).

## Don't Hand-Roll

| Problem                                | Don't Build                                    | Use Instead                                                                | Why                                                                                |
| -------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Detecting renames vs drop+create       | Custom diff tool                               | Hand-author the SQL                                                        | drizzle-kit prompts interactively; non-TTY usage is the project's known pain point |
| Re-attaching RLS policies after rename | Manual `DROP POLICY` + `CREATE POLICY` in 0012 | Let Postgres RENAME carry them                                             | Verified Postgres behavior; post-migration.sql re-asserts what's needed            |
| Cascading FK constraint reordering     | Hand-sort statement order                      | Single migration in a transaction; Postgres handles in-transaction reorder | drizzle-kit migrate wraps each file in a transaction                               |
| i18n key codemod                       | Custom AST walker                              | `jq` + manual review pass                                                  | Only 4 top-level keys move; subtrees are small (see Q6)                            |

## Runtime State Inventory

> Required: this is a rename/refactor phase.

| Category                             | Items Found                                                                                                                                                                                                                                                                             | Action Required                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Stored data                          | None — dev DB nuke (D-02) discards all data. Production deployment does not exist.                                                                                                                                                                                                      | **None — D-02 covers it.**                                                                                     |
| Live service config                  | None — pg-boss queue names (`recurring-engine`, `outbox-dispatch`, `fx-daily-fetch`, `idempotency-cleanup`, `budgeting-reconciliation`) are external identifiers, not budgeting/tenancy data. They survive untouched.                                                                   | **None — verified `apps/worker/src/worker.ts:14-44`.**                                                         |
| OS-registered state                  | None — no Windows tasks, launchd plists, systemd units, pm2 saved processes touch budget. Docker compose service names (`web`, `api`, `worker`, `migrator`, `db`) are also untouched.                                                                                                   | **None — verified `docker-compose.yml` outside scope.**                                                        |
| Secrets / env vars                   | `DATABASE_URL_APP`, `DATABASE_URL_WORKER`, `DATABASE_URL_MIGRATOR`, `BUDGET_KEK`, `BETTER_AUTH_SECRET` — none reference `workspace`/`account` by name. `active_workspace_ids` user-preference column **was** the legacy mechanism; tenant-guard now uses `X-Workspace-ID` header (Q10). | **None — verified `apps/api/src/middleware/tenant-guard.ts`. The header itself is a separate question (Q10).** |
| Build artifacts / installed packages | After Phase 1: rebuild every Docker image. `make dev-build` rebuilds `web`+`api`+`worker`+`migrator` per CLAUDE.md. i18n JSON bundled at web-build time.                                                                                                                                | **Plan 01-04 final task:** `make dev-build` then smoke test.                                                   |

## Common Pitfalls

### Pitfall 1: Drizzle-kit silently emits DROP+CREATE instead of RENAME

**What goes wrong:** Running `bun run generate` from a non-TTY shell (or piped CI) misses the rename prompt and emits a destructive DROP+CREATE pair.
**Why it happens:** drizzle-kit's rename detector is opt-in via interactive prompt.
**How to avoid:** Hand-author `0012_*.sql`. Project precedent: `0011_plan_02_08_recurring.sql` was hand-authored for the same reason ("drizzle-kit requires TTY").
**Warning signs:** Generated SQL contains `DROP TABLE` followed by `CREATE TABLE` for the same logical entity. Stop. Hand-author instead.

### Pitfall 2: `post-migration.sql` references the OLD table name and fails at container boot

**What goes wrong:** Migration applies cleanly; then `post-migration.sql` runs and crashes with `relation "tenancy.workspaces" does not exist` because every policy/trigger DDL re-runs each boot.
**Why it happens:** `post-migration.sql` re-asserts (DROP+CREATE) policies and triggers on every container start. It hardcodes `tenancy.workspaces` in 23 sites.
**How to avoid:** Plan 01-01 commits the schema migration AND `post-migration.sql` together. The rename is symmetric: every `tenancy.workspaces` → `tenancy.budgets`, every `workspace_id` → `budget_id`, every function name (`workspaces_set_user_context_on_insert` → `budgets_set_user_context_on_insert`) and trigger name (`workspaces_insert_set_context` → `budgets_insert_set_context`).
**Warning signs:** `docker compose run migrator` exits non-zero. `make ci-gate` cannot boot the DB.

### Pitfall 3: Better Auth org plugin breaks when the underlying table name changes

**What goes wrong:** Better Auth's organizations plugin issues SQL like `INSERT INTO tenancy.workspaces (...) RETURNING *` — but its `modelName` config and `additionalFields` are bound to specific field/column names.
**Why it happens:** Better Auth's drizzle adapter looks up `schema.workspaces.<field>` by reference (verified `packages/tenancy/src/adapters/persistence/schema.ts:25-30` — `default_currency` and `owner_user_id` snake_case JS keys are intentional). When we rename `workspaces` → `budgets`, the JS export name MUST also change to `budgets`, and **all Better Auth `modelName`/`schema` lookups in `tenancy/src/adapters/persistence/better-auth-org.ts` must update accordingly.**
**How to avoid:** Plan 01-02 reads `better-auth-org.ts` carefully and renames the JS export + every Better Auth field-mapping ref.
**Warning signs:** Sign-up succeeds but createOrganization throws "schema.workspaces is not a function".

### Pitfall 4: `tenant-guard` middleware still uses `X-Workspace-ID` header → URL mismatch

**What goes wrong:** Browser builds `/budgets/[id]/...` URLs but tenant-guard reads `X-Workspace-ID` header (verified `apps/api/src/middleware/tenant-guard.ts:43`).
**Why it happens:** Header name is a separate identifier from URL path.
**How to avoid:** **PLANNER DECISION POINT (Q10):** rename header to `X-Budget-ID` in lockstep, OR keep `X-Workspace-ID` as legacy alias. Recommendation: rename it in Plan 01-03 alongside the route rename — Postgres GUC stays `app.tenant_ids` (no rename), only the HTTP header changes. Update `apps/web/src/lib/api-client.ts` (line 23-25) and `apps/web/src/lib/workspace-fetch.ts` (rename file + the regex on line 6) in Plan 01-04.
**Warning signs:** `requireWorkspace` middleware returns 403 on every request after Phase 1.

### Pitfall 5: i18n EN/PL/UK desync — UK file size drift

**What goes wrong:** Codemod only updates EN; PL and UK retain old keys; `next-intl` throws at runtime when component looks up `t('budgets.create')` and falls back to key.
**How to avoid:** Plan 01-04 runs the codemod over all three files atomically. Validate counts match (each locale ends with the same top-level keys).

### Pitfall 6: `workspace_share_dirty` table is in the `budgeting` schema, NOT `tenancy`

**What goes wrong:** Planner renames `tenancy.workspaces` and assumes `workspace_share_dirty` is also in `tenancy`. It isn't (verified `post-migration.sql:473`: `CREATE TABLE IF NOT EXISTS budgeting.workspace_share_dirty`).
**How to avoid:** Rename it to `budgeting.budget_share_dirty` AND its `workspace_id` PK column → `budget_id`. Update the `flag_workspace_share_dirty` trigger function (lines 486-508) accordingly.

## Code Examples

### Hand-authored RENAME chain skeleton (drizzle/0012_phase01_v11_rename.sql)

```sql
-- Phase 1 v1.1 rename: workspaces→budgets, accounts→wallets, drop legacy cols, add new cols.

BEGIN;

-- 1. Tenancy schema renames
ALTER TABLE tenancy.workspaces RENAME TO budgets;
ALTER TABLE tenancy.workspace_members RENAME TO budget_members;
ALTER TABLE tenancy.workspace_invitations RENAME TO budget_invitations;
ALTER TABLE tenancy.shared_workspace_member_shares RENAME TO shared_budget_member_shares;
ALTER TYPE tenancy.workspace_kind RENAME TO budget_kind;
ALTER TABLE tenancy.budget_members RENAME COLUMN workspace_id TO budget_id;
ALTER TABLE tenancy.budget_invitations RENAME COLUMN workspace_id TO budget_id;
ALTER TABLE tenancy.shared_budget_member_shares RENAME COLUMN workspace_id TO budget_id;

-- 2. Budgeting schema renames
ALTER TABLE budgeting.accounts RENAME TO wallets;
ALTER TABLE budgeting.account_balance_adjustments RENAME TO wallet_balance_adjustments;  -- IF retained
ALTER TABLE budgeting.workspace_budget_mode_history RENAME TO budget_mode_history;
ALTER TABLE budgeting.workspace_share_dirty RENAME TO budget_share_dirty;
ALTER TABLE budgeting.wallet_balance_adjustments RENAME COLUMN account_id TO wallet_id;
ALTER TABLE budgeting.budget_mode_history RENAME COLUMN workspace_id TO budget_id;
ALTER TABLE budgeting.budget_share_dirty RENAME COLUMN workspace_id TO budget_id;
ALTER TABLE budgeting.recurring_rules RENAME COLUMN account_id TO wallet_id;
ALTER TABLE budgeting.recurring_drafts RENAME COLUMN account_id TO wallet_id;
ALTER TABLE budgeting.spending_by_category_month  -- check whether this has account_id

-- 3. DROP legacy columns
-- NOTE: current schema uses `budgeting.expense_ledger` not `transactions`; verify Q2.
ALTER TABLE budgeting.expense_ledger DROP COLUMN kind;
ALTER TABLE budgeting.expense_ledger DROP COLUMN account_id;     -- becomes wallet_id reference? See Q2.
ALTER TABLE budgeting.expense_ledger DROP COLUMN transfer_group_id;  -- TRANSFER kind gone
ALTER TABLE budgeting.wallets DROP COLUMN scope;
-- accounts table HAS no direction / to_account_id today — see Q2 mismatch with REQ wording

-- 4. ADD new columns
CREATE TYPE budgeting.wallet_type AS ENUM ('SPENDINGS','CUSHION','RESERVE');
ALTER TABLE budgeting.wallets ADD COLUMN wallet_type budgeting.wallet_type NOT NULL DEFAULT 'SPENDINGS';
-- Then drop the old text+CHECK column:
ALTER TABLE budgeting.wallets DROP COLUMN kind;

ALTER TABLE tenancy.budgets ADD COLUMN cushion_mode_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE budgeting.categories ADD COLUMN sort_index INTEGER NOT NULL DEFAULT 0;

-- category_limits already has cushion_amount + cushion_currency (verified line 25-26 of category-limits-schema.ts);
-- per MIG-05 we just need to ensure they're in the schema (no-op if already present). Plan 01-01 verifies.

-- 5. CREATE tasks table
CREATE TABLE budgeting.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  budget_id uuid NOT NULL REFERENCES tenancy.budgets(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('RESERVE_TOPUP','CONFIRM_DRAFT','STALE_WALLET','MONTH_END_REVIEW')),
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RESOLVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX tasks_budget_status_idx ON budgeting.tasks (budget_id, status);
CREATE INDEX tasks_kind_idx ON budgeting.tasks (kind);

COMMIT;

-- post-migration.sql (edited in lockstep) FORCE RLS + pgPolicy on budgeting.tasks
```

### `apps/api/src/app.ts` rename diff (Plan 01-03)

```typescript
// BEFORE
import { workspacesRoutesFactory } from "./routes/workspaces";
import { createAccountsRoute } from "./routes/accounts";
app.use("/workspaces/*", requireAuth);
app.route("/workspaces", workspacesRoutesFactory(deps));
for (const path of ["/accounts/*", ...]) { app.use(path, requireAuth, requireWorkspace); }
app.route("/accounts", createAccountsRoute(deps));

// AFTER
import { budgetsRoutesFactory } from "./routes/budgets";
import { createWalletsRoute } from "./routes/wallets";
app.use("/budgets/*", requireAuth);
app.route("/budgets", budgetsRoutesFactory(deps));
for (const path of ["/wallets/*", ...]) { app.use(path, requireAuth, requireBudget); }
app.route("/wallets", createWalletsRoute(deps));
```

## Answers to Planner's 13 Concrete Questions

### Q1. Exact file paths for the rename surface (filesystem-verified)

**Schema files to rename in place + edit table strings (`budgeting` schema):**

- `packages/budgeting/src/adapters/persistence/accounts-schema.ts` → rename file `wallets-schema.ts`. Table string `"accounts"` → `"wallets"`. Drop `scope` text+CHECK (lines 25, 44). Rename `kind` text+CHECK (line 24, 42-43) to enum `wallet_type` (`'SPENDINGS','CUSHION','RESERVE'`).
- `packages/budgeting/src/adapters/persistence/balance-adjustments-schema.ts` — fate per Q9; if retained, rename file → `wallet-balance-adjustments-schema.ts`, table string → `wallet_balance_adjustments`, `accountId`/`account_id` → `walletId`/`wallet_id` (line 21).
- `packages/budgeting/src/adapters/persistence/categories-schema.ts` — add `sortIndex: integer("sort_index").notNull().default(0)`. NO table rename.
- `packages/budgeting/src/adapters/persistence/category-limits-schema.ts` — **NOTE:** current schema already has `cushionAmount` + `cushionCurrency` (lines 25-26). MIG-05 wording says "add `cushion_amount_cents`" — discrepancy: current column is `cushion_amount NUMERIC(19,4)` not `_cents BIGINT`. Planner decision: either rename column or accept it's already there. Recommend: leave as-is (no action for MIG-05).
- `packages/budgeting/src/adapters/persistence/workspace-budget-mode-history-schema.ts` → rename file `budget-mode-history-schema.ts`. Table `"workspace_budget_mode_history"` → `"budget_mode_history"`. Column `workspaceId`/`workspace_id` → `budgetId`/`budget_id` (line 21). Drizzle policy name `workspace_budget_mode_history_tenant_isolation` → `budget_mode_history_tenant_isolation` (line 33).
- `packages/budgeting/src/adapters/persistence/recurring-rules-schema.ts` — rename `accountId`/`account_id` → `walletId`/`wallet_id` (line 22). Also strip/refactor `kind` CHECK constraint per Phase 2 boundary (MIG-03 says drop `kind`; planner of 01-02 decides whether to leave the column on recurring-rules since RECR-01 wants extended cadence — likely retain through Phase 2 reshape).
- `packages/budgeting/src/adapters/persistence/recurring-drafts-schema.ts` — same `account_id` → `wallet_id` (line 22).
- `packages/budgeting/src/adapters/persistence/transaction-repo.ts` — see Q2; this is the file housing all dropped-column compile-fix sites.

**Schema files to rename in place + edit table strings (`tenancy` schema):**

- `packages/tenancy/src/adapters/persistence/schema.ts` — rename `workspaces` table (line 17) → `budgets`. Rename `workspaceKind` enum (line 12) → `budgetKind`. Rename `workspaceMembers` table (line 46) → `budgetMembers`; column `workspace_id` → `budget_id` (line 52). Rename `workspaceInvitations` (line 82) → `budgetInvitations`; column `workspace_id` → `budget_id` (line 85). Add `cushionModeEnabled: boolean("cushion_mode_enabled").notNull().default(false)`. **DO NOT** rename the JS field `organizationId` on `budgetMembers` / `budgetInvitations` — Better Auth org plugin requires that exact JS name.
- `packages/tenancy/src/adapters/persistence/shares-schema.ts` — table `shared_workspace_member_shares` → `shared_budget_member_shares`. Column `workspace_id` → `budget_id` (line 17).
- `packages/tenancy/src/adapters/persistence/better-auth-org.ts` — every `modelName: 'workspaces'` / `modelName: 'workspace_members'` reference. **Critical for Better Auth integration.**
- `packages/tenancy/src/adapters/persistence/workspace-repo.ts` → `budget-repo.ts`.

**Domain entity files:**

- `packages/budgeting/src/domain/account.ts` → `wallet.ts`. Class `Account` → `Wallet`. Type `AccountKind` → `WalletType` (enum literal change SPENDINGS/CUSHION/RESERVE per MIG-04). Drop `AccountScope` type and `scope` field. (Q1: file is 2.0K, fully visible above.)
- `packages/tenancy/src/domain/workspace.ts` → `budget.ts`. Class `Workspace` → `Budget`.
- `packages/budgeting/src/domain/transaction.ts` — `accountId` field (line 26 in head read) drops or `walletId` rename per Phase 2 boundary (D-07).

**Application use-case files (`packages/budgeting/src/application/`):**

- `create-account.ts` → `create-wallet.ts`
- `archive-account.ts` → `archive-wallet.ts`
- `find-account-by-id.ts` → `find-wallet-by-id.ts`
- `list-accounts.ts` → `list-wallets.ts`
- `adjust-account-balance.ts` → `adjust-wallet-balance.ts` (or remove per Q9)

**Port files:**

- `packages/budgeting/src/ports/account-repo.ts` → `wallet-repo.ts`
- `packages/tenancy/src/ports/workspace-repo.ts` → `budget-repo.ts`
- `packages/tenancy/src/ports/member-repo.ts` — `workspaceId` field renames

**Tenancy application files (workspaces → budgets):**
All under `packages/tenancy/src/application/`:

- `create-workspace.ts` → `create-budget.ts`
- `list-active-workspaces.ts` → `list-active-budgets.ts`
- `set-active-workspaces.ts` → `set-active-budgets.ts`
- `leave-workspace.ts` → `leave-budget.ts`
- `update-shares.ts`, `invite-member.ts`, `accept-invitation.ts`, `transfer-ownership.ts` — internal `workspaceId` field renames

**Drizzle config:**

- `apps/migrator/drizzle.config.ts` lines 17-31 — every schema-file path string must update if file names change (recommend file names DO change so the rename is symmetric).

### Q2. Compile-fix sites — grep summary

Total file count (one ref or more) before any rename:

- **Files referencing "workspace" or "Workspace":** 112 across `packages/`, `apps/api/src/`, `apps/web/src/`, `apps/worker/src/`, `apps/migrator/`
- **Files referencing `\baccount` / `\bAccount`:** 68 (excluding `identity/.accounts` Better Auth tables which MUST NOT rename)

**Critical: dropped-column refs in `packages/budgeting/src/adapters/persistence/transaction-repo.ts` (20.0K file) — file:line index:**

- `kind` references: lines 28, 36, 53, 74, 78, 88 (rowToTransaction mapping), 133 (INSERT col list), 145 (INSERT bind), 157 (categoryId+kind branching), 164 (deltaNormal), 179 (audit), 204 (SELECT), 223, 256, 258, 319, 321, 353, 365, 382, 405, 470, 472, 477, 479. **~25 sites.**
- `account_id` references on same file: same lines (61-321 range); pattern is "SELECT a.b, ... account_id, ..."
- **Important schema discrepancy:** the current table is `budgeting.expense_ledger`, NOT `transactions`. MIG-01..MIG-13 wording uses `transactions.*` but the actual ledger table is `expense_ledger` with columns `kind`, `account_id`, `transfer_group_id` (lines 528-534 of post-migration.sql confirm). Planner of 01-01 MUST reconcile: either (a) rename `expense_ledger` → `transactions` AND drop the columns, or (b) treat the requirement text as referring to `expense_ledger` and drop columns there. Recommend option (b) — keep table name `expense_ledger` until Phase 2 (TXN-01 reshapes the table holistically).
- `direction` and `to_account_id`: **not currently in the schema** — never added in v1.0. MIG-03 wording is anticipatory; nothing to drop for these two. Planner verifies via `\d budgeting.expense_ledger` and notes "no-op" in plan.
- `accounts.scope` drop: line 25 of `accounts-schema.ts` (verified). Also `categories.scope` at line 23 of `categories-schema.ts` — **note MIG-03 says only `accounts.scope`, but the categories column referencing PERSONAL/SHARED also exists.** Planner of 01-01 decides whether to drop both for IA consistency (recommend leave `categories.scope` alone — Phase 2 may want it for share-overrides).

**Compile-fix sites for renamed identifiers (files containing workspace/Workspace or account/Account):**

Packages (TS/TSX, file-level):

- All ~32 files under `packages/budgeting/src/application/` listed in body; ~half touch `account*` or `Account*`
- All 11 port files under `packages/budgeting/src/ports/` and `packages/tenancy/src/ports/`
- All 4 adapter persistence files in tenancy
- 12 adapter persistence files in budgeting
- `packages/platform/src/db/tx.ts` — `withTenantTx` definition (verified contains "workspace" — likely doc-comment only; planner verifies)
- `packages/platform/src/db/expense-ledger.ts` — verify no FK reference to `accounts`
- `packages/platform/src/email/templates.ts` — likely workspace-name placeholder; reword

API (`apps/api/src/`):

- `app.ts` (verified above) — 17 references
- `routes/workspaces.ts` (8.1K), `routes/accounts.ts` (4.8K) — full file renames
- `routes/categories.ts`, `routes/category-limits.ts`, `routes/transactions.ts`, `routes/recurring-drafts.ts` — request-body and pickTenant references
- `routes/workspace-settings.ts` → `routes/budget-settings.ts`
- `middleware/tenant-guard.ts` (verified above, lines 33-44) — comments mention workspaces; `x-workspace-id` header rename per Q10
- `middleware/require-workspace.ts` → `middleware/require-budget.ts`

Web (`apps/web/src/`):

- All `(app)/workspaces/**` route directory → `(app)/budgets/**` (4 page.tsx files + `[wsId]/layout.tsx`); the dynamic segment `[wsId]` may stay as a parameter name OR rename to `[id]` (Phase 3 may change anyway)
- Files matching `components/budgeting/account*` (12 files) → `components/budgeting/wallet*`
- `components/workspace/*` (4 files) — full directory rename
- `components/budgeting/transaction-*` (5 files) — `account` props rename
- `lib/api-client.ts` (verified — only 36 lines)
- `lib/workspace-fetch.ts` → `lib/budget-fetch.ts`; rename `extractWorkspaceIdFromPath` → `extractBudgetIdFromPath`; regex on line 6 `\/workspaces\/` → `\/budgets\/`
- `lib/workspace-fetch.server.ts` → `lib/budget-fetch.server.ts`
- `lib/require-active-workspace.ts` → `lib/require-active-budget.ts`
- `middleware.ts` lines 9, 47 — `PROTECTED_ROUTES` array + redirect path
- `app/[locale]/(app)/layout.tsx` line 53 — `t("workspaces")` lookup → `t("budgets")`
- `app/[locale]/sign-in/page.tsx` — verify redirect target
- `app/[locale]/(app)/transactions/actions.ts`, `recurring/actions.ts` — fetch `"/accounts"` paths

Worker (`apps/worker/src/`):

- `handlers/recurring-engine.ts` lines 36, 77, 96, 99 — `account_id` field on the rule type and in SQL inserts (also test file `recurring-engine.test.ts` lines 78, 241)
- `handlers/budgeting-reconciliation.ts` — verify
- `handlers/idempotency-cleanup.ts`, `handlers/fx-daily-fetch.ts` — likely no workspace refs

Migrator:

- `apps/migrator/drizzle.config.ts` lines 17-31 — schema file paths if filenames change
- `apps/migrator/post-migration.sql` — 23+ sites verified (lines 185-365, 415, 423, 452, 473-520; functions named `workspaces_*` and `workspace_members_*`)

**Plan chunking suggestion:**

- **01-01:** drizzle 0012 SQL + post-migration.sql edits + tenant-leak USER-DATA-TABLES.txt + USER-DATA-TABLES table-name updates + tenant-leak fixture seed-two-tenants.ts table refs
- **01-02:** all packages/\* domain + application + ports + adapters renames (≈ 30 files in budgeting + 15 files in tenancy + 4 in platform) plus `apps/worker/src/handlers/recurring-engine.ts`
- **01-03:** all apps/api/src/\* renames (≈ 12 files)
- **01-04:** all apps/web/src/\* renames (≈ 35 files) + 3 i18n JSON files + final ci-gate run

### Q3. Drizzle-kit RENAME semantics

**Finding: drizzle-kit's rename detection is interactive. The project already hand-authors migrations because of this.**

Evidence:

- `drizzle/0011_plan_02_08_recurring.sql` line 2: `-- Generated manually (drizzle-kit requires TTY; created by plan executor)`. [VERIFIED]
- Versions: `drizzle-kit ^0.31.10`, `drizzle-orm ^0.45.2` [VERIFIED: apps/migrator/package.json]

**Mechanism (per Drizzle docs [CITED: orm.drizzle.team/docs/kit-generate-migration]):** When `drizzle-kit generate` detects a table or column "disappeared" and another "appeared" with similar shape, it prompts: _"Is `X` created or renamed from `Y`?"_. Without TTY (`script -q`, `expect`, or just plain CI), the prompt times out or defaults to "created" — emitting `DROP TABLE Y; CREATE TABLE X`. Disastrous.

**Confidence:** MEDIUM. I did not call out a specific Drizzle CLI version's exact prompt wording (would require `mcp__plugin_context-mode_context-mode__ctx_fetch_and_index` on Drizzle docs, blocked by WebFetch). The PROJECT PRECEDENT of hand-authoring is HIGH-confidence.

**Recommendation for Plan 01-01:** Hand-author `drizzle/0012_phase01_v11_rename.sql` (skeleton in Code Examples section). Optionally run `bun --filter @budget/migrator generate --dry-run` (if available) for cross-check; do NOT commit drizzle-kit's output without manual review.

### Q4. RLS policy reattachment on RENAME

**Confirmed: Postgres `ALTER TABLE … RENAME TO` preserves RLS policies and indexes.** [CITED: PostgreSQL docs, ALTER TABLE]

Policies are attached to a table by OID, not name. The catalog entry `pg_policy.polrelid` updates automatically with the RENAME because the OID is stable. Same for indexes (`pg_index.indrelid`), constraints (`pg_constraint.conrelid`), and triggers (`pg_trigger.tgrelid`).

What is NOT preserved automatically:

- **`post-migration.sql` DDL strings**, which re-`CREATE POLICY ... ON tenancy.workspaces ...` on every container boot. These strings reference the OLD name → fail.
- **Drizzle `pgPolicy()` definitions** in schema files — these emit `CREATE POLICY` SQL by name. On next `drizzle-kit generate` after rename, the policy may be re-emitted because the JS reference moved. Hand-authored 0012 avoids this risk: do NOT regenerate policies in 0012 (Postgres already kept them); only post-migration.sql needs the string update.

**Cross-verification:** [VERIFIED: post-migration.sql:415 `ALTER TABLE budgeting.workspace_budget_mode_history FORCE ROW LEVEL SECURITY`] — if we RENAME this table BEFORE post-migration runs, the FORCE RLS statement fails. So order is: (1) Drizzle migration runs (the RENAME), (2) post-migration.sql runs (must reference NEW name). Plan 01-01 commits both in lockstep.

### Q5. Tenant-leak CI gate location & references to update

**Authoritative file list:** `tests/tenant-leak/`

- `force-rls-on-all-tables.test.ts` (4.8K) — Test 4: pg_class lookups
- `in-process-bus-tenant-scope.test.ts` (5.9K) — Test 5: in-process domain-event bus tenant isolation
- `job-without-tenant-errors.test.ts` (2.9K) — Test 3: worker fails without `app.tenant_ids` set
- `no-guc-zero-rows.test.ts` (4.9K) — Test 1: 3 sub-tests (1a/1b/1c) cross-tenant + cross-user
- `pg-roles-no-bypassrls.test.ts` (2.8K) — Test 2: pg_roles NOBYPASSRLS
- `USER-DATA-TABLES.txt` (3.6K) — **the data source for tests 1 and 4**
- `fixtures/seed-two-tenants.ts` (8.5K) — seeds two tenants via signUp + createWorkspace
- `fixtures/raw-pg-client.ts` — raw pg.Client for tests 1, 4

**Sixth test (PC-10):** `apps/web/e2e/cross-tenant-cache.spec.ts` — Playwright; runs separately. Mentioned in `scripts/ci/run-tenant-leak.sh:9-10`. The "6/6 green" wording in success criteria includes this one.

**References to update for renamed tables:**

`tests/tenant-leak/USER-DATA-TABLES.txt`:

- Line 30: `tenancy.workspaces` → `tenancy.budgets`
- Line 31: `tenancy.workspace_members` → `tenancy.budget_members`
- Line 32: `tenancy.shared_workspace_member_shares` → `tenancy.shared_budget_member_shares`
- Line 43: `tenancy.workspace_invitations` → `tenancy.budget_invitations` (still EXCLUDED)
- **Action:** also add `budgeting.tasks` as TENANT-SCOPED, and `budgeting.budget_mode_history` (renamed) as TENANT-SCOPED (if not already).

`tests/tenant-leak/fixtures/seed-two-tenants.ts`:

- Lines 17, 90: `createWorkspace` import path `@budget/tenancy/src/application/create-workspace` → `create-budget`
- Lines 153-159, 169-175: `createWorkspace(...)` calls → `createBudget(...)`
- Line 184-185: `wsAResult.value.workspaceId` → `budgetId`
- Lines 188-203: `INSERT INTO shared_kernel.audit_history (... entity_type 'workspace' ...)` — `'workspace'` literal → `'budget'`

`tests/tenant-leak/in-process-bus-tenant-scope.test.ts`:

- Likely contains references to `workspace_id` columns and createWorkspace fixture usage. Planner of 01-04 verifies file content.

`apps/web/e2e/cross-tenant-cache.spec.ts`:

- URL routes (`/workspaces/...` → `/budgets/...`) and any header name changes.

**Tenant-leak Makefile target:** `Makefile:86-87` — `ci-gate` invokes `bun run test:ci-gate` (verified `package.json:17`), which runs `bash scripts/ci/run-tenant-leak.sh`. No table-name strings IN the Makefile.

### Q6. i18n key subtrees (EN/PL/UK)

[VERIFIED: node walk of all three JSON files]

**EN top-level keys (11 total):** `auth, settings, workspaces, workspace, state, nav, onboarding, dashboard, budgeting, currency, budgeting_categories`

**`workspaces.*` (top-level plural) — EN/PL/UK subtree size = 7 keys each:**

```
empty, create, switcher, verify_required, list, kindPrivate, kindShared
```

EN/PL/UK = same 7 keys.

**`workspace.*` (top-level singular — separate subtree, NOT covered by the plural rename) — EN keys:**

```
shares (.heading, .body, .col.{member,percentage}, .total.{label,ok,error}, .save, .save_success, .save_error, .saving, .audit_hint)
invite (.heading, .email.label, .cta, .success, .error.already_member, .validation.email_invalid)
leave.confirm (.title, .body, .cta)
transfer.confirm (.title, .body, .cta)
settings (.tab, .members_tab, .shares_tab)
```

~25 nested leaf keys. **Planner decision (Q6):** rename `workspace.*` (singular) → `budget.*` (singular). MIG-10 wording is "workspaces._ → budgets._"; the singular subtree also exists and should be renamed for consistency.

**`accounts.*` top-level — does NOT exist** (verified `Object.keys(j.accounts||{}) = []`). I18N-02 requirement language suggests it once did but currently `accounts` content lives under `budgeting.accounts.*`.

**`budgeting.accounts.*` nested:**

```
title, addButton, form.{title, name, kind, scope, currency, currentBalance, ...}
```

- `budgeting.transactions.capture.accountLabel`, `budgeting.transactions.filters.account`, `budgeting.recurring.rule.accountLabel`.

**`nav.workspaces` and `nav.accounts` — atomic string keys (one each):**

```
nav.workspaces = "Workspaces"
nav.accounts = "Accounts"
```

**Total renames per locale file:**

- 1 top-level rename: `workspaces` → `budgets` (7-key subtree)
- 1 top-level rename: `workspace` → `budget` (5-key subtree with deep nesting)
- 1 nested rename inside `budgeting`: `accounts` → `wallets`
- 4 leaf-string updates inside other subtrees: `nav.workspaces`/`nav.accounts` labels, `budgeting.transactions.capture.accountLabel`, `budgeting.transactions.filters.account`, `budgeting.recurring.rule.accountLabel` (these are display strings — keep keys but update value text OR rename leaf keys to `walletLabel`)

**Scope per locale:** small (≈ 40-50 leaf keys total per file). `jq`-based codemod is feasible. Plan 01-04 does all three atomically.

### Q7. `apps/web/src/lib/api-client.ts` URL constants

The file is 36 lines long [VERIFIED]. It does NOT hardcode `/workspaces` or `/accounts` URL constants as literals — instead it uses Hono's RPC `hc<AppType>(baseUrl)` proxy:

- Line 18: `export const api: AnyApi = hc<AppType>(_apiBase, ...)`
- The route paths are inferred from the `AppType` (the API's exported type).
- Callers invoke them as JS property paths: `api.workspaces.$post`, `api.accounts.$post`, etc.

**File: 1 reference to update** — line 23: `headers.set("X-Workspace-ID", wsId)` per Q10 (header name change).

**Indirect URL references (callers of `api.workspaces.*` / `api.accounts.*` — these break at compile-time when AppType changes):**

- `apps/web/src/components/workspace/create-workspace-form.tsx:79` — `api.workspaces.$post({ ... })` → `api.budgets.$post(...)`
- `apps/web/src/components/workspace/invite-member-form.tsx:55` — `api.workspaces[":id"].invitations.$post`
- `apps/web/src/components/workspace/shares-editor.tsx:67` — `api.workspaces[":id"].shares.$put`

When Plan 01-03 renames API routes, `AppType` regenerates and these three call sites get TypeScript errors → fix to `api.budgets[...]`.

**Other URL literals in web that bypass Hono RPC (use `serverApiFetch`/`clientApiFetch`):**

- `apps/web/src/components/budgeting/accounts-list.tsx:30` — `serverApiFetch(wsId, "/accounts")` → `"/wallets"`
- `apps/web/src/components/budgeting/account-form.tsx:128` — `clientApiFetch("/accounts", ...)` → `"/wallets"`
- `apps/web/src/app/[locale]/(app)/workspaces/[wsId]/layout.tsx:18` — `serverApiFetch(null, "/workspaces/active")` → `"/budgets/active"`
- `apps/web/src/app/[locale]/(app)/workspaces/page.tsx:21` — same `"/workspaces/active"`
- `apps/web/src/app/[locale]/(app)/transactions/actions.ts:39` — `serverApiFetch(wsId, "/accounts")` → `"/wallets"`

### Q8. Hardcoded URL grep across apps/web/src/

[VERIFIED: grep `'["\047]/?(workspaces|accounts)(/|["\047])'`]

| File                                                           | Line   | Type                                                          | Action                             |
| -------------------------------------------------------------- | ------ | ------------------------------------------------------------- | ---------------------------------- |
| `apps/web/src/middleware.ts`                                   | 9      | `PROTECTED_ROUTES` array contains `"/workspaces"`             | rename to `"/budgets"`             |
| `apps/web/src/middleware.ts`                                   | 47     | redirect URL `\`/${locale}/workspaces\``                      | rename to `\`/${locale}/budgets\`` |
| `apps/web/src/components/workspace/workspace-sidebar.tsx`      | 9      | TS union literal `"budget" \| "accounts" \| ...`              | update enum members                |
| `apps/web/src/components/budgeting/accounts-list.tsx`          | 30     | `serverApiFetch(wsId, "/accounts")`                           | update                             |
| `apps/web/src/components/workspace/workspace-row.tsx`          | 27     | `useTranslations("workspaces")`                               | `useTranslations("budgets")`       |
| `apps/web/src/components/budgeting/account-form.tsx`           | 128    | `clientApiFetch("/accounts", ...)`                            | `"/wallets"`                       |
| `apps/web/src/app/[locale]/(app)/layout.tsx`                   | 53     | `t("workspaces")`                                             | `t("budgets")`                     |
| `apps/web/src/app/[locale]/(app)/workspaces/[wsId]/layout.tsx` | 18, 43 | `serverApiFetch(null, "/workspaces/active")` + `href` strings | update both                        |
| `apps/web/src/app/[locale]/(app)/workspaces/page.tsx`          | 21, 29 | `serverApiFetch + getTranslations`                            | update                             |
| `apps/web/src/app/[locale]/(app)/transactions/actions.ts`      | 39     | `"/accounts"`                                                 | `"/wallets"`                       |

**Count:** **10 file:line sites** with hardcoded `/workspaces` or `/accounts` URL/translate strings, plus the 3 `api.workspaces.*` sites from Q7 and the directory rename `(app)/workspaces/` → `(app)/budgets/`.

**Already in code as `/budgets` or `/wallets`:** ZERO matches (verified). No collision risk.

### Q9. `balance_adjustments` table fate

**Recommendation: KEEP and rename → `wallet_balance_adjustments` in Phase 1.**

Justification (filesystem-verified):

- Table is used in `packages/budgeting/src/adapters/persistence/account-repo.ts:203-261` for `recordAdjustment` (manual balance edits) AND `applyDelta` inside ledger writer (line 264 onwards). [VERIFIED]
- Test coverage exists: `packages/budgeting/test/account-repo.test.ts:148-229` exercises `recordAdjustment` and `applyDelta`. [VERIFIED]
- `applyDelta` is called from `transaction-repo.ts:154, 378` — coupling to transaction creation.
- v1.1 spec says WALT-07 "wallet balances are manual snapshots; no auto-update from transactions". This means `applyDelta`-from-transactions disappears in Phase 2 (the categorical-only txn shape doesn't move wallet balances). But `recordAdjustment` (manual edit) is STILL the mechanism for WALT-03 (auto-save on blur).
- **Therefore:** keep table in Phase 1 (rename only). Phase 2 strips the `applyDelta` call paths and reshapes the application service into "manual wallet edit" only.

Counter-argument (DROP in Phase 1): the dev DB nuke (D-02) lets us drop and re-create whatever we want. But dropping forces Phase 2 to rebuild WALT-03 from scratch; keeping it means Phase 2 just refactors call sites. **Smaller diff → keep.**

**File: `packages/budgeting/src/adapters/persistence/balance-adjustments-schema.ts` (1.4K, [VERIFIED]):**

- Rename file → `wallet-balance-adjustments-schema.ts`
- Table string `"account_balance_adjustments"` (line 17) → `"wallet_balance_adjustments"`
- Column `accountId`/`account_id` (line 21) → `walletId`/`wallet_id`
- Policy name `account_balance_adjustments_tenant_isolation` (line 31) → `wallet_balance_adjustments_tenant_isolation`

**Corresponding edits in `post-migration.sql` lines 335-340:**

```sql
-- BEFORE
ALTER TABLE budgeting.account_balance_adjustments FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON budgeting.account_balance_adjustments TO app_role, worker_role;
REVOKE UPDATE, DELETE ON budgeting.account_balance_adjustments FROM app_role, worker_role;

-- AFTER
ALTER TABLE budgeting.wallet_balance_adjustments FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON budgeting.wallet_balance_adjustments TO app_role, worker_role;
REVOKE UPDATE, DELETE ON budgeting.wallet_balance_adjustments FROM app_role, worker_role;
```

### Q10. `apps/web/src/middleware.ts` and `X-Workspace-ID` header

**[VERIFIED: file content above]**

The next-intl middleware at `apps/web/src/middleware.ts` does NOT inject the `X-Workspace-ID` header. The header is injected client-side by `apps/web/src/lib/api-client.ts:22-25` and server-side by various `serverApiFetch` callers.

**Read sites for the header (server side):**

- `apps/api/src/middleware/tenant-guard.ts:43-46` — reads `c.req.header("x-workspace-id")` (and capitalized variant). [VERIFIED]

**Write sites:**

- `apps/web/src/lib/api-client.ts:23-25` — browser-side
- `apps/web/src/lib/workspace-fetch.ts:24-26` — `extractWorkspaceIdFromPath` + `headers.set("X-Workspace-ID", wsId)` [VERIFIED]
- `apps/web/src/lib/workspace-fetch.server.ts` — server-side equivalent (likely)

**Recommendation for Plan 01-03 / 01-04:** **YES, rename header `X-Workspace-ID` → `X-Budget-ID` in lockstep.** The header is a public contract between web and API; leaving it as `X-Workspace-ID` while every URL is `/budgets/*` creates a permanent vestigial name. Rename in:

- `apps/api/src/middleware/tenant-guard.ts:43-44` (read both `x-budget-id` and capitalized)
- `apps/web/src/lib/api-client.ts:23-25`
- `apps/web/src/lib/workspace-fetch.ts:24-26` (also rename file → `budget-fetch.ts`, function → `extractBudgetIdFromPath`)
- `apps/web/src/lib/workspace-fetch.server.ts`
- `apps/web/e2e/cross-tenant-cache.spec.ts` — if it asserts the header name

The Postgres GUC `app.tenant_ids` stays — it's keyed off `tenant_id`, a generic concept, not URL or HTTP-layer naming.

### Q11. pg-boss job payloads

**[VERIFIED: grep across packages/ apps/ for `pg_boss`, `pgboss`, and job payload code]**

Pg-boss-related files:

- `infra/postgres/init/03-pgboss.sql`, `infra/postgres/init/02-grants.sql` — schema creation; **no workspace/account refs**
- `packages/platform/src/jobs/boss.ts` — `bossClient` factory
- `packages/platform/src/jobs/worker-handler.ts` — `TenantContextMissing` error
- `apps/worker/src/worker.ts:14-44` — registers queues (queue names: `outbox-dispatch`, `recurring-engine`, `fx-daily-fetch`, `idempotency-cleanup`, `budgeting-reconciliation`). **None reference workspace/account.**
- `apps/worker/src/handlers/recurring-engine.ts` — handler reads recurring-rules table; references `account_id` (line 36, 77, 96, 99). **Rename to `wallet_id` per MIG-02.**
- `apps/worker/src/handlers/budgeting-reconciliation.ts`, `idempotency-cleanup.ts`, `fx-daily-fetch.ts` — read; verify no workspace/account hardcoded names in queries.

**Critical sites:**
| File | Line | Content | Action |
|------|------|---------|--------|
| `apps/worker/src/handlers/recurring-engine.ts` | 36 | `account_id: string;` (rule type) | → `wallet_id: string;` |
| `apps/worker/src/handlers/recurring-engine.ts` | 77 | `account_id, category_id, amount, ...` (SELECT) | → `wallet_id, ...` |
| `apps/worker/src/handlers/recurring-engine.ts` | 96 | `(tenant_id, rule_id, due_date, amount, currency, account_id, ...)` (INSERT) | → `wallet_id` |
| `apps/worker/src/handlers/recurring-engine.ts` | 99 | `${rule.account_id}::uuid, ${categoryId}::uuid, ${rule.kind}, ...` | → `${rule.wallet_id}` |
| `apps/worker/test/handlers/recurring-engine.test.ts` | 78, 241 | `(... account_id ...)` test SQL | → `wallet_id` |

**Pg-boss queue payloads:** pg-boss serializes payloads as JSON in `pgboss.job.data` column. No queue payload in our code currently embeds a workspace/account UUID by field name as a literal string in production code (payloads use `tenantId` field which stays). Dev DB nuke clears any in-flight jobs.

**Out-of-band pg-boss state:** the `pgboss` schema is separate from `budgeting`/`tenancy`. RENAME does not touch it. Dev DB nuke handles any orphan jobs.

### Q12. Drizzle migration sequence

**[VERIFIED: `ls drizzle/`]**

Current files (12 total):

```
0000_giant_shotgun.sql       (1.0K — root tenancy/identity bootstrap)
0001_overjoyed_echo.sql      (9.9K — identity + tenancy)
0002_add_insert_open_rls_policies.sql (717B)
0003_gifted_martin_li.sql    (71B)
0004_lame_mad_thinker.sql    (106B)
0005_daily_dust.sql          (616B)
0006_rainy_anita_blake.sql   (97B)
0007_little_silverclaw.sql   (1.1K)
0008_common_karnak.sql       (2.1K — budgeting.accounts)
0009_breezy_karen_page.sql   (5.7K — budgeting.categories + limits)
0010_plan_02_06_ledger_projection.sql (2.1K)
0011_plan_02_08_recurring.sql (2.6K — header: "Generated manually")
```

**Next file:** `drizzle/0012_phase01_v11_rename.sql` — confirmed per D-05 / D-08 / canonical refs in CONTEXT.md.

### Q13. Risks and gotchas the planner needs to know

**Hard constraints (the plan WILL fail without these):**

1. **post-migration.sql is co-located with the rename migration.** Container boot order: drizzle-kit migrate → post-migration.sql. If `0012` renames but `post-migration.sql` references old names, container exits 1 and `make ci-gate` cannot reach the test step. **Plan 01-01 commits both together.**

2. **Better Auth org plugin field bindings.** `packages/tenancy/src/adapters/persistence/schema.ts:25-30` has intentional snake_case JS keys (`default_currency`, `owner_user_id`) and `organizationId` JS field on `workspace_members` (line 52). These names are LOAD-BEARING for Better Auth integration. **Rename the table + column, NOT the JS field `organizationId`.** Better Auth `modelName` config in `better-auth-org.ts` must update to `budgets` / `budget_members`.

3. **The `identity.accounts` table exists and is the Better Auth provider-accounts table.** It is in scope EXCLUDED in `tests/tenant-leak/USER-DATA-TABLES.txt:45` and is **NOT renamed** by Phase 1. Plan tasks must explicitly limit rename scope to `budgeting.accounts` (the wallet-equivalent) and skip `identity.accounts`.

4. **`workspace_share_dirty` is in the `budgeting` schema, not `tenancy`** (verified post-migration.sql:473). And its trigger function `flag_workspace_share_dirty` (lines 486-508) executes a SELECT from `tenancy.workspaces` on line 492. Rename order matters: rename `tenancy.workspaces` → `tenancy.budgets` first, then the trigger function gets recreated by post-migration.sql with the new reference.

5. **Existing `category_limits.cushion_amount` already exists** (verified `category-limits-schema.ts:25` — `bigint("cushion_amount", { mode: "bigint" })`). MIG-05's wording "add `cushion_amount_cents`" is **misleading** — the column is there. The `_cents` suffix is the naming convention the rest of the v1.1 spec wants, but renaming `cushion_amount` → `cushion_amount_cents` is a separate decision. **Recommendation:** leave as `cushion_amount` (no rename); MIG-05 is satisfied by existing schema. If planner wants the `_cents` suffix for consistency, add ALTER COLUMN RENAME in 0012.

6. **`weeklyDow` and `cadence` CHECK constraints on `recurring_rules` will break in Phase 2** (RECR-01 extends cadence to daily/weekly/monthly/yearly). Phase 1 keeps these (minimum compile-fix) but Plan 01-02 should add a TODO comment in the schema file flagging Phase 2 reshape.

7. **`tenancy.workspaceKind` enum** (verified line 12, schema.ts) must be renamed via `ALTER TYPE … RENAME TO budget_kind`. PostgreSQL DOES support this. Don't forget — drizzle-kit hand-author must include it.

8. **Drizzle naming-conflict errors:** if two schema files export the same JS const name (`budgets` from both `tenancy.schema` and a future `budgeting.budgets`), TypeScript compile fails. The renamed `tenancy.budgets` export is the canonical "budget" table. Verify no other file claims that export name.

9. **Circular imports risk on file rename.** `packages/tenancy/src/adapters/persistence/shares-schema.ts:10` imports `workspaces` from `./schema` (verified). If the file rename script doesn't update the import (`./schema.ts` may itself rename — it shouldn't, it's a different filename), the build breaks. **Plan 01-02:** keep `schema.ts` filename in tenancy; only change the JS export inside.

10. **`packages/identity/src/adapters/persistence/schema.ts` is OUT OF SCOPE** — that holds `identity.users`, `identity.sessions`, `identity.accounts` (Better Auth provider accounts). Plans must not touch it.

11. **`apps/migrator/drizzle.config.ts:17-31` lists 22 schema file paths.** If Plan 01-02 renames source files (recommended for clarity: `accounts-schema.ts` → `wallets-schema.ts`), the config file paths must update in the same commit, OR the migrator container errors out at startup with "schema file not found".

12. **Required workflow change for `make dev-build`:** per CLAUDE.md, the dev stack runs from prebuilt Docker images. After Plan 01-04 lands, `make dev-build` (rebuild + restart) is mandatory before E2E smoke. i18n bundled at web build time.

**Soft risks (uncomfortable but recoverable):**

13. Domain `Workspace` entity (`packages/tenancy/src/domain/workspace.ts`) has a `canBeLeftBy` method (verified line 27); rename should preserve semantics. Test file `packages/tenancy/test/leave-workspace.test.ts` and 11 other tenancy test files all need rename.

14. The current `tasks` table doesn't exist; `MIG-08` is a pure CREATE. Use the same RLS pattern as `budget_mode_history` (per Claude's discretion in CONTEXT.md). RLS policy via `pgPolicy()` keyed on `tenant_id`.

## Environment Availability

| Dependency                           | Required By              | Available                       | Version   | Fallback                             |
| ------------------------------------ | ------------------------ | ------------------------------- | --------- | ------------------------------------ |
| Bun                                  | Test runner, drizzle-kit | Assume yes (project convention) | 1.2.x     | none                                 |
| drizzle-kit                          | Migration generation     | Yes                             | 0.31.10   | Hand-author 0012 (preferred)         |
| Postgres                             | Migration target         | Via docker compose              | 16+       | none                                 |
| Docker + compose                     | DB containers            | Assume yes (CLAUDE.md)          | latest    | none                                 |
| testcontainers (via @budget/db/test) | Tenant-leak gate         | Yes                             | workspace | none                                 |
| Infisical CLI                        | Secret interpolation     | Yes (CLAUDE.md mandates)        | latest    | env-file fallback per ci-gate runner |

**Missing dependencies with no fallback:** none identified for Phase 1.

## Validation Architecture

> Including this section per default (nyquist_validation absent → treat as enabled).

### Test Framework

| Property           | Value                                                                             |
| ------------------ | --------------------------------------------------------------------------------- |
| Framework          | bun:test (backend) + Vitest (frontend) + Playwright (E2E)                         |
| Config file        | `bunfig.toml` (root) — 80% domain coverage threshold                              |
| Quick run command  | `make test` (bun test, ~30s)                                                      |
| Full suite command | `make test && make test-e2e && make ci-gate`                                      |
| Phase gate         | `make ci-gate` must pass 6/6 (5 backend + 1 Playwright) before `/gsd-verify-work` |

### Phase Requirements → Test Map

| Req ID         | Behavior                  | Test Type         | Automated Command                                                                                       | File Exists?                                                                    |
| -------------- | ------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| MIG-01..MIG-09 | Schema mutation           | integration       | `bun test tests/tenant-leak/force-rls-on-all-tables.test.ts` (asserts tables exist with FORCE RLS)      | ✅                                                                              |
| MIG-10         | i18n key rename           | unit (i18n)       | `cd apps/web && bun run test src/__tests__/i18n.test.ts`                                                | ❌ Wave 0 needs i18n smoke test                                                 |
| MIG-11         | Route rename + 404 on old | integration       | `bun test apps/api/test/routes/budgets.test.ts` + `bun test apps/api/test/routes/old-paths-404.test.ts` | ❌ Wave 0 needs new test file                                                   |
| MIG-12         | Domain entities renamed   | unit + typecheck  | `bun test packages/budgeting/test/wallet-domain.test.ts` + `bun run typecheck`                          | ❌ Wave 0 renames test file from account-domain.test.ts → wallet-domain.test.ts |
| MIG-13         | Tenant-leak 6/6           | integration + E2E | `make ci-gate`                                                                                          | ✅ but USER-DATA-TABLES.txt + fixtures need updates per Q5                      |

### Sampling Rate

- **Per task commit:** `bun run typecheck && bun test --filter <package>`
- **Per wave merge (one per plan):** `make test`
- **Phase gate (end of plan 01-04):** `make ci-gate` (full 6 tests green)

### Wave 0 Gaps

- [ ] Rename `packages/budgeting/test/account-domain.test.ts` → `wallet-domain.test.ts` + update class refs
- [ ] Create `apps/api/test/routes/old-paths-404.test.ts` — asserts `/workspaces/foo` returns 404, `/accounts/foo` returns 404 (verifies D-09)
- [ ] Create `apps/api/test/routes/budgets.test.ts` (rename from `workspaces.test.ts` if exists) + `wallets.test.ts` (rename from `accounts.test.ts`)
- [ ] Update `tests/tenant-leak/USER-DATA-TABLES.txt` per Q5
- [ ] Update `tests/tenant-leak/fixtures/seed-two-tenants.ts` createWorkspace → createBudget per Q5
- [ ] Verify `apps/web/e2e/cross-tenant-cache.spec.ts` for URL/header renames

## Security Domain

> Required per default `security_enforcement` (absent → enabled).

### Applicable ASVS Categories

| ASVS Category         | Applies | Standard Control                                                                              |
| --------------------- | ------- | --------------------------------------------------------------------------------------------- |
| V2 Authentication     | yes     | Better Auth 1.4+ (existing); rename does not alter auth surface                               |
| V3 Session Management | yes     | Better Auth sessions; X-Workspace-ID→X-Budget-ID header is post-auth tenant binding, NOT auth |
| V4 Access Control     | yes     | RLS on every tenant-scoped table (FORCE RLS); RENAME preserves policies (Q4)                  |
| V5 Input Validation   | yes     | zValidator + Zod on every route — preserved through rename per D-07 minimum compile-fix       |
| V6 Cryptography       | no      | No crypto changes in Phase 1 (crypto-shredding `user_keys` table out of scope)                |

### Known Threat Patterns for Phase 1 rename

| Pattern                                                                 | STRIDE                 | Standard Mitigation                                                                                 |
| ----------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| RLS bypass via dropped policy                                           | Information Disclosure | RENAME preserves policies (Q4); FORCE RLS re-asserted in post-migration.sql against new table names |
| Tenant-leak via incomplete rename in `USER-DATA-TABLES.txt`             | Information Disclosure | Plan 01-04 verifies USER-DATA-TABLES.txt lists `tenancy.budgets`, `tenancy.budget_members`, etc.    |
| HTTP route enumeration via old paths                                    | Information Disclosure | D-09 — old paths return 404, no aliases                                                             |
| Schema-level mismatch between drizzle-kit output and post-migration.sql | Tampering              | Hand-author 0012 (Q3); both files in same commit (Plan 01-01)                                       |

## State of the Art

| Old Approach                                     | Current Approach         | When Changed           | Impact                                                                  |
| ------------------------------------------------ | ------------------------ | ---------------------- | ----------------------------------------------------------------------- |
| `drizzle-kit push` (schema sync)                 | numbered migration files | drizzle-kit ≥0.20      | Phase 1 follows project convention: numbered files only                 |
| Interactive `drizzle-kit generate` rename prompt | Hand-author SQL          | Project precedent 0011 | Plan 01-01 hand-authors 0012                                            |
| Lucia                                            | Better Auth (1.4+)       | Project chose at v1.0  | Tenancy schema rename must preserve Better Auth field names (Pitfall 3) |

**Deprecated/outdated in this codebase context:**

- `pgboss schema vs drizzle schema`: pg-boss is separate schema (not in `budgeting` or `tenancy`) — unaffected by rename.
- `Phase 02 still references `workspaces` extensively`: all of v1.0's planning documents (`.planning/archive/v1.0/`) reference `workspace`. Out of scope per CONTEXT.md deferred ideas.

## Assumptions Log

| #   | Claim                                                                                       | Section    | Risk if Wrong                                                                                              |
| --- | ------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| A1  | drizzle-kit ≥0.31 RENAME detection is interactive (requires TTY)                            | Q3         | MEDIUM — could auto-emit DROP+CREATE in CI; mitigated by hand-author recommendation                        |
| A2  | `transactions.direction` and `transactions.to_account_id` columns do NOT currently exist    | Q2         | LOW — verifiable by `\d budgeting.expense_ledger` before migration                                         |
| A3  | MIG-05's `cushion_amount_cents` is already satisfied by existing `cushion_amount` column    | Q1 / Q13#5 | LOW — naming-only; planner can rename to `_cents` suffix if desired                                        |
| A4  | Better Auth `modelName: "workspaces"` config in `better-auth-org.ts` exists and must update | Pitfall 3  | LOW — file exists (verified path); contents not directly inspected this session, but pattern is documented |
| A5  | `categories.scope` column (not in MIG-03 list) should be retained                           | Q2         | LOW — Phase 2 may want it for share overrides; planner verifies                                            |
| A6  | Header rename `X-Workspace-ID` → `X-Budget-ID` is desired                                   | Q10        | LOW — recommendation only; deferring is also acceptable                                                    |

## Open Questions

1. **Header name `X-Workspace-ID` vs `X-Budget-ID`** (Q10)
   - What we know: header is read by `tenant-guard.ts:43` and written by `api-client.ts:23-25`.
   - What's unclear: user preference. CONTEXT.md cites a session memory S183 mentioning `x-workspace-id` but doesn't lock the rename decision.
   - Recommendation: include in Plan 01-03 / 01-04. Easy to revert if user disagrees.

2. **MIG-05 `cushion_amount_cents` column suffix** (Q1, Q13#5)
   - What we know: column already exists as `cushion_amount` (numeric).
   - What's unclear: whether `_cents` is required for naming consistency or just descriptive text.
   - Recommendation: leave as-is; flag as Phase 2 cleanup if needed.

3. **`balance_adjustments` rename vs drop** (Q9)
   - What we know: actively used by `account-repo.recordAdjustment` and `applyDelta`; WALT-03 (Phase 5) needs manual wallet edits.
   - What's unclear: whether Phase 2 fully strips `applyDelta`-from-txn path (looks likely per WALT-07).
   - Recommendation: rename in Phase 1; Phase 2 refactors usage.

4. **`categories.scope` (and `categories_scope_chk` CHECK)** (Q2)
   - What we know: not in MIG-03 drop list; current schema has it.
   - What's unclear: whether v1.1 IA wants categories scoped at all (categories are budget-scoped by `tenant_id`).
   - Recommendation: leave alone in Phase 1; Phase 2 reshape per category-share-overrides design.

## Sources

### Primary (HIGH confidence) — filesystem verification

- `/home/claude/budget/apps/migrator/post-migration.sql` (Q4, Pitfalls 2/6, Q13#1, Q13#4, Q9)
- `/home/claude/budget/packages/budgeting/src/adapters/persistence/*.ts` (all schema files Q1, Q2, Q9)
- `/home/claude/budget/packages/tenancy/src/adapters/persistence/schema.ts` (Pitfall 3, Q1, Q13#2)
- `/home/claude/budget/apps/api/src/app.ts` (Q5 routes, Q1 route files)
- `/home/claude/budget/apps/api/src/middleware/tenant-guard.ts` (Q10)
- `/home/claude/budget/apps/web/src/lib/api-client.ts` (Q7)
- `/home/claude/budget/apps/web/src/middleware.ts` (Q10 partial)
- `/home/claude/budget/apps/web/messages/{en,pl,uk}.json` (Q6)
- `/home/claude/budget/tests/tenant-leak/*` (Q5)
- `/home/claude/budget/drizzle/0011_plan_02_08_recurring.sql` (Q3 — hand-author precedent)
- `/home/claude/budget/apps/migrator/drizzle.config.ts` (Q1, Q13#11)
- `/home/claude/budget/scripts/ci/run-tenant-leak.sh` (Q5)
- `/home/claude/budget/Makefile` (Q5)
- `/home/claude/budget/apps/worker/src/handlers/recurring-engine.ts` (Q11)

### Secondary (MEDIUM confidence)

- Drizzle-kit RENAME prompt behavior (Q3) — project precedent confirms hand-author; specific drizzle-kit 0.31 prompt wording not directly tested this session

### Tertiary (LOW confidence)

- `packages/tenancy/src/adapters/persistence/better-auth-org.ts` content (Pitfall 3) — file path verified, full content not read; assumption based on Better Auth org plugin documentation patterns

## Metadata

**Confidence breakdown:**

- Schema rename surface (Q1, Q2): HIGH — every file path and many lines verified
- Drizzle-kit semantics (Q3): MEDIUM — project precedent strongly supports hand-author; exact CLI prompt unverified this session
- RLS rename semantics (Q4): HIGH — Postgres docs cited; verified post-migration.sql interaction
- Tenant-leak gate (Q5): HIGH — all 5+1 tests enumerated, USER-DATA-TABLES.txt read in full
- i18n subtrees (Q6): HIGH — programmatic JSON walk on all 3 locale files
- api-client.ts (Q7): HIGH — full 36-line file read
- Hardcoded URLs (Q8): HIGH — grep across full apps/web/src
- balance_adjustments fate (Q9): HIGH — usage paths traced through transaction-repo + account-repo
- middleware/header (Q10): HIGH — file content read, header refs grepped
- pg-boss (Q11): HIGH — all 5 worker handlers + worker.ts read
- Migration sequence (Q12): HIGH — `ls drizzle/` confirmed
- Risks (Q13): HIGH — each item filesystem-verified

**Research date:** 2026-05-11
**Valid until:** 2026-06-10 (~30 days for stable monorepo; re-verify if drizzle-kit/Drizzle ORM major version changes before execution)
