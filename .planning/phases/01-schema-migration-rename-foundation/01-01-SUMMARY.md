---
phase: "01"
plan: "01"
subsystem: "schema-migration"
tags:
  [migration, schema-rename, rls, drizzle, postgres, wallets, budgets, tasks]
dependency_graph:
  requires: []
  provides:
    [
      v1.1-schema-shape,
      tasks-table,
      wallet-type-enum,
      budget-mode-history-rename,
    ]
  affects:
    [
      tenancy.budgets,
      budgeting.wallets,
      budgeting.tasks,
      budgeting.budget_mode_history,
      budgeting.categories,
      budgeting.category_limits,
      budgeting.recurring_rules,
      budgeting.recurring_drafts,
    ]
tech_stack:
  added: [wallet_type ENUM (budgeting schema), budgeting.tasks table]
  patterns:
    [
      conditional-rename DO blocks,
      hand-authored Drizzle migration,
      RLS FORCE on new table,
    ]
key_files:
  created:
    - drizzle/0012_phase01_v11_rename.sql
    - packages/budgeting/src/adapters/persistence/wallets-schema.ts
    - packages/budgeting/src/adapters/persistence/budget-mode-history-schema.ts
    - packages/budgeting/src/adapters/persistence/tasks-schema.ts
    - apps/api/test/schema/v11-shape.test.ts
  modified:
    - drizzle/meta/_journal.json
    - apps/migrator/drizzle.config.ts
    - apps/migrator/post-migration.sql
    - packages/tenancy/src/adapters/persistence/schema.ts
    - packages/tenancy/src/adapters/persistence/shares-schema.ts
    - packages/budgeting/src/adapters/persistence/categories-schema.ts
    - packages/budgeting/src/adapters/persistence/category-limits-schema.ts
    - packages/budgeting/src/adapters/persistence/recurring-rules-schema.ts
    - packages/budgeting/src/adapters/persistence/recurring-drafts-schema.ts
    - packages/budgeting/src/adapters/persistence/balance-adjustments-schema.ts
    - tests/tenant-leak/USER-DATA-TABLES.txt
    - tests/tenant-leak/fixtures/seed-two-tenants.ts
    - tests/tenant-leak/force-rls-on-all-tables.test.ts
  deleted:
    - packages/budgeting/src/adapters/persistence/accounts-schema.ts
    - packages/budgeting/src/adapters/persistence/workspace-budget-mode-history-schema.ts
decisions:
  - "Conditional DO blocks for workspace_share_dirty rename — fresh DB installs skip rename since post-migration.sql creates budget_share_dirty directly"
  - "wallet_type stored as text with CHECK constraint in Drizzle schema (not PG enum type) for easier future ALTER TYPE; migration SQL uses native PG ENUM for DB-level enforcement"
  - "Backward-compat export aliases kept on all renamed Drizzle table refs (workspaces=budgets, accounts=wallets) to avoid cascading compile failures before domain layer rename in 01-02"
  - "tasks table ownership DO block in migration handles postgres-superuser dev installs (migrator cannot see postgres-owned tables via information_schema)"
  - "drizzle-kit TTY limitation requires hand-authored migration; journal entry 0012 registered manually"
metrics:
  duration: "~90 minutes"
  completed: "2026-05-11T19:28:00Z"
  tasks_completed: 8
  files_created: 5
  files_modified: 13
  files_deleted: 2
requirements:
  [
    MIG-01,
    MIG-02,
    MIG-03,
    MIG-04,
    MIG-05,
    MIG-06,
    MIG-07,
    MIG-08,
    MIG-09,
    MIG-13,
  ]
---

# Phase 01 Plan 01: Schema Migration & Rename Foundation Summary

JWT auth with refresh rotation using jose library — **DB schema layer renamed from workspaces/accounts v1.0 model to budgets/wallets v1.1 model; tasks table created with full RLS; 14/14 shape tests green.**

## Tasks Completed

| #   | Task                                                    | Commit      | Status |
| --- | ------------------------------------------------------- | ----------- | ------ |
| 1   | TDD RED: v11-shape tests + USER-DATA-TABLES.txt         | 078d3cb     | Done   |
| 2   | Drizzle schema file edits (rename + new columns)        | 6c783b7     | Done   |
| 3   | Hand-author migration 0012_phase01_v11_rename.sql       | 6c783b7     | Done   |
| 4   | Update post-migration.sql for v1.1 table names          | e229625     | Done   |
| 5   | Retarget seed-two-tenants.ts to createBudget            | e229625     | Done   |
| 6   | Dev DB nuke + replay (migrate + post-migration.sql)     | — (runtime) | Done   |
| 7   | Run v11-shape tests (14/14 green) + tenant-leak partial | — (runtime) | Done   |
| 8   | Commit all tasks                                        | 078d3cb     | Done   |

## What Was Built

**Migration 0012** (`drizzle/0012_phase01_v11_rename.sql`) — 21-step hand-authored migration:

- `tenancy.workspaces → tenancy.budgets` + `cushion_mode_enabled` boolean column
- `tenancy.workspace_members → tenancy.budget_members` (workspace_id → budget_id)
- `tenancy.shared_workspace_member_shares → tenancy.shared_budget_member_shares`
- `tenancy.workspace_invitations → tenancy.budget_invitations`
- `budgeting.accounts → budgeting.wallets`; drop `scope`/`kind`; add `wallet_type` ENUM DEFAULT 'SPENDINGS'
- `budgeting.expense_ledger`: drop `kind`, `account_id`, `to_account_id`, `direction` (conditional DO block)
- `budgeting.categories`: drop `scope`; add `sort_index integer NOT NULL DEFAULT 0`
- `budgeting.category_limits`: add `cushion_amount_cents bigint` (nullable)
- `budgeting.workspace_budget_mode_history → budgeting.budget_mode_history`; rename `workspace_id → budget_id`; recreate check + unique index
- `budgeting.recurring_rules/drafts/account_balance_adjustments`: `account_id → wallet_id`
- Conditional rename of `workspace_share_dirty → budget_share_dirty` (skip on fresh DB)
- Create `budgeting.tasks` (MIG-08): PENDING/RESOLVED lifecycle, 4 task kinds, FORCE RLS policy

**Drizzle Schema Files** — all persistence adapters updated in lockstep with migration:

- `wallets-schema.ts` (renamed from accounts-schema.ts): `walletType text`, no scope/kind
- `budget-mode-history-schema.ts` (renamed): `budgetId uuid`
- `tasks-schema.ts` (new): full table definition with RLS pgPolicy
- Backward-compat aliases: `export const accounts = wallets`, `export const workspaceBudgetModeHistory = budgetModeHistory`, `export const workspaces = budgets`

**post-migration.sql** — all RLS policy names updated; explicit DROP of Postgres-retained old policy names; `budget_share_dirty` created with `budget_id` column; tasks FORCE RLS + GRANT added.

**Tenant-leak CI gate** — USER-DATA-TABLES.txt updated with 6 renamed table entries + 2 new entries (budget_mode_history, tasks); seed-two-tenants.ts updated to call createBudget (ts-expect-error until 01-02).

## Verification Results

**v11-shape tests: 14/14 PASS** — all schema shape assertions green after migration replay.

**force-rls-on-all-tables**: 3/5 tests pass. 2 fail due to `seed-two-tenants.ts` importing `@budget/tenancy/src/application/create-budget` which doesn't exist until Plan 01-02. This is expected interim state — documented below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] tasks table invisible to migrator via information_schema**

- **Found during:** Task 7 (v11-shape tests)
- **Issue:** Migration was applied by postgres superuser in dev; `budgeting.tasks` had owner `postgres`; migrator role cannot see postgres-owned tables via `information_schema.tables`
- **Fix:** Added conditional DO block in migration SQL step 19 to `ALTER TABLE tasks OWNER TO migrator` when owner is postgres; also ran directly on dev DB
- **Files modified:** `drizzle/0012_phase01_v11_rename.sql`
- **Commit:** 6c783b7

**2. [Rule 1 - Bug] workspace_share_dirty rename fails on fresh DB**

- **Found during:** Task 7 (testcontainer force-rls test)
- **Issue:** Migration step 18 had unconditional `ALTER TABLE workspace_share_dirty RENAME TO budget_share_dirty`; on fresh DB this table doesn't exist (created by post-migration.sql, not drizzle)
- **Fix:** Wrapped step 18 in conditional DO block; `post-migration.sql` creates `budget_share_dirty` with `budget_id` column directly
- **Files modified:** `drizzle/0012_phase01_v11_rename.sql`, `apps/migrator/post-migration.sql`
- **Commit:** 6c783b7

**3. [Rule 1 - Bug] Migration not applied in testcontainer**

- **Found during:** Task 7 (force-rls test with `tenancy.budgets does not exist`)
- **Issue:** `drizzle/meta/_journal.json` was missing entry for 0012; Drizzle's `migrate()` skips files not in journal
- **Fix:** Added journal entry `{ idx: 12, tag: "0012_phase01_v11_rename", when: 1747008000000, breakpoints: true }`
- **Files modified:** `drizzle/meta/_journal.json`
- **Commit:** 6c783b7

**4. [Rule 1 - Bug] post-migration.sql conflicted with migration column drops**

- **Found during:** Task 4 analysis
- **Issue:** post-migration.sql Phase-2 block had `ADD COLUMN IF NOT EXISTS account_id` and `kind` on expense_ledger — would re-add dropped columns
- **Fix:** Removed those ADD COLUMN statements; migration 0012 handles drops
- **Files modified:** `apps/migrator/post-migration.sql`
- **Commit:** e229625

### Expected Interim State (Not Deviations)

`no-guc-zero-rows.test.ts` and `in-process-bus-tenant-scope.test.ts` fail because `seed-two-tenants.ts` imports `@budget/tenancy/src/application/create-budget` which Plan 01-02 creates. Task 8 notes explicitly state: "do NOT run full `make ci-gate` until 01-02 ships."

## Known Stubs

None. All schema changes are concrete — no placeholder values or wired-but-empty fields.

## Threat Flags

| Flag                       | File                                | Description                                                                                                 |
| -------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| threat_flag: new-table-rls | drizzle/0012_phase01_v11_rename.sql | `budgeting.tasks` is a new user-data table; FORCE RLS added in migration and verified in post-migration.sql |

## Self-Check: PASSED
