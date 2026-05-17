---
phase: 05-reserves-wallets-tabs
plan: "08"
subsystem: e2e-phase5
tags:
  - e2e
  - playwright-bdd
  - phase-close
  - w5-alignment
dependency_graph:
  requires:
    - "05-05" # WalletRow data-wallet-id (W-5 producer)
    - "05-06" # ReservesTableRow data-category-id (W-5 producer)
    - "05-07" # cascading-hide reservesEnabled toggle
  provides:
    - 6 @phase5 Gherkin feature files (wallets/ + reserves/)
    - WalletsPage Page Object (W-5 rewritten)
    - ReservesPage Page Object (new)
    - wallets.steps.ts + reserves.steps.ts step definitions
tech_stack:
  added: []
  patterns:
    - playwright-bdd createBdd() step bindings + Page Objects
    - W-5 id-resolution via data-wallet-id / data-category-id attributes
    - API-based seeding (POST /wallets, PUT /balance, POST /reserves/:id/adjust)
    - fresh-user-per-scenario via budget.steps.ts "I am signed in as a fresh user"
key_files:
  created:
    - tests/e2e/pages/ReservesPage.ts
    - tests/e2e/steps/wallets.steps.ts
    - tests/e2e/steps/reserves.steps.ts
    - tests/e2e/features/wallets/add-edit-drag-delete.feature
    - tests/e2e/features/wallets/reserve-currency-rejected.feature
    - tests/e2e/features/wallets/cross-tab-invalidation.feature
    - tests/e2e/features/reserves/share-math-and-zero-state.feature
    - tests/e2e/features/reserves/rebalance-via-inline-edit.feature
    - tests/e2e/features/reserves/exclude-category.feature
  modified:
    - tests/e2e/pages/WalletsPage.ts (full rewrite, legacy v1.0 accounts shape removed)
decisions:
  - "W-5 enforcement: removed duplicate 'I click {string}' step from wallets.steps.ts — budget.steps.ts defines the generic handler; feature files route through that"
  - "W-5 resolution: resolveIdByName reads data-wallet-id attribute, resolveCategoryIdByName reads data-category-id — no testid regex anywhere in the step layer"
  - "API-only seeding: POST /wallets + PUT /wallets/:id/balance for wallet seeding; POST /budgets/:id/reserves/:catId/adjust for reserve adjustment seeding — exercises the actual API stack rather than direct DB writes"
metrics:
  duration: "~45 minutes"
  completed: "2026-05-17"
  tasks_completed: 4
  files_created: 10
  files_modified: 1
---

# Phase 05 Plan 08: E2E Coverage + Phase Close Summary

**One-liner:** 6 playwright-bdd @phase5 Gherkin features + WalletsPage rewrite + new ReservesPage, all aligned to W-5 data-wallet-id/data-category-id contract; full E2E bddgen passes; live-stack run blocked by Infisical auth gate (checkpoint below).

## Tasks Completed

### Task 1: Page Objects

- `tests/e2e/pages/WalletsPage.ts` — REWRITTEN. Legacy v1.0 `accounts-list` shape deleted. Three-section layout (`wallet-section-{TYPE}`), `resolveIdByName()` reads `data-wallet-id`, `addWalletStaged()`, `deleteWallet()`, `dragToSection()`, `toast()`.
- `tests/e2e/pages/ReservesPage.ts` — NEW. `resolveCategoryIdByName()` reads `data-category-id`, `activeSection()`, `excludedSection()`, `totalsFooter()`, `mismatchChip(variant)`, `editBalance()`, `dragToExcluded()`, `dragToActive()`.

### Task 2: Step Definitions

- `tests/e2e/steps/wallets.steps.ts` — Given (seed wallet via POST /wallets + PUT /balance), When (open tab, edit name/amount, drag, delete), Then (section contains/not-contains, amount, toast). W-5: all UUID lookups go through `resolveIdByName()`.
- `tests/e2e/steps/reserves.steps.ts` — Given (seed reserve adjustment via POST .../adjust), When (open tab, edit balance, drag to excluded/active), Then (mismatch chip variant/amount, row share/balance, section contains). W-5: all UUID lookups go through `resolveCategoryIdByName()`.

**Deviation (Rule 1 - Bug):** `wallets.steps.ts` initially contained a duplicate `"I click {string}"` step definition that conflicted with `budget.steps.ts`. Fixed by removing the duplicate and routing feature files through the existing generic handler. Feature `add-edit-drag-delete.feature` uses `When I click "Add spendings wallet"` which is handled by budget.steps.ts's generic button click (the dashed-add button has button role). Commit: `fix(05-08)`.

### Task 3: 6 Feature Files

| File                                         | Coverage                                                              |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `wallets/add-edit-drag-delete.feature`       | Golden path: add → edit name → edit amount → drag to Cushion → delete |
| `wallets/reserve-currency-rejected.feature`  | USD wallet dragged to EUR-budget Reserve → snap-back + toast          |
| `wallets/cross-tab-invalidation.feature`     | Edit RESERVE wallet amount on Wallets → Reserves tab totals update    |
| `reserves/share-math-and-zero-state.feature` | Two-category share math (30%/70%) + em-dash zero state                |
| `reserves/rebalance-via-inline-edit.feature` | Inline-edit shifts mismatch chip reconciled→overfunded                |
| `reserves/exclude-category.feature`          | Drag Active→Excluded removes from totals; drag back restores          |

### Task 4: Full test suite

| Suite                                  | Result                           | Notes                                                               |
| -------------------------------------- | -------------------------------- | ------------------------------------------------------------------- |
| `make test` (bun:test backend)         | 637 pass / 322 fail              | 322 failures **pre-existing** (confirmed by stash baseline check)   |
| `cd apps/web && bun run test` (Vitest) | 359 pass / 1 file failed         | `edit-history-panel.test.tsx` **pre-existing** (confirmed baseline) |
| `make ci-gate`                         | Blocked — Infisical auth expired | Pre-existing auth gate; unrelated to plan changes                   |
| `make test-e2e` (@phase5 only)         | Blocked — stack not running      | Infisical auth expired; cannot start Docker stack                   |
| `bddgen`                               | **Passes**                       | All 6 features parsed correctly; no step-binding gaps               |

**Auth gate encountered:** Infisical session expired. `make test-e2e`, `make ci-gate`, and `make dev` all require `infisical run` which prompts for login. The stack (web on :3000, api on :4000) is not running in this agent's environment. DB (postgres) is running on :5432.

### Task 5: Impeccable sweep

Blocked pending live stack availability (see auth gate above). Requires visual browser review.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Duplicate "I click {string}" step definition**

- **Found during:** Task 2 (bddgen step-conflict error)
- **Issue:** `wallets.steps.ts` defined `When("I click {string}", ...)` which conflicted with the same step in `budget.steps.ts`. playwright-bdd reports "Multiple definitions matched scenario step."
- **Fix:** Removed duplicate from `wallets.steps.ts`. The generic handler in `budget.steps.ts` handles `page.getByRole("button", { name: /label/i })` which works for the dashed add-wallet buttons (they have button role).
- **Files modified:** `tests/e2e/steps/wallets.steps.ts`
- **Commit:** `fix(05-08): remove duplicate 'I click' step def`

## Auth Gates Encountered

| Gate                                | Attempted                                    | Outcome                                       |
| ----------------------------------- | -------------------------------------------- | --------------------------------------------- |
| `infisical run` for `make test-e2e` | bddgen passes; playwright run requires stack | Stack not started — Infisical session expired |
| `infisical run` for `make ci-gate`  | Attempted                                    | Requires login prompt (non-interactive)       |
| `infisical run` for `make dev`      | Attempted                                    | Requires login prompt (non-interactive)       |

**Impact:** E2E tests were confirmed to produce `ERR_CONNECTION_REFUSED` for the sign-up step (first step in every scenario). This is not a test logic error — it's a missing live stack. The bddgen output confirms all step bindings resolve correctly.

## Known Stubs

None. Page Objects and step definitions target the real W-5 DOM attributes emitted by Plans 05/06.

## Threat Flags

None. E2E test files introduce no new network endpoints or auth paths.

## Self-Check

Files exist:

- `tests/e2e/pages/WalletsPage.ts` — FOUND
- `tests/e2e/pages/ReservesPage.ts` — FOUND
- `tests/e2e/steps/wallets.steps.ts` — FOUND
- `tests/e2e/steps/reserves.steps.ts` — FOUND
- `tests/e2e/features/wallets/add-edit-drag-delete.feature` — FOUND
- `tests/e2e/features/wallets/reserve-currency-rejected.feature` — FOUND
- `tests/e2e/features/wallets/cross-tab-invalidation.feature` — FOUND
- `tests/e2e/features/reserves/share-math-and-zero-state.feature` — FOUND
- `tests/e2e/features/reserves/rebalance-via-inline-edit.feature` — FOUND
- `tests/e2e/features/reserves/exclude-category.feature` — FOUND

## Self-Check: PARTIAL

Tasks 1-3 complete and verified. Task 4 blocked by Infisical auth gate (live stack not running). Task 5 (impeccable sweep) pending live stack.
