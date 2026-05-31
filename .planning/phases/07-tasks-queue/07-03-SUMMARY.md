---
phase: 07-tasks-queue
plan: 03
subsystem: budgeting
tags: [tasks, cushion, fx, application-service, integration-tests]

requires:
  - phase: 07-tasks-queue
    provides:
      "07-01: tenancy.budgets.cushion_target_months column + 3-kind chk + dedup
      partial indexes + cushion-math.test.ts scaffold (9 it.todo stubs)"
  - phase: 07-tasks-queue
    provides: "07-02: TaskRepo.emitCushionBelowTarget + resolveByKindAndBudget +
      adapter implementations against migration 0026 indexes"
  - phase: 02-recurring-engine
    provides: "computeRecurringFx (bounds-checked FX with 0<rate<1e6 guard) +
      FxProviderLike interface"
provides:
  - "computeCushionSummary(tx, input) — pure shape function for cushion math;
    reads tenancy.budgets, budgeting.category_limits (active SCD-2 row),
    budgeting.wallets (wallet_type='CUSHION'); FX-converts non-budget-currency
    wallets via computeRecurringFx with TODAY as as-of date (Pitfall 5)"
  - "getCushionSummary(deps) — application service factory wrapping the pure
    function in withTenantTx; returned closure exposes Result<CushionSummaryDTO,Error>
    for the GET /budgets/:id/cushion-summary HTTP endpoint (Plan 07)"
  - "recomputeCushionTask(tx, input, deps) — single create-or-resolve helper
    for CUSHION_BELOW_TARGET; called by every mutation that can change
    cushion shortfall (Plans 04/05/06/07); idempotent at the DB layer"
  - "cushion-math.test.ts — 9 passing integration tests against real Postgres
    covering Nyquist case set from 07-VALIDATION.md"
affects: [07-04, 07-05, 07-06, 07-07]

tech-stack:
  added: []
  patterns:
    - "Pure shape function + closure-over-deps factory pair: shape works on an
      OPEN tx (composable inside an already-running withTenantTx); factory opens
      its own tx for the HTTP service entry-point. Same pattern as
      reserves-summary-builder + getReservesSummary."
    - "FX as-of TODAY for live snapshots, NOT transaction date (Pitfall 5).
      Cushion summary answers 'what does my cushion look like RIGHT NOW' —
      NOT 'reconstruct the cushion at point in time T'."
    - "Reuse of computeRecurringFx for bounds check + same-currency short-circuit
      — Don't-hand-roll-FX rule honoured across the codebase."
    - "Create-or-resolve helper encapsulates branching so 6+ mutation sites
      don't fork on shortfall sign themselves (D-PH7-24)."

key-files:
  created:
    - "packages/budgeting/src/application/get-cushion-summary.ts"
    - "packages/budgeting/src/application/recompute-cushion-task.ts"
  modified:
    - "packages/budgeting/test/tasks/cushion-math.test.ts"
    - "packages/budgeting/package.json"

key-decisions:
  - "Read canonical cushion_amount (NOT v1.1 parallel cushion_amount_cents) for
    parity with budget-home-summary-repo.ts. The plan's PATTERNS snippet said
    cushion_amount_cents but the existing canonical reader uses cushion_amount
    and that column is NOT NULL — choosing parity over the plan literal text
    prevents reader-drift between the cushion path and the budget-home path."
  - "Filter category_limits / wallets by tenant_id only (no budget_id col on
    either table). The plan SQL referenced budget_id; live schema disagrees.
    v1.1 invariant `tenant_id === budget_id` makes the substitution safe."
  - "Wallet amount derived from current_balance numeric(19,4) at the boundary
    via (current_balance * 100)::bigint::text. The plan instructions said
    amount_cents but wallets has no such column."
  - "Use FxProviderLike (string from/to, returns { rate, provider, isStale })
    instead of shared-kernel FxProvider (Currency-typed). The
    `computeRecurringFx` we reuse accepts FxProviderLike; matching its
    interface avoids a needless cast at the boundary."

patterns-established:
  - "RLS gotcha in raw pg.Pool test helpers: set_config(..., true) is
    transaction-local — SELECTs and UPDATEs that depend on app.tenant_ids
    MUST wrap themselves in BEGIN/COMMIT. Tests that do `await client.query
    (set_config)` then `await client.query(SELECT)` outside a transaction see
    an empty GUC, and RLS filters every row. Codified across all 6 raw helpers
    in cushion-math.test.ts (seedBudget, countPendingCushionTasks,
    readPendingCushionPayload, seedPendingCushionTask, setBudgetCushion*,
    setCategoryCushionAmount, inline wallet insert)."
  - "Wave 0 (07-01) lays the scaffold (`it.todo`), Wave 1 plan (07-03) replaces
    each stub with a passing test as part of the same plan that ships the
    implementation. RED-phase is the existing scaffold; this plan is GREEN."

requirements-completed: [TASK-04]

duration: ~13min
completed: 2026-05-31
---

# Phase 07 Plan 03: Cushion Math Foundation

**Single source of cushion math (`get-cushion-summary.ts`) + create-or-resolve
helper (`recompute-cushion-task.ts`) + 9-case Nyquist coverage against real
Postgres. Wave 2 mutation sites can now call one function per write without
duplicating math or branching on shortfall sign.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-05-31T10:10:47Z
- **Completed:** 2026-05-31T10:23:33Z
- **Tasks:** 3 / 3
- **Files modified:** 4 (2 new application files + test scaffold rewrite + package.json exports)

## Accomplishments

- `get-cushion-summary.ts` implements the math formula from D-PH7-16 verbatim:
  - required = Σ(category_limits.cushion_amount at PIT) × budgets.cushion_target_months
  - actual = Σ(wallets WHERE wallet_type='CUSHION') FX→budget currency
  - shortfall = required − actual (signed bigint)
- Pure shape `computeCushionSummary(tx, input)` composes inside an existing
  withTenantTx; closure-over-deps `getCushionSummary(deps)` is the HTTP entry-point
  factory ready for Plan 07's GET /budgets/:id/cushion-summary route.
- Short-circuit when `cushion_enabled=false` skips category_limits / wallets reads
  entirely — returns all-zero DTO with `enabled:false`.
- FX uses `Temporal.Now.plainDateISO()` (TODAY) as as-of, per Pitfall 5 in
  07-RESEARCH.md, and reuses `computeRecurringFx` so the `0 < rate < 1e6` bounds
  check is honoured without duplication.
- `recompute-cushion-task.ts` exports the create-or-resolve helper Plans
  04/05/06/07 will call. tx is mandatory (compile-time guard against caller
  forgetting to scope; T-07-03-05 mitigation). Zero drizzle-orm / hono imports
  — hex boundary clean.
- 9 cushion-math integration tests pass against real Postgres (`bun test
packages/budgeting/test/tasks/cushion-math.test.ts` → 9 pass / 0 fail / 1.88s).

## Task Commits

1. **Task 1: get-cushion-summary application service** — `905c27b` (feat)
2. **Task 2: recompute-cushion-task shared helper** — `e490092` (feat)
3. **Task 3: Replace 9 cushion-math it.todo stubs with passing tests** — `1d240da` (test)

## Files Created/Modified

- `packages/budgeting/src/application/get-cushion-summary.ts` — NEW (209
  insertions). Pure shape + factory pair. Imports
  computeRecurringFx, sql, Temporal, withTenantTx, Result.
- `packages/budgeting/src/application/recompute-cushion-task.ts` — NEW (99
  insertions). Single create-or-resolve helper. Imports computeCushionSummary
  - TaskRepo port + FxProviderLike. Zero adapter/HTTP imports.
- `packages/budgeting/test/tasks/cushion-math.test.ts` — REWRITTEN. 35 lines
  of scaffold (9 it.todo) replaced with 781 lines of integration tests
  (seed helpers + 9 passing it() blocks + 6 raw-pg helpers all using
  BEGIN/COMMIT for set_config scope).
- `packages/budgeting/package.json` — added 2 export paths:
  `./src/application/get-cushion-summary` and
  `./src/application/recompute-cushion-task`. Bun resolves package exports
  strictly; without these entries the new dynamic imports in the test file
  fail with "Cannot find module".

## Decisions Made

- **Canonical column choice: `cushion_amount` over `cushion_amount_cents`.**
  Plan PATTERNS snippet referenced `cushion_amount_cents`. The live schema has
  BOTH (cushion_amount is NOT NULL canonical bigint cents; cushion_amount_cents
  is the v1.1 parallel nullable column from MIG-05). budget-home-summary-repo.ts
  reads `cushion_amount` and its module comment explicitly calls that the
  canonical choice. Aligning the cushion-summary reader with the existing
  canonical reader prevents drift if a future migration backfills or rotates
  one of the columns. If/when MIG-05's `cushion_amount_cents` rollout finishes,
  both readers swap together.
- **tenant_id-only filtering (no budget_id column on category_limits / wallets).**
  Plan SQL referenced `budget_id = ${input.budgetId}::uuid`; the live schema
  shows neither table has a budget_id column. v1.1 invariant
  `tenant_id === budget_id` makes filtering on tenant_id sufficient and
  defence-in-depth correct (RLS already scopes to app.tenant_ids).
- **current_balance numeric → bigint cents at boundary.**
  Plan instructions said wallets has `amount_cents`. Real schema has
  `current_balance numeric(19,4)`. Conversion is `(current_balance * 100)::bigint`
  inside the SQL — same pattern budget-home-summary-repo.ts uses.
- **FxProviderLike over shared-kernel FxProvider.**
  `computeRecurringFx` accepts `FxProviderLike` (string from/to). Matching that
  interface skips an unnecessary Currency-branded cast and stays consistent with
  every other reuser of computeRecurringFx.
- **Per-test fresh budget isolation; no cleanup helper.**
  Each test seeds its own randomUUID budget. Cushion partial unique index is
  scoped (budget_id, kind, status='PENDING') so cross-test rows never collide.
  Cheaper than DELETE-by-id cleanup and gives natural test-isolation semantics.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan SQL assumed columns that do not exist on the live schema**

- **Found during:** Task 1 (authoring get-cushion-summary.ts)
- **Issue:** Plan's SQL referenced `category_limits.cushion_amount_cents`,
  `category_limits.budget_id`, `wallets.amount_cents`, `wallets.budget_id`,
  `wallets.sort_index`. Live schema (confirmed via `\d` on
  `budgeting.category_limits` and `budgeting.wallets`) has different names:
  `cushion_amount` (canonical), no `budget_id` (tenant-scoped only),
  `current_balance numeric(19,4)`, `sort_order`.
- **Fix:** Rewrote SQL to use canonical column names; convert numeric → bigint
  cents at the SQL boundary; filter on tenant_id only.
- **Files modified:** packages/budgeting/src/application/get-cushion-summary.ts +
  packages/budgeting/test/tasks/cushion-math.test.ts (seed SQL).
- **Committed in:** 905c27b, 1d240da.

**2. [Rule 3 - Blocking] `temporal-polyfill` not installed in worktree**

- **Found during:** Task 3 (running cushion-math tests)
- **Issue:** Worktree was checked out without `node_modules`. The
  `import { Temporal } from "temporal-polyfill"` line in get-cushion-summary.ts
  could not be resolved at test runtime. tsc had warned about the same.
- **Fix:** Ran `bun install` from the worktree root. 1152 packages installed
  in 1.3s. Same dependency declaration already lived in
  packages/budgeting/package.json; this is workspace install hygiene, not a
  code change.
- **Verification:** bunx tsc --noEmit from packages/budgeting/ went from 69
  errors to 15 errors (the 54-error drop is exactly the temporal-polyfill
  cannot-find-module diagnostics across all importers).

**3. [Rule 3 - Blocking] Bun package exports missing for new modules**

- **Found during:** Task 3 (running cushion-math tests)
- **Issue:** packages/budgeting/package.json's `exports` map gates which paths
  are importable from outside the package. The new
  `./src/application/get-cushion-summary` and `./src/application/recompute-cushion-task`
  paths were not in the map, so the test's dynamic import failed with
  "Cannot find module '@budget/budgeting/src/application/get-cushion-summary'".
- **Fix:** Added both paths to the exports map next to
  `./src/application/list-pending-tasks` (alphabetical neighbour).
- **Files modified:** packages/budgeting/package.json
- **Committed in:** 1d240da.

**4. [Rule 1 - Bug] Raw pg.Pool test helpers ran `set_config(..., true)`
outside a transaction (RLS filtered every row)**

- **Found during:** Task 3 (5 of 9 tests failed with `expected 1 received 0`)
- **Issue:** `set_config('app.tenant_ids', '{...}', true)` is transaction-local
  per Postgres docs. The helpers `countPendingCushionTasks`,
  `readPendingCushionPayload`, `setBudgetCushionEnabled`,
  `setBudgetCushionTargetMonths`, and the inline wallet INSERT in test 5 ran
  the GUC SELECT and the target SELECT/UPDATE as separate auto-commit queries,
  so the GUC reset immediately and the target query saw an empty
  `app.tenant_ids`. RLS then filtered every row.
- **Fix:** Wrapped every GUC-dependent helper in `BEGIN; ... COMMIT;` with a
  `ROLLBACK` on the catch path.
- **Verification:** bun test packages/budgeting/test/tasks/cushion-math.test.ts
  → 9 pass / 0 fail / 1.88s.
- **Committed in:** 1d240da.

---

**Total deviations:** 4 auto-fixed. Two were live-schema vs plan-text mismatches
(Rule 1), two were environment hygiene (Rule 3). None of them changes the
shipped contract or the Phase 7 math formula.

**Impact on plan:** Plan PATTERNS / instructions sections need a follow-up
correction pass: column names, set_config transaction-locality, package
exports policy, worktree node_modules install. Flagged for retrospective.

## Issues Encountered

- **Worktree had no `node_modules` after creation.** Required `bun install` (no
  state change beyond the symlink farm). Future executor agents should always
  `bun install` once before running tests. Memory note candidate:
  "worktree needs bun install".
- **Pre-existing tsc baseline = 69 errors.** Plan said 15 (likely test files
  weren't being counted). After my changes + `bun install`, total = 15
  (54-error drop from temporal-polyfill resolving). Zero NEW errors introduced
  by Phase 7 changes (verified via `comm -23 after baseline`).
- **Bun pre-commit linter merged whitespace/comment formatting on the test
  file** — purely cosmetic, no logic change.

## Next Phase Readiness

- **Plan 04 (CONFIRM_DRAFT generator):** does not depend on this plan but the
  emit-or-resolve pattern in `recomputeCushionTask` is the template the
  confirm-draft generator will mirror.
- **Plan 05 (RESERVE_TOPUP generator):** same template.
- **Plan 06 (recompute hooks):** the four wallet mutation sites
  (set-wallet-balance, update-wallet, create-wallet, archive-wallet) plus
  set-category-limit and the budgets PATCH route will all call
  `recomputeCushionTask(tx, ..., {taskRepo, fxProvider})` inside their existing
  withTenantTx. No branching, no math duplication.
- **Plan 07 (API routes):** GET /budgets/:id/cushion-summary will wire
  `getCushionSummary({ fxProvider })` into apps/api/src/boot.ts next to
  listPendingTasks. DTO shape (`required_cents` / `actual_cents` /
  `shortfall_cents` / `currency` / `enabled` / `target_months`) is final.

---

_Phase: 07-tasks-queue_
_Plan: 03_
_Completed: 2026-05-31_
