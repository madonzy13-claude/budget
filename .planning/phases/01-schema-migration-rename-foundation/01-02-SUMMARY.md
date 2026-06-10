---
phase: "01"
plan: "02"
subsystem: "domain-rename"
tags:
  ["rename", "wallet", "budget", "category-scope", "mig-12", "mig-03", "mig-04"]
dependency-graph:
  requires: ["01-01"]
  provides:
    [
      "domain-Wallet",
      "domain-Budget",
      "WalletRepo",
      "BudgetRepo",
      "dropped-columns-stripped",
    ]
  affects: ["packages/budgeting", "packages/tenancy", "apps/worker"]
tech-stack:
  added: []
  patterns:
    ["backward-compat-shim", "D-07-minimum-compile-fix", "sql-column-strip"]
key-files:
  created:
    - packages/budgeting/src/domain/wallet.ts
    - packages/budgeting/src/ports/wallet-repo.ts
    - packages/budgeting/src/adapters/persistence/wallet-repo.ts
    - packages/budgeting/src/application/create-wallet.ts
    - packages/budgeting/src/application/archive-wallet.ts
    - packages/budgeting/src/application/list-wallets.ts
    - packages/budgeting/src/application/find-wallet-by-id.ts
    - packages/budgeting/src/application/adjust-wallet-balance.ts
    - packages/tenancy/src/domain/budget.ts
    - packages/tenancy/src/ports/budget-repo.ts
    - packages/tenancy/src/application/create-budget.ts
    - packages/budgeting/test/domain/wallet.test.ts
    - packages/tenancy/test/domain/budget.test.ts
  modified:
    - packages/budgeting/src/domain/account.ts (shim → Wallet)
    - packages/budgeting/src/domain/category.ts (drop scope)
    - packages/budgeting/src/ports/account-repo.ts (shim → WalletRepo)
    - packages/budgeting/src/adapters/persistence/account-repo.ts (shim → DrizzleWalletRepo)
    - packages/budgeting/src/adapters/persistence/category-repo.ts (scope columns dropped)
    - packages/budgeting/src/adapters/persistence/transaction-repo.ts (account_id/kind SQL dropped)
    - packages/budgeting/src/application/create-category.ts (scope removed)
    - packages/budgeting/src/application/list-categories.ts (scope removed from DTO)
    - packages/budgeting/src/application/find-category-by-id.ts (scope removed)
    - packages/budgeting/src/application/rename-category.ts (scope removed)
    - packages/budgeting/src/application/archive-category.ts (scope removed)
    - packages/budgeting/src/contracts/api.ts (WalletDto, walletTypeSchema, CategoryDto no scope)
    - packages/budgeting/src/index.ts (Wallet exports)
    - packages/tenancy/src/domain/workspace.ts (shim → Budget)
    - packages/tenancy/src/ports/workspace-repo.ts (shim → BudgetRepo)
    - packages/tenancy/src/adapters/persistence/workspace-repo.ts (DrizzleBudgetRepo, budget SQL)
    - packages/tenancy/src/adapters/persistence/better-auth-org.ts (budget table names)
    - packages/tenancy/src/application/create-workspace.ts (wraps createBudget)
    - packages/tenancy/src/application/leave-workspace.ts (leaveBudget primary)
    - packages/tenancy/src/application/list-active-workspaces.ts (listActiveBudgets primary)
    - packages/tenancy/src/application/set-active-workspaces.ts (setActiveBudgets primary)
    - packages/tenancy/src/application/update-shares.ts (budgetRepo dual accept)
    - packages/tenancy/src/application/invite-member.ts
    - packages/tenancy/src/application/accept-invitation.ts
    - packages/tenancy/src/contracts/api.ts (BudgetDTO, MemberDTO.budgetId)
    - packages/tenancy/src/contracts/factory.ts (budgetRepo field)
    - packages/tenancy/src/index.ts (Budget exports)
    - apps/worker/src/handlers/recurring-engine.ts (wallet_id, budget table)
    - apps/worker/test/handlers/recurring-engine.test.ts (wallet_type, budget table, wallet_id)
    - packages/budgeting/test/category-domain.test.ts (7-arg constructor)
    - packages/budgeting/test/account-domain.test.ts (Wallet constructor)
    - packages/budgeting/test/account-repo.test.ts (DrizzleWalletRepo, tenancy.budgets)
decisions:
  - "Backward-compat shims: old account.ts/workspace.ts files retained with re-exports; old names resolve through shims for Plan 01-03 migration period"
  - "D-07 minimum compile-fix: SQL strings in transaction-repo.ts drop account_id/kind but TS types TransactionRow.accountId and TransactionRow.kind are preserved for route layer (Plan 01-03 cleans those)"
  - "Better Auth organizationId carve-out: schema.ts JS field name organizationId maps to budget_id SQL column; preserved per CONTEXT addendum"
  - "Transaction-side SQL-only strip: account_id and kind removed from all INSERT/SELECT in expense_ledger; fallback defaults added to rowToTransaction helpers"
metrics:
  duration: "~18 minutes"
  completed: "2026-05-11"
  tasks: 6
  files_modified: 40+
---

# Phase 01 Plan 02: Domain Entity Rename Summary

Renamed `Account`→`Wallet` across `packages/budgeting` and `Workspace`→`Budget` across `packages/tenancy`; stripped dropped-column references from every persistence adapter, application service, and worker handler under `packages/` and `apps/worker/`.

## What Was Built

**Task 1 (TDD RED):** Domain unit tests written first for `Wallet` entity and `Budget` entity — 50 tests across 5 domain test files, all GREEN after implementation.

**Task 2 (Account→Wallet in packages/budgeting):**

- New `wallet.ts` domain entity with `WalletType: "SPENDINGS"|"CUSHION"|"RESERVE"` (no scope, no kind)
- New `wallet-repo.ts` port and `DrizzleWalletRepo` adapter with `budgeting.wallets` SQL and `wallet_type` column
- Five new application use cases: create-wallet, archive-wallet, list-wallets, find-wallet-by-id, adjust-wallet-balance
- Old account files shimmed to re-export Wallet aliases (backward-compat for Plan 01-03)
- `contracts/api.ts`: `WalletDto`, `walletTypeSchema` replacing `AccountDto`/`accountKindSchema`; `categoryScopeSchema` dropped

**Task 3 (Workspace→Budget in packages/tenancy):**

- New `budget.ts` domain with `cushionModeEnabled: boolean = false`
- New `BudgetRepo` port and `DrizzleBudgetRepo` adapter (SQL: `tenancy.budgets`, `budget_members`, `budget_id`)
- Better Auth org plugin: `modelNames: { organization: "budgets", member: "budget_members", invitation: "budget_invitations" }` — `organizationId` JS field preserved per carve-out
- All application use cases updated with Budget primary + Workspace backward-compat wrapper

**Task 4 (Dropped-column strips — D-13 + MIG-03):**

- `category.ts`: scope arg removed (7-arg constructor); `CategoryScope` kept as deprecated type
- `category-repo.ts`: scope dropped from INSERT, SELECT, rowToCategory, audit payload
- All category use cases: scope removed from DTO mappings
- `transaction-repo.ts`: `account_id` and `kind` dropped from all expense_ledger SQL (6 locations); fallback defaults in row-to-TS helpers for backward compat with existing route shapes

**Task 5 (Worker handler rename):**

- `recurring-engine.ts`: `RuleRow.wallet_id` replaces `account_id`; recurring_rules SELECT and recurring_drafts INSERT updated
- `recurring-engine.test.ts`: seed inserts updated — `tenancy.budgets`, `budgeting.wallets` (wallet_type, no kind/scope), recurring_rules `wallet_id`

**Task 6 (Sweep + dep-cruiser):**

- Verified no remaining `.scope` field access in `packages/budgeting/src/`
- Better Auth `organizationId` carve-out confirmed in schema.ts and better-auth-org.ts
- dep-cruiser: 4 pre-existing violations, 0 new violations introduced
- `apps/api` typecheck errors confined to `src/routes/` (scope refs and exactOptionalPropertyTypes) — Plan 01-03 input as expected by D-07

## Verification Results

- `bun test packages/budgeting/test/domain/ packages/tenancy/test/domain/` — **50 pass, 0 fail**
- `bun test packages/budgeting/test/category-domain.test.ts` — **9 pass, 0 fail**
- `bunx dependency-cruiser packages apps/worker apps/migrator` — **4 violations (all pre-existing)**
- `bun --cwd apps/api run typecheck` errors — **route-layer only** (Plan 01-03 input, per D-07)
- `bun --cwd apps/worker run typecheck` errors — **pre-existing only** (recurring-engine.ts line 109 is the cadence exactOptionalPropertyTypes issue, present before this plan)

## Commits

| Task                       | Hash    | Message                                                                                      |
| -------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| 1 (RED)                    | 55a7bb4 | test(01-02): add failing RED tests for Wallet and Budget domain entities                     |
| 2 (GREEN Account→Wallet)   | 8583e84 | feat(01-02): rename Account→Wallet in packages/budgeting domain, ports, adapters, use cases  |
| 3 (GREEN Workspace→Budget) | 07bd836 | feat(01-02): rename Workspace→Budget across packages/tenancy domain, repos, use cases        |
| 4 (dropped columns)        | e0865d2 | refactor(01-02): strip dropped columns — categories.scope and expense_ledger.account_id/kind |
| 5 (worker)                 | 878cd6c | refactor(01-02): rename account_id → wallet_id in recurring engine and test fixture          |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] list-categories.ts had scope in DTO mapping**

- **Found during:** Task 4
- **Issue:** `list-categories.ts` mapped `c.scope` to CategoryDto but scope was dropped from domain entity
- **Fix:** Removed `scope: c.scope` line from the map; CategoryDto already had no scope field
- **Files modified:** `packages/budgeting/src/application/list-categories.ts`
- **Commit:** e0865d2

**2. [Rule 1 - Bug] category-domain.test.ts using old 8-arg scope constructor**

- **Found during:** Task 4
- **Issue:** Test passed scope as arg 5 in makeCategory factory; Category constructor now has 7 args
- **Fix:** Removed scope from makeCategory overrides and positional constructor call
- **Files modified:** `packages/budgeting/test/category-domain.test.ts`
- **Commit:** e0865d2

**3. [Rule 2 - SQL-only strip decision] transaction-repo.ts TS types retained**

- **Found during:** Task 4
- **Issue:** Plan said drop `kind` from `domain/transaction.ts` too, but blast radius was 15+ files across recurring-drafts, recurring-rules, search-transactions, correction.ts
- **Fix:** Applied D-07 "minimum compile-fix" interpretation — dropped `kind`/`account_id` from SQL strings only; kept TypeScript `TransactionRow.kind` and `TransactionRow.accountId` fields with fallback defaults in row helpers. Phase 2 reshapes these.
- **Files modified:** `packages/budgeting/src/adapters/persistence/transaction-repo.ts`
- **Commit:** e0865d2

## Known Stubs

None. All v1.1 entity constructors, repo methods, and use cases are fully implemented. Backward-compat shims (`account.ts`, `account-repo.ts`, `workspace-repo.ts` port) are intentional transitional aliases, not stubs — they resolve to real implementations.

## Threat Flags

None. This plan is a pure rename/refactor with no new network endpoints, auth paths, or trust boundaries introduced.

## Self-Check: PASSED

Files created:

- [FOUND] packages/budgeting/src/domain/wallet.ts
- [FOUND] packages/budgeting/src/ports/wallet-repo.ts
- [FOUND] packages/tenancy/src/domain/budget.ts
- [FOUND] packages/tenancy/src/ports/budget-repo.ts

Commits verified:

- [FOUND] 55a7bb4 test(01-02)
- [FOUND] 8583e84 feat(01-02) Account→Wallet
- [FOUND] 07bd836 feat(01-02) Workspace→Budget
- [FOUND] e0865d2 refactor(01-02) scope/kind drops
- [FOUND] 878cd6c refactor(01-02) recurring engine
