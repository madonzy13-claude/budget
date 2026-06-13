---
phase: quick-260613-nkb
plan: 01
subsystem: database
tags: [drizzle, postgres, better-auth, rls, currency-lock, migration, tdd]

requires:
  - phase: 06-settings-onboarding-share-ui
    provides: "transaction-aware currency lock (budget-identity route guard + workspaceRepo.hasTransactions)"
provides:
  - "Zero-transaction budgets can change default_currency (live: 200 + DB updated)"
  - "Stale unconditional budgets_currency_immutable trigger removed from fresh + existing DBs"
  - "Better Auth beforeUpdateOrganization made transaction-aware (no latent trap)"
  - "assertCurrencyChangeAllowed() — exported, unit-testable currency-lock helper"
affects: [settings, currency, fx, migrations]

tech-stack:
  added: []
  patterns:
    - "App layer is the SOLE owner of the D-04/TENT-11 currency-lock invariant (no DB trigger)"
    - "Idempotent DROP IF EXISTS migration + post-migration.sql edit must be paired (migrate.ts recreates post-migration after migrations)"

key-files:
  created:
    - drizzle/0035_drop_currency_immutable_trigger.sql
  modified:
    - apps/migrator/post-migration.sql
    - drizzle/meta/_journal.json
    - packages/tenancy/src/adapters/persistence/better-auth-org.ts
    - packages/tenancy/test/default-currency-immutable.test.ts
    - apps/api/test/routes/budget-identity.test.ts

key-decisions:
  - "Removed the over-broad DB trigger entirely rather than making it transaction-aware in SQL — the app guard already subsumes the invariant; one owner, no duplication."
  - "Relaxed (not deleted) the dormant Better Auth hook to the same transaction-aware rule, extracted into exported assertCurrencyChangeAllowed() so it is unit-testable without driving Better Auth HTTP/session machinery."
  - "Tenancy test drives the real fix path (workspaceRepo.updateIdentity) instead of a hand-rolled withInfraTx UPDATE, which failed on a GRANT (permission denied for table budgets) under the infra role."

patterns-established:
  - "Currency-lock rule lives in one exported function (assertCurrencyChangeAllowed) reused by the Better Auth hook; route guard uses workspaceRepo.hasTransactions (same EXISTS semantics)."

requirements-completed: [SETT-02, TENT-11, D-04]

duration: ~35min
completed: 2026-06-13
---

# Quick Task 260613-nkb: Fix currency change blocked on zero-transaction budgets — Summary

**Removed an over-broad DB trigger that blocked ALL default_currency changes (even zero-transaction budgets), making the transaction-aware app-layer guard the sole owner of the D-04/TENT-11 currency lock; live-verified zero-tx → 200, with-tx → 409.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-06-13T17:00Z (approx)
- **Completed:** 2026-06-13T17:21Z
- **Tasks:** 2 code tasks + deploy/verify checkpoint
- **Files modified:** 6 (1 created)

## Accomplishments

### Task 1 — Drop the stale trigger + rewrite the regression tests (TDD)

- **RED:** Rewrote `packages/tenancy/test/default-currency-immutable.test.ts` to the NEW rule (zero-tx CAN change; with-tx blocked). Initially red against the trigger-present code.
- **GREEN — fresh DBs:** Removed the entire `budgets_block_currency_change()` function + `budgets_currency_immutable` trigger block from `apps/migrator/post-migration.sql`, leaving a breadcrumb comment pointing to migration 0035 and the app guard. Mandatory because `migrate.ts` runs post-migration.sql AFTER migrations — leaving it would recreate the trigger.
- **GREEN — existing DBs:** Created `drizzle/0035_drop_currency_immutable_trigger.sql` (idempotent `DROP TRIGGER IF EXISTS` + `DROP FUNCTION IF EXISTS`) and registered journal entry idx 35 / tag `0035_drop_currency_immutable_trigger` / when `1781600000000`.
- Added route test (`apps/api/test/routes/budget-identity.test.ts`): zero-tx default_currency change → 200 + `updateIdentity` called with `{ defaultCurrency }`; with-tx → 409 `currency_locked` + `updateIdentity` NOT called.

### Task 2 — Make the Better Auth hook transaction-aware (remove latent trap)

- Extracted `assertCurrencyChangeAllowed({ orgId, actorUserId })` in `better-auth-org.ts` — mirrors `workspaceRepo.hasTransactions` exactly (non-deleted `budgeting.expense_ledger` EXISTS, `app.tenant_ids` set for RLS). Throws when locked, resolves when allowed.
- `beforeUpdateOrganization` now resolves the org id (`member.organizationId`) + actor (`user.id`) from Better Auth's real hook param shape (`{ organization, user, member }`) and delegates to the shared helper. No more unconditional throw; no route-behavior change (the PATCH route still bypasses Better Auth).
- Hook-level tests call `assertCurrencyChangeAllowed` directly (avoids Better Auth `requireHeaders`/session machinery, which is unrelated to the rule): zero-tx allowed, with-tx throws.

## Verification

- `bun test apps/api/test/routes/budget-identity.test.ts` → **14 pass / 0 fail**
- `infisical run --env=dev -- bun test packages/tenancy/test/default-currency-immutable.test.ts` → **4 pass / 0 fail** (real Postgres testcontainer)
- typecheck: tenancy + api both clean
- **Deploy:** rebuilt api + worker + migrator; `make migrate` applied 0035 (latest applied-migration timestamp = 1781600000000) then post-migration.sql with no trigger recreation; restarted api + worker (healthy).
- **Live DB:** `SELECT tgname FROM pg_trigger WHERE tgname='budgets_currency_immutable'` → empty; `budgets_block_currency_change` function → empty; trigger stays gone after an idempotent re-`make migrate`.
- **Tenant-leak gate (`make ci-gate`):** 51 pass / 0 fail. (The wrapper exits 1 on the pre-existing aggregate coverage-threshold artifact — documented in project MEMORY; all security tests pass.)

### Live PATCH proof (https://budget-dev.madonzy.com, uat-probe-1@example.com)

```
SIGN-IN status: 200

PATCH [zero-tx EUR->USD] de911aa0-012f-4820-a74e-e02797f0de04 -> USD: status=200 body={"ok":true}
PATCH [zero-tx USD->EUR (restore)] de911aa0-012f-4820-a74e-e02797f0de04 -> EUR: status=200 body={"ok":true}
PATCH [with-tx EUR->USD] b2dd4f75-e504-49f2-98bd-3e0063ce79eb -> USD: status=409 body={"error":"currency_locked"}
```

- Zero-tx **Scroll Test 0** (`de911aa0-…`, 0 live tx): EUR→USD = **200**, restored USD→EUR = **200**.
- With-tx **Optimistic Tapo** (`b2dd4f75-…`, 53 live tx): EUR→USD = **409 currency_locked**, DB unchanged.
- Final DB state: Scroll Test 0 = EUR (restored), Optimistic Tapo = EUR (unchanged). No live data left mutated.

## Preserved invariant (D-04 / TENT-11)

A budget's `default_currency` still MUST NOT change once any non-deleted ledger row exists. The removed trigger was strictly MORE restrictive (blocked even zero-tx) and is not load-bearing; the route guard (`hasTransactions` → 409 before UPDATE) and the relaxed Better Auth hook both enforce the rule. Tenant isolation unchanged (ci-gate 51/51).

## Deviations from Plan

**1. [Rule 1 - Bug] Tenancy "zero-tx CAN change" test rewritten to use the real repo path**

- **Found during:** Task 1 GREEN — the plan's suggested hand-rolled `withInfraTx` + raw `UPDATE tenancy.budgets` failed with `permission denied for table budgets` (the infra role lacks UPDATE grant on `tenancy.budgets`; only `withTenantTx` via the repo uses the granted path). This is a test-harness mismatch, not the trigger.
- **Fix:** Test A now drives `workspaceRepo.updateIdentity(budgetId, { defaultCurrency }, ownerUserId)` (the exact code path the PATCH route uses) and reads back via `findById`. This both exercises the real fix and uses the correct role/GUCs.

**2. [Rule 3 - Blocking] Better Auth hook tests target the extracted helper instead of the HTTP endpoint**

- **Found during:** Task 2 — `auth.api.updateOrganization` requires `body.data` (object) AND `requireHeaders: true` (real session cookie); driving it in an integration test produced `Headers is required`, unrelated to the currency rule.
- **Fix:** Extracted the rule into exported `assertCurrencyChangeAllowed()` (the hook delegates to it) and asserted on it directly. Tests the exact production logic without Better Auth's HTTP/session layer.

## Self-Check: PASSED

- drizzle/0035_drop_currency_immutable_trigger.sql — FOUND
- post-migration.sql no longer contains the trigger/function (grep = 0) — CONFIRMED
- \_journal.json valid + idx 35 present — CONFIRMED
- Commit c2c9af5 — FOUND
- Live trigger removed + zero-tx 200 / with-tx 409 — VERIFIED
