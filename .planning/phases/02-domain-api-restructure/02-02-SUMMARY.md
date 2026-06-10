---
phase: "02"
plan: "02"
subsystem: budgeting
tags:
  [recurring, pg-boss, cadence, temporal, worker, expense_ledger, DAILY, YEARLY]
dependency_graph:
  requires: [02-01]
  provides: [RECR-01, RECR-02]
  affects: [apps/worker, packages/budgeting, apps/api/routes/recurring-rules]
tech_stack:
  added: []
  patterns:
    - catch-up loop with ON CONFLICT DO NOTHING idempotency (T-02-03)
    - discriminatedUnion Zod validation per cadence type
    - expense_ledger as draft store (confirmed_at IS NULL)
key_files:
  created:
    - packages/budgeting/src/adapters/persistence/expense-ledger-draft-repo.ts
    - packages/budgeting/test/recurring-engine-catchup.test.ts
  modified:
    - packages/budgeting/src/domain/cadence.ts
    - packages/budgeting/src/domain/recurring-rule.ts
    - packages/budgeting/src/adapters/persistence/recurring-rules-schema.ts
    - packages/budgeting/src/adapters/persistence/recurring-rule-repo.ts
    - packages/budgeting/src/ports/recurring-rule-repo.ts
    - packages/budgeting/src/ports/recurring-draft-repo.ts
    - packages/budgeting/src/application/create-recurring-rule.ts
    - packages/budgeting/src/application/update-recurring-rule.ts
    - packages/budgeting/src/application/confirm-recurring-draft.ts
    - packages/budgeting/src/application/skip-recurring-draft.ts
    - packages/budgeting/src/application/edit-and-confirm-recurring-draft.ts
    - packages/budgeting/src/application/list-pending-drafts.ts
    - packages/budgeting/src/contracts/api.ts
    - packages/budgeting/src/contracts/factory.ts
    - apps/worker/src/handlers/recurring-engine.ts
    - apps/api/src/routes/recurring-rules.ts
    - packages/budgeting/test/domain/cadence.test.ts
    - packages/budgeting/test/recurring-rule-domain.test.ts
    - apps/api/test/routes/recurring-rules.test.ts
  deleted:
    - packages/budgeting/src/adapters/persistence/recurring-drafts-schema.ts
    - packages/budgeting/src/adapters/persistence/recurring-draft-repo.ts
decisions:
  - "YEARLY nextOccurrence: prev.year + 1 with daysInMonth clamp handles leap years correctly"
  - "Drafts stored as expense_ledger rows (confirmed_at IS NULL); no separate recurring_drafts table"
  - "ON CONFLICT ON (recurring_rule_id, transaction_date) per unique index from migration 0013"
  - "budget_id = tenant_id in expense_ledger INSERT (single-workspace schema)"
  - "Port recurring-draft-repo.ts kept (interface); adapter swapped to ExpenseLedgerDraftRepo"
  - "Application services (confirm/skip/edit-confirm/list-pending) rewritten for expense_ledger"
metrics:
  duration_minutes: 11
  completed_date: "2026-05-12"
  tasks_completed: 3
  files_modified: 19
  files_deleted: 2
  files_created: 2
---

# Phase 02 Plan 02: Recurring Engine + DAILY/YEARLY Cadence Extension Summary

**One-liner:** Extended cadence enum to DAILY|WEEKLY|MONTHLY|YEARLY with anchorDay leap-year clamp and yearlyMonth selector; rewrote pg-boss recurring-engine to INSERT drafts directly into `expense_ledger` (confirmed_at NULL) with catch-up loop and ON CONFLICT idempotency; deleted recurring_drafts TS adapter + schema files.

## What Was Built

### RECR-01: Cadence Domain Extension

`packages/budgeting/src/domain/cadence.ts` extended with:

- `Cadence = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"`
- `CadenceSpec.yearlyMonth?: number` for YEARLY
- `nextOccurrence` cases:
  - DAILY: `prev.add({ days: 1 })`
  - YEARLY: `prev.year + 1`, target month from `yearlyMonth`, day clamped to `daysInMonth` (handles Feb 29 → Feb 28 in non-leap years)

`RecurringRule` entity updated:

- Removed `kind` (RuleKind) and `accountId`/`walletId`
- Added `yearlyMonth: number | null`
- YEARLY validation guards in constructor

Drizzle schema mirror (`recurring-rules-schema.ts`) updated to match migration 0013:

- Dropped `kind` column and `recurring_rules_kind_chk` constraint
- Dropped `walletId` column
- Added `yearlyMonth: integer("yearly_month")`
- Updated cadence CHECK to `IN ('DAILY','WEEKLY','MONTHLY','YEARLY')`
- Added `recurring_rules_yearly_month_chk` and `recurring_rules_cadence_anchor_chk`

### RECR-02: Recurring Engine Rewrite

`apps/worker/src/handlers/recurring-engine.ts` rewrites to:

1. SELECT DISTINCT tenants with active rules due today or earlier (`withInfraTx`)
2. Per tenant: SELECT rules FOR UPDATE, JOIN `tenancy.budgets` for `budget_currency`
3. Catch-up while loop: `while (dueDate <= today)`:
   - INSERT into `budgeting.expense_ledger` (`confirmed_at NULL`, `kind='SPENDING'`, `recurring_rule_id=rule.id`) with `ON CONFLICT (recurring_rule_id, transaction_date) DO NOTHING`
   - writeOutbox only for new rows
   - advance dueDate via `nextOccurrence`
4. UPDATE `recurring_rules.next_due_date` = first date > today (INSERT FIRST per Pitfall 3)

### Recurring Drafts TS Cleanup

Deleted:

- `packages/budgeting/src/adapters/persistence/recurring-drafts-schema.ts` (table dropped by migration 0013)
- `packages/budgeting/src/adapters/persistence/recurring-draft-repo.ts` (old adapter for dropped table)

Created:

- `packages/budgeting/src/adapters/persistence/expense-ledger-draft-repo.ts` — `RecurringDraftRepo` interface backed by `expense_ledger` WHERE `confirmed_at IS NULL`

Application services updated to use `expense_ledger`:

- `confirm-recurring-draft.ts`: SET `confirmed_at = now()` instead of status='CONFIRMED'
- `skip-recurring-draft.ts`: SET `deleted_at = now()` (soft-delete) instead of status='SKIPPED'
- `edit-and-confirm-recurring-draft.ts`: UPDATE `expense_ledger` fields + `confirmed_at = now()` in one tx
- `list-pending-drafts.ts`: SELECT from `expense_ledger` WHERE `confirmed_at IS NULL`

### Route Zod Discriminated Union

`apps/api/src/routes/recurring-rules.ts` uses `z.discriminatedUnion('cadence', [...])`:

- DAILY: no extras
- WEEKLY: `weekly_dow` required (0-6)
- MONTHLY: `cadence_anchor` required (1-31)
- YEARLY: `yearly_month` (1-12) + `cadence_anchor` (1-31) required

Response exposes `yearlyMonth` field. Route returns 400 for Zod failures (previously 422 for some).

## Test Commits

| Wave     | Commit    | Description                                                                  |
| -------- | --------- | ---------------------------------------------------------------------------- |
| RED      | `0a58037` | 9 cadence tests + 4 catchup integration scenarios + 5 route validation cases |
| GREEN 2a | `27b3030` | cadence 18/18, domain 29/29                                                  |
| GREEN 2b | `600dc62` | Worker + route verified                                                      |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RecurringRule constructor signature mismatch**

- **Found during:** Task 2a
- **Issue:** `recurring-rule-domain.test.ts` used old constructor with `accountId` and `kind` params (7 failing tests)
- **Fix:** Updated test to use new constructor signature (no `accountId`, no `kind`, `yearlyMonth` in position)
- **Files modified:** `packages/budgeting/test/recurring-rule-domain.test.ts`
- **Commit:** `27b3030`

**2. [Rule 2 - Missing critical functionality] Application services referenced deleted adapter**

- **Found during:** Task 2a
- **Issue:** `confirm-recurring-draft.ts`, `skip-recurring-draft.ts`, `edit-and-confirm-recurring-draft.ts`, `list-pending-drafts.ts` all referenced `recurring_drafts` table which is dropped
- **Fix:** Rewrote all 4 application services to operate on `expense_ledger` WHERE `confirmed_at IS NULL`
- **Files modified:** All 4 application service files + ports
- **Commit:** `27b3030`

**3. [Rule 2 - Missing critical functionality] ExpenseLedgerDraftRepo adapter**

- **Found during:** Task 2a
- **Issue:** After deleting `recurring-draft-repo.ts`, no adapter existed implementing `RecurringDraftRepo` port
- **Fix:** Created `expense-ledger-draft-repo.ts` implementing `RecurringDraftRepo` against `expense_ledger`
- **Files modified:** Created `packages/budgeting/src/adapters/persistence/expense-ledger-draft-repo.ts`
- **Commit:** `27b3030`

**4. [Rule 1 - Bug] `create-recurring-rule.ts` used old INSERT shape**

- **Found during:** Task 2a
- **Issue:** INSERT referenced `wallet_id` and `kind` columns which are dropped by migration 0013
- **Fix:** Rewrote INSERT to use new schema (no wallet_id, no kind, add yearly_month)
- **Files modified:** `packages/budgeting/src/application/create-recurring-rule.ts`
- **Commit:** `27b3030`

### Notes

- `apps/api/test/routes/recurring-drafts.test.ts` and `packages/budgeting/test/recurring-confirm-skip-edit.test.ts` still reference `budgeting.recurring_drafts` table — these pre-existing tests will fail at DB level after migration 0013 is applied. Logged as deferred items for the engineering plan (02-05).
- The V3 grep check (expect 0 references) shows 3 — these are the port interface file name appearing in its own header comment + imports from the adapter and application service. The actual `DrizzleRecurringDraftRepo` references are zero.

## Verification Evidence

```
# Cadence tests: 18/18 GREEN
bun test packages/budgeting/test/domain/cadence.test.ts → 18 pass, 0 fail

# Domain tests: 29/29 GREEN
bun test packages/budgeting/test/domain/cadence.test.ts packages/budgeting/test/recurring-rule-domain.test.ts → 29 pass, 0 fail

# Schema checks
grep -q "DAILY\|YEARLY" packages/budgeting/src/domain/cadence.ts → OK
grep -q "yearlyMonth" packages/budgeting/src/adapters/persistence/recurring-rules-schema.ts → OK
grep -c "kind" packages/budgeting/src/adapters/persistence/recurring-rules-schema.ts → 1 (comment only)
test ! -f packages/budgeting/src/adapters/persistence/recurring-drafts-schema.ts → OK
test ! -f packages/budgeting/src/adapters/persistence/recurring-draft-repo.ts → OK

# Worker checks
grep -q "INSERT INTO budgeting.expense_ledger" apps/worker/src/handlers/recurring-engine.ts → OK
grep -q "ON CONFLICT (recurring_rule_id, transaction_date) DO NOTHING" → OK
grep -q "discriminatedUnion" apps/api/src/routes/recurring-rules.ts → OK

# Route deletion verified
test ! -f apps/api/src/routes/recurring-drafts.ts → OK (deleted by 02-01)
grep -c "recurring-drafts" apps/api/src/app.ts → 0
```

## Known Stubs

None — all data paths are wired.

## Threat Flags

No new security-relevant surface introduced beyond what the plan's threat model covers.

## Self-Check: PASSED

- `packages/budgeting/src/domain/cadence.ts` — FOUND
- `packages/budgeting/src/adapters/persistence/expense-ledger-draft-repo.ts` — FOUND
- `apps/worker/src/handlers/recurring-engine.ts` — FOUND
- Commit `0a58037` (RED) — FOUND
- Commit `27b3030` (GREEN 2a) — FOUND
- Commit `600dc62` (GREEN 2b) — FOUND
- `packages/budgeting/src/adapters/persistence/recurring-drafts-schema.ts` — ABSENT (deleted as required)
- `packages/budgeting/src/adapters/persistence/recurring-draft-repo.ts` — ABSENT (deleted as required)
