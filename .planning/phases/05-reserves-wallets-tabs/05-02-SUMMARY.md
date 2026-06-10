---
phase: 05-reserves-wallets-tabs
plan: 02
subsystem: domain, adapter, contracts
tags: [domain, adapter, reserves, wallet, audit, outbox, rls, zod, tdd]

requires:
  - phase: 05-01
    provides: category_reserve_adjustments table + RLS, categories.reserve_excluded column, Drizzle schema barrel

provides:
  - Wallet aggregate: rename/changeType/changeCurrency/setAmount mutators; canChangeCurrency rescinded (D-PH5-W12)
  - WalletRepo.update() port + Drizzle adapter (audit + outbox, mirrors setBalance shape)
  - CategoryReserveAdjustmentsRepo: append-only create() + paginated listForCategory()
  - ReservesSummaryRepo: SUM(current_balance * 100) for non-archived RESERVE wallets → bigint cents
  - CategoriesRepo.setReserveExcluded(): SELECT-before → UPDATE → audit + outbox
  - Zod schemas: updateWalletSchema (.strict() + empty_body refine), reserveAdjustmentSchema, categoryReserveExcludeSchema

affects:
  - 05-03 (imports all three Zod schemas + all four repo ports for HTTP route wiring)

key-files:
  created:
    - packages/budgeting/src/ports/category-reserve-adjustments-repo.ts
    - packages/budgeting/src/adapters/persistence/category-reserve-adjustments-repo.ts
    - packages/budgeting/src/ports/reserves-summary-repo.ts
    - packages/budgeting/src/adapters/persistence/reserves-summary-repo.ts
    - packages/budgeting/src/ports/categories-repo.ts
    - packages/budgeting/src/adapters/persistence/categories-repo.ts
    - packages/budgeting/test/adapters/category-reserve-adjustments-repo.test.ts
  modified:
    - packages/budgeting/src/domain/wallet.ts (mutators + canChangeCurrency rescission)
    - packages/budgeting/src/ports/wallet-repo.ts (update() signature)
    - packages/budgeting/src/adapters/persistence/wallet-repo.ts (update() implementation)
    - packages/budgeting/src/contracts/api.ts (Phase 5 Zod schemas appended)
    - apps/migrator/post-migration.sql (Phase 5 FORCE RLS + GRANT for category_reserve_adjustments)

key-decisions:
  - "canChangeCurrency() rescinded per D-PH5-W12: now returns ok(undefined). Reserve-currency invariant moves to Plan 03 use-case (needs budgetCurrencyOf tenancy lookup — domain stays decoupled)"
  - "wallet-repo.update() preserves setBalance() separately: setBalance is the worker-job path (D-PH2-09); update is the UI inline-edit path"
  - "ReservesSummaryRepo uses withTenantTx (not withInfraTx) — RLS with app.tenant_ids passes in this context (confirmed via test)"
  - "Test fixture verifyQuery() wraps GUC set_config in explicit BEGIN/COMMIT so transaction-local GUC persists for subsequent SELECT within the same transaction"
  - "outbox verification in tests uses DATABASE_URL_MIGRATOR (BYPASSRLS) — app_role has INSERT-only on shared_kernel.outbox; worker_role has SELECT but migrator is simpler for tests"
  - "Audit table is shared_kernel.audit_history (not platform.audit_log) — column is after_jsonb (not after_state)"

patterns-established:
  - "verifyQuery() helper: explicit BEGIN, set_config(GUC, local=true), SELECT, COMMIT — required for RLS to allow reads in integration tests"
  - "Append-only repo: no update()/delete() methods on port interface enforces D-PH5-R8 at API surface"

requirements-completed:
  - WALT-01
  - WALT-02
  - WALT-03
  - WALT-06
  - WALT-07
  - RSRV-01
  - RSRV-02
  - RSRV-06
---

# Phase 5 Plan 02: Domain + Adapter + Contracts for Reserves/Wallets SUMMARY

**One-liner:** Opened Wallet aggregate for mutation + added three new repos (CategoryReserveAdjustments, ReservesSummary, Categories.setReserveExcluded) + three Zod schemas, all TDD-green against real Postgres.

## Tasks Completed

| Task | Name                                                                                     | Commit  | Key Files                                          |
| ---- | ---------------------------------------------------------------------------------------- | ------- | -------------------------------------------------- |
| 1    | Open Wallet domain + WalletRepo.update()                                                 | 2c04ec8 | wallet.ts, wallet-repo.ts (port+adapter)           |
| 2    | CategoryReserveAdjustmentsRepo + ReservesSummaryRepo + CategoriesRepo.setReserveExcluded | 5f9ccba | 6 new files, test adapter file, post-migration.sql |
| 3    | Zod contracts for three new HTTP bodies                                                  | 6a0ec30 | contracts/api.ts                                   |

## Domain Mutator Signatures

```typescript
// packages/budgeting/src/domain/wallet.ts
rename(newName: string): Result<void, Error>          // min 1, max 120 chars
changeType(newType: WalletType): Result<void, Error>  // no domain invariant (use-case layer)
changeCurrency(newCurrency: string): Result<void, Error>  // regex /^[A-Z0-9]{3,5}$/
setAmount(newAmount: Money): Result<void, Error>       // currency must match wallet.currency
canChangeCurrency(): Result<void, Error>               // D-PH5-W12: always returns ok(undefined)
```

## Repo Port Signatures

```typescript
// WalletRepo (extended)
update(tenantId, walletId, patch: { name?, amount?, currency?, walletType? }, actorUserId): Promise<void>

// CategoryReserveAdjustmentsRepo (new)
create(input: { tenantId, categoryId, deltaCents, note?, actorUserId }): Promise<{ id, occurredAt }>
listForCategory(tenantId, categoryId, opts?: { limit?, offset? }): Promise<CategoryReserveAdjustmentRow[]>

// ReservesSummaryRepo (new)
sumReserveWalletAmounts(tenantId): Promise<bigint>  // cents, excludes archived

// CategoriesRepo (new)
setReserveExcluded(tenantId, categoryId, excluded, actorUserId): Promise<void>
```

## Audit + Outbox Event Types

| Operation                       | entityType                    | action   | eventType                                     |
| ------------------------------- | ----------------------------- | -------- | --------------------------------------------- |
| wallet.update()                 | `wallet`                      | `update` | `budgeting.wallet.updated`                    |
| adjustments.create()            | `category_reserve_adjustment` | `create` | `budgeting.reserve.adjusted`                  |
| categories.setReserveExcluded() | `category`                    | `update` | `budgeting.category.reserve_excluded_changed` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test schema/table name references**

- **Found during:** Task 2 — prior agent wrote `platform.audit_log` and `platform.outbox` but actual schema is `shared_kernel.audit_history` and `shared_kernel.outbox`
- **Fix:** Corrected table references; added `verifyQuery()` helper with explicit BEGIN/COMMIT for transaction-local GUC; used DATABASE_URL_MIGRATOR for outbox SELECT (app_role has INSERT-only)
- **Files modified:** `packages/budgeting/test/adapters/category-reserve-adjustments-repo.test.ts`
- **Commit:** 5f9ccba

**2. [Rule 1 - Bug] Fixed implicit any type on listForCategory row mapper**

- **Found during:** Task 2 — tsc reported TS7006 on `(row)` in `.map()`
- **Fix:** Added explicit type annotation on the row parameter
- **Files modified:** `packages/budgeting/src/adapters/persistence/category-reserve-adjustments-repo.ts`
- **Commit:** 5f9ccba

## Test Results

- 12 integration tests pass against real Postgres
- Tests cover: create, occurredAt, audit row, outbox row, listForCategory (order + cross-tenant), sumReserveWalletAmounts (4 scenarios), setReserveExcluded (2 scenarios)
- No DB mocks (CLAUDE.md rule)

## Known Stubs

None — all repos write real SQL; no placeholder data.

## Threat Surface Scan

No new network endpoints introduced. Threat mitigations from plan applied:

- T-05-04: RLS via `withTenantTx` on all writes
- T-05-07: No update()/delete() on CategoryReserveAdjustmentsRepo port
- T-05-10: `note: z.string().max(280).optional()` in reserveAdjustmentSchema
- T-05-12: updateWalletSchema uses `.strict()` + per-field regex
- T-05-13: updateWalletSchema whitelists exactly 4 fields

## Self-Check: PASSED

All 6 new source files present. All 3 commits verified (2c04ec8, 5f9ccba, 6a0ec30). Integration tests: 12 pass, 0 fail.
