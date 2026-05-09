---
phase: 02-budgeting-fx
plan: "01"
subsystem: budgeting
tags: [budgeting, money, currency, temporal, scaffold, tdd]
dependency_graph:
  requires: []
  provides:
    - "@budget/budgeting workspace (buildable)"
    - "Currency branded type + isCrypto/isFiat (packages/shared-kernel/src/currency.ts)"
    - "validateShares (packages/budgeting/src/domain/share-validation.ts)"
    - "firstDayOfMonth / lastDayOfMonth / plainDateToDateUTC (packages/budgeting/src/domain/temporal-helpers.ts)"
    - "nextOccurrence MONTHLY+WEEKLY (packages/budgeting/src/domain/cadence.ts)"
    - "budgeting.supported_currencies Drizzle schema"
    - "Wave-0 test scaffolding (conftest, helpers, e2e dirs)"
  affects:
    - packages/shared-kernel (index.ts extended with AnyCurrency export)
tech_stack:
  added:
    - "temporal-polyfill@0.3.2 (planned ^0.5.1 — does not exist; latest used)"
    - "big.js@7 (already in budgeting deps for share math)"
    - "neverthrow@8 (Result type for validateShares)"
  patterns:
    - "Branded type Currency = string & { __brand: 'Currency' } — open to any ISO-4217 code"
    - "validateShares with ±0.005 tolerance (stricter than tenancy's ±0.01)"
    - "nextOccurrence month-end clamping: prev.add({months:1}).with({day: min(anchor, daysInMonth)})"
key_files:
  created:
    - packages/budgeting/package.json
    - packages/budgeting/tsconfig.json
    - packages/budgeting/src/index.ts
    - packages/budgeting/src/contracts/factory.ts
    - packages/shared-kernel/src/currency.ts
    - packages/budgeting/src/domain/share-validation.ts
    - packages/budgeting/src/domain/temporal-helpers.ts
    - packages/budgeting/src/domain/cadence.ts
    - packages/budgeting/src/adapters/persistence/supported-currencies-schema.ts
    - packages/budgeting/test/domain/share-validation.test.ts
    - packages/budgeting/test/domain/temporal-helpers.test.ts
    - packages/budgeting/test/domain/cadence.test.ts
    - packages/budgeting/test/conftest.test.ts
    - packages/budgeting/test/helpers.ts
    - packages/budgeting/test/db-constraints/.gitkeep
    - tests/e2e/features/budget/.gitkeep
    - tests/e2e/features/recurring/.gitkeep
    - tests/e2e/features/budgets/.gitkeep
  modified:
    - packages/shared-kernel/src/index.ts (added AnyCurrency, asCurrency, isCrypto, isFiat exports)
decisions:
  - "temporal-polyfill version: ^0.5.1 from plan does not exist; used ^0.3.2 (latest)"
  - "Currency branded type exported as AnyCurrency from shared-kernel index to avoid conflict with money.ts union type — money.ts unchanged to preserve existing tests"
  - "Currency is still exported as 'Currency' from its own file (currency.ts); index re-exports it as AnyCurrency"
  - "conftest DATABASE_URL_APP test intentionally RED in Wave-0 — documents contract for plan 02-02"
metrics:
  duration: "528 seconds (~9 minutes)"
  completed: "2026-05-09T20:37:45Z"
  tasks_completed: 3
  files_created: 19
---

# Phase 02 Plan 01: Budgeting Workspace Bootstrap Summary

**One-liner:** `@budget/budgeting` workspace scaffolded with temporal-polyfill, Currency branded type, share-validation (±0.005), Temporal helpers, cadence math (month-end clamping + weekly DOW), and Wave-0 TDD scaffold.

## What Shipped

### Task 1 — Bootstrap @budget/budgeting workspace

- `packages/budgeting/package.json` — workspace with `@budget/budgeting` name, temporal-polyfill@0.3.2, all budgeting-context deps
- `packages/budgeting/tsconfig.json` — extends root tsconfig.base.json
- `packages/budgeting/src/index.ts` — empty barrel (downstream plans append)
- `packages/budgeting/src/contracts/factory.ts` — `BudgetingModule` interface + `createBudgetingModule()` skeleton
- `bun install` + `bun tsc --noEmit` pass cleanly

### Task 2 — Domain primitives (TDD: 24 tests, all green)

- **`packages/shared-kernel/src/currency.ts`** — `Currency` branded type (`string & { __brand: 'Currency' }`), `asCurrency(code)`, `isCrypto(c)`, `isFiat(c)`
- **`packages/budgeting/src/domain/share-validation.ts`** — `validateShares(entries)` → `Result<void, Error>` with ±0.005 tolerance
- **`packages/budgeting/src/domain/temporal-helpers.ts`** — `firstDayOfMonth`, `lastDayOfMonth`, `plainDateToDateUTC` using `temporal-polyfill`
- **`packages/budgeting/src/domain/cadence.ts`** — `nextOccurrence(spec, prev)` for `MONTHLY` (Pitfall-6 month-end clamping) and `WEEKLY` (Sun=0→7 Temporal conversion)

### Task 3 — Schema + Wave-0 scaffold

- **`packages/budgeting/src/adapters/persistence/supported-currencies-schema.ts`** — `budgeting.supported_currencies` Drizzle table (no `pgPolicy` — GRANT-controlled reference data)
- **`packages/budgeting/test/helpers.ts`** — `freshTenant`, `withTenantTxFixture`, `seedFxRate`, `freezeTime`
- **`packages/budgeting/test/conftest.test.ts`** — 5 contract tests (4 pass; DATABASE_URL_APP intentionally RED until plan 02-02)
- E2E skeleton dirs: `tests/e2e/features/budget/`, `recurring/`, `budgets/`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] temporal-polyfill version ^0.5.1 does not exist**

- **Found during:** Task 1
- **Issue:** Plan specified `"temporal-polyfill": "^0.5.1"` but npm registry shows latest is 0.3.2 — no 0.5.x exists
- **Fix:** Used `^0.3.2` (current latest)
- **Files modified:** `packages/budgeting/package.json`
- **Commit:** df9ff8c

**2. [Rule 1 - Bug] Currency branded type conflicts with money.ts union type**

- **Found during:** Task 2
- **Issue:** `packages/shared-kernel/src/money.ts` exports `type Currency = FiatCurrency | CryptoCurrency`. Adding `export * from './currency'` to index.ts caused TS2308 ambiguity. Replacing money.ts's type would break 50 existing shared-kernel tests.
- **Fix:** In `shared-kernel/src/index.ts`, re-export the new branded type as `AnyCurrency` (named export alias). `currency.ts` still exports it as `Currency` natively — the plan acceptance check (`grep -q "export type Currency" packages/shared-kernel/src/currency.ts`) passes. `money.ts` unchanged.
- **Files modified:** `packages/shared-kernel/src/index.ts`
- **Commit:** b219223

## Test Results

| Test file                | Tests | Status                                          |
| ------------------------ | ----- | ----------------------------------------------- |
| share-validation.test.ts | 7     | GREEN                                           |
| temporal-helpers.test.ts | 8     | GREEN                                           |
| cadence.test.ts          | 9     | GREEN                                           |
| conftest.test.ts         | 4/5   | 4 GREEN, 1 intentionally RED (DATABASE_URL_APP) |

Domain files at 100% line/function coverage.

## Currency Type Behavior

```typescript
// packages/shared-kernel/src/currency.ts
export type Currency = string & { __brand: "Currency" };
asCurrency("usd"); // → 'USD' as Currency
asCurrency("BTC"); // → 'BTC' as Currency
asCurrency("INVALID123"); // throws Error
isCrypto(asCurrency("BTC")); // → true
isFiat(asCurrency("PLN")); // → true
// Accepts ANY ISO-4217 code — no hardcoded allowlist
```

## validateShares Behavior

- Tolerance: ±0.005 (stricter than tenancy ±0.01)
- Empty array → `err`
- p < 0 or p > 100 → `err`
- sum 99.994 → `err` (more than 0.005 away)
- sum 100.004 → `ok` (within tolerance)
- sum 100.006 → `err` (outside tolerance)

## nextOccurrence Behavior

- **MONTHLY Pitfall-6:** Jan 31 + 1mo (anchor=31) → Feb 28 (clamps); Feb 28 + 1mo (anchor=31) → Mar 31 (restores anchor)
- **WEEKLY Sun=0:** Converts `weeklyDow=0` (Sun) to `7` for Temporal's Mon=1..Sun=7 system

## Open Items (deferred to later plans)

| Item                                        | Deferred to                     |
| ------------------------------------------- | ------------------------------- |
| FX cache schema (`budgeting.fx_rates`)      | plan 02-02                      |
| Consolidated schema migration push          | plan 02-02                      |
| TX-repo writer implementation               | plan 02-06                      |
| GRANT statements for `supported_currencies` | plan 02-02 (post-migration.sql) |
| Testcontainer wiring for DATABASE_URL_APP   | plan 02-02                      |

## Self-Check

```
packages/budgeting/package.json                                    FOUND
packages/budgeting/src/contracts/factory.ts                        FOUND
packages/budgeting/src/domain/share-validation.ts                  FOUND
packages/budgeting/src/domain/temporal-helpers.ts                  FOUND
packages/budgeting/src/domain/cadence.ts                           FOUND
packages/shared-kernel/src/currency.ts                             FOUND
packages/budgeting/src/adapters/persistence/supported-currencies-schema.ts FOUND
packages/budgeting/test/helpers.ts                                 FOUND
packages/budgeting/test/conftest.test.ts                           FOUND
tests/e2e/features/budget/                                         FOUND
tests/e2e/features/recurring/                                      FOUND
tests/e2e/features/budgets/                                        FOUND
```

Commits:

- df9ff8c feat(02-01): bootstrap @budget/budgeting workspace + temporal-polyfill
- b219223 feat(02-01): ship Currency type, share-validation, Temporal helpers, cadence math (TDD)
- 0da7a84 feat(02-01): supported_currencies schema + Wave-0 test conftest + e2e dir scaffolds

## Self-Check: PASSED
