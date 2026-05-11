---
phase: 02-budgeting-fx
plan: "07"
subsystem: budgeting/ledger/correction
tags: [budgeting, ledger, correction, edit, history, tdd]
dependency_graph:
  requires: [02-06-PLAN.md]
  provides:
    [correction-row-path, edit-transaction-use-case, transaction-history-api]
  affects: [transaction-list, transaction-repo, budgeting-factory]
tech_stack:
  added: [fast-check property testing, pg_advisory_xact_lock]
  patterns:
    [correction-row immutability, RSC+client-island, SCD-2 advisory locking]
key_files:
  created:
    - packages/budgeting/src/domain/correction.ts
    - packages/budgeting/src/application/edit-transaction.ts
    - packages/budgeting/src/application/get-transaction-history.ts
    - packages/budgeting/test/correction-row-builder.test.ts
    - packages/budgeting/test/ledger/correction-chain.property.test.ts
    - packages/budgeting/test/edit-transaction-integration.test.ts
    - apps/api/test/routes/transactions-edit.test.ts
    - apps/web/src/components/budgeting/transaction-edit-form.tsx
    - apps/web/src/components/budgeting/edit-history-panel.tsx
    - apps/web/src/components/budgeting/transaction-row-client.tsx
    - apps/web/test/components/transaction-edit-form.test.tsx
    - apps/web/test/components/edit-history-panel.test.tsx
    - tests/e2e/features/budget/edit-transaction-correction.feature
  modified:
    - packages/budgeting/src/ports/transaction-repo.ts
    - packages/budgeting/src/adapters/persistence/transaction-repo.ts
    - packages/budgeting/src/domain/transaction.ts
    - packages/budgeting/src/contracts/api.ts
    - packages/budgeting/src/contracts/factory.ts
    - apps/api/src/routes/transactions.ts
    - apps/web/src/components/budgeting/transaction-list.tsx
    - apps/web/messages/en.json
    - apps/web/messages/pl.json
    - apps/web/messages/uk.json
    - tests/e2e/pages/TransactionsPage.ts
    - tests/e2e/steps/budget.steps.ts
decisions:
  - "Advisory lock (pg_advisory_xact_lock) instead of SELECT FOR UPDATE — app_role has REVOKE UPDATE on expense_ledger so FOR UPDATE fails with permission error"
  - "RSC + client island split: TransactionList stays RSC; TransactionRowClient handles edited badge + history sheet as client component"
  - "hasCorrections derived via EXISTS subquery in listLatest SQL — not stored column — keeps ledger append-only"
  - "AlreadyCorrected race guard: after acquiring advisory lock, check corrects_id = originalId before INSERT"
metrics:
  duration: "~3 hours"
  completed: "2026-05-10"
  tasks: 3
  files: 26
---

# Phase 02 Plan 07: Edit-via-Correction-Row Summary

Immutable ledger editing via correction-row path: editing a transaction inserts a NEW ledger row with `corrects_id = original.id`; UPDATE is REVOKE'd at SQL layer. Full audit chain preserved; UI shows "edited" badge and side-panel history.

## Tasks Completed

| Task | Name                                                           | Commit    | Files                                                                            |
| ---- | -------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------- |
| 1    | Correction domain + diff builder + property tests              | `4bb67fb` | correction.ts, ports, 2 test files                                               |
| 2    | edit-transaction use case + API routes + integration tests     | `2201f47` | edit-transaction.ts, get-transaction-history.ts, contracts, routes, 2 test files |
| 3    | Web UI — edit form + history panel + edited badge + i18n + e2e | `7e2eb5b` | 5 new components, 3 i18n files, 3 e2e files                                      |

## Domain Correction Builder Semantics

`buildCorrectionRow()` in `packages/budgeting/src/domain/correction.ts`:

- **Immutable fields** (always preserved from original): `kind`, `currencyDefault`, `transferGroupId`, `balanceDeltaSign`. These cannot be changed by an edit — a transfer cannot become an expense.
- **Mutable fields**: `amountOrig`, `currencyOrig`, `transactionDate`, `categoryId`, `accountId`, `note` — any subset may change.
- **Explicit null handling**: `categoryId` and `note` use `!== undefined` check (not `??`) so an explicit `null` in edits correctly overrides a non-null original. This is critical for un-categorizing a transaction.
- **New IDs**: correction row gets a fresh `crypto.randomUUID()` id; `correctsId` is set to original row's id.
- **FX re-fetch gate**: if `amountOrig`, `currencyOrig`, or `transactionDate` changed, edit-transaction use case re-fetches FX rate (same 60-minute freshness window as create-transaction, EXPN-13).

## AlreadyCorrected Race Handling

Race condition: two concurrent edits of same transaction row → one must be rejected.

Approach: `pg_advisory_xact_lock(hashtext(originalId))` acquired inside `withTenantTx`. After acquiring lock, query checks `WHERE corrects_id = $originalId` — if row exists, throw `AlreadyCorrectedError` (kind = "AlreadyCorrected"). API maps this to HTTP 409.

Could not use `SELECT ... FOR UPDATE` because `REVOKE UPDATE, DELETE ON budgeting.expense_ledger FROM app_role` — that privilege is removed to enforce ledger immutability. Advisory lock provides equivalent serialization without needing UPDATE privilege.

## API Surface

```
POST /api/transactions/:id/correct
  Body: { edits: { amountOrig?, currencyOrig?, transactionDate?, categoryId?, accountId?, note? } }
  201: { correctionId, originalId }
  404: transaction not found
  409: AlreadyCorrected (concurrent edit)
  422: FX stale / FX fetch failed

GET /api/transactions/:id/history
  200: { chain: TransactionRow[] }  // ordered created_at ASC, root first
  404: transaction not found
```

`GET /api/transactions` (list) now includes `hasCorrections: boolean` per row — derived via EXISTS subquery in listLatest SQL aliased as `has_corrections`.

## UI Extension to transaction-list

`transaction-list.tsx` is RSC. When `tx.hasCorrections === true`, it renders `<TransactionRowClient>` — a client island that owns:

- "edited" badge button (`data-testid="edited-badge-{transactionId}"`)
- `EditHistoryPanel` state (open/close)

`EditHistoryPanel` is a left-side Sheet (360px) that fetches `/api/transactions/{id}/history` on open, renders chain rows with `data-testid="chain-row-{idx}"`. Original row (correctsId === null) shows "Original" label; subsequent rows show "Edited" label with changed field summary.

`TransactionEditForm` is a Sheet pre-filled from the original transaction. Kind shown as disabled text (cannot change transfer/expense/income classification). Detects changes before submitting — calls `onCancel` if no fields changed (empty edits guard).

## Test Coverage

| Suite                                              | Count         | Result       |
| -------------------------------------------------- | ------------- | ------------ |
| Unit — correction-row-builder.test.ts              | 21            | pass         |
| Property — correction-chain.property.test.ts       | 8 (×100 runs) | pass         |
| Integration — edit-transaction-integration.test.ts | 6             | pass         |
| Integration — transactions-edit.test.ts (API)      | 8             | pass         |
| Component — transaction-edit-form.test.tsx         | 5             | pass         |
| Component — edit-history-panel.test.tsx            | 5             | pass         |
| **Total**                                          | **53**        | **all pass** |

E2E feature file (`edit-transaction-correction.feature`) wired with playwright-bdd; runs against live stack.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SELECT FOR UPDATE incompatible with REVOKE UPDATE**

- **Found during:** Task 2, insertCorrection implementation
- **Issue:** `SELECT ... FOR UPDATE` throws permission error — `app_role` has `REVOKE UPDATE` on `expense_ledger` to enforce immutability. Cannot use row-level locking via FOR UPDATE.
- **Fix:** Replaced with `SELECT pg_advisory_xact_lock(hashtext(${originalId}))` inside `withTenantTx`. Transaction-level advisory lock provides equivalent serialization without requiring UPDATE privilege.
- **Files modified:** `packages/budgeting/src/adapters/persistence/transaction-repo.ts`
- **Commit:** `2201f47`

**2. [Rule 1 - Bug] Postgres NUMERIC returns extra decimal places**

- **Found during:** Task 2, integration test assertions
- **Issue:** `expect(String(row.amount_orig)).toBe("100.00")` failed — Postgres NUMERIC columns return `"100.0000"`.
- **Fix:** Changed assertions to `expect(parseFloat(String(row.amount_orig))).toBeCloseTo(100, 1)`.
- **Files modified:** `packages/budgeting/test/edit-transaction-integration.test.ts`, `apps/api/test/routes/transactions-edit.test.ts`
- **Commit:** `2201f47`

**3. [Rule 1 - Bug] Form "no changes" guard prevented test submissions**

- **Found during:** Task 3, Vitest component tests
- **Issue:** `TransactionEditForm` detects empty edits (values unchanged from original) and calls `onCancel` instead of `fetch`. Tests for POST submission and 409 error were calling submit without first changing any field.
- **Fix:** Added `userEvent.clear(noteInput); userEvent.type(noteInput, "Changed note")` before clicking submit in affected tests.
- **Files modified:** `apps/web/test/components/transaction-edit-form.test.tsx`
- **Commit:** `7e2eb5b`

## Open Items

- **Bulk re-categorize (plan 02-09)** can reuse `insertCorrection` in a loop — one correction row per transaction, same advisory-lock + AlreadyCorrected guard pattern. No new infrastructure needed.
- **E2E full run**: feature file wired; requires running stack (`PLAYWRIGHT_BASE_URL` from `.env.local`). Run via `make test-e2e`.

## Self-Check: PASSED

- Commits 4bb67fb, 2201f47, 7e2eb5b all verified in git log
- All 53 tests pass (43 bun:test + 10 Vitest)
- Key files verified present:
  - packages/budgeting/src/domain/correction.ts
  - packages/budgeting/src/application/edit-transaction.ts
  - apps/web/src/components/budgeting/transaction-edit-form.tsx
  - apps/web/src/components/budgeting/edit-history-panel.tsx
  - apps/web/src/components/budgeting/transaction-row-client.tsx
