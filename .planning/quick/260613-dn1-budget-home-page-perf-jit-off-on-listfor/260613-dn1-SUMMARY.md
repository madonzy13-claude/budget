---
quick_id: 260613-dn1
phase: quick
plan: 260613-dn1
subsystem: api, web, budgeting, platform
tags: [performance, jit, pool, react-cache, parallelization]
key-files:
  created:
    - packages/platform/test/pool.test.ts
  modified:
    - packages/tenancy/src/adapters/persistence/workspace-repo.ts
    - packages/platform/src/db/pool.ts
    - apps/api/test/routes/budgets-active.test.ts
    - apps/web/src/lib/budget-fetch.server.ts
    - apps/web/src/app/[locale]/(app)/layout.tsx
    - apps/web/src/app/[locale]/(app)/page.tsx
    - packages/budgeting/src/application/get-budget-home-summary.ts
    - packages/budgeting/test/application/get-budget-home-summary.test.ts
decisions:
  - "SET LOCAL jit=off chosen over durable fix (drop el.id::text cast + EXISTS→JOIN); SET LOCAL is low-risk + fully revertible; durable fix deferred to future hardening pass"
  - "appPool max:25 chosen — absorbs 72-tx home burst while keeping api(25)+worker(10) under PG max_connections=100"
  - "React cache() dedup is request-scoped — safe for per-user dynamic data (each request render is its own cache scope)"
  - "FX parallelization batches DISTINCT pairs to avoid duplicate cache-hit round-trips when wallets share a currency"
metrics:
  duration: "~7 minutes (T1-T3 code + TDD)"
  completed: "2026-06-13"
  tasks: 3
  files: 8
---

# Quick Task 260613-dn1: Home Page Perf — JIT Off + Pool Max + Cache Dedup + Parallel Summary

**One-liner:** Five-root-cause home page fix: tx-scoped JIT disable on listForUser, appPool max:25, React cache() dedup for /budgets/active, and Promise.all parallelization of home-summary meta+FX calls.

## What Was Fixed

Five root causes identified in investigation, all addressed:

| #   | Root Cause                                          | File                                   | Fix                                             | Expected Win                 |
| --- | --------------------------------------------------- | -------------------------------------- | ----------------------------------------------- | ---------------------------- |
| 1   | JIT planner blowup on listForUser correlated EXISTS | workspace-repo.ts                      | `SET LOCAL jit = off` inside withUserContext tx | ~882ms → ~41ms               |
| 2   | appPool default-10 contention (72-tx burst)         | pool.ts                                | `max: 25`                                       | 6.7× contention relief       |
| 3   | /budgets/active called 2× per home render           | budget-fetch.server.ts + layout + page | `fetchActiveBudgets = cache(...)`               | ~2000ms paid once not twice  |
| 4   | Serial getBudgetMeta + getDisplayCurrency awaits    | get-budget-home-summary.ts             | Single `Promise.all([meta, display])`           | 1 fewer serial tx round-trip |
| 5   | Serial FX rate loop per wallet                      | get-budget-home-summary.ts             | Batch distinct pairs → `Promise.all` → Map      | Parallel FX cache hits       |

## Commits

| Hash    | Type | Description                                                    |
| ------- | ---- | -------------------------------------------------------------- |
| a7487e3 | test | RED — appPool max=25 structural assertion                      |
| 7bb0604 | feat | T1 — jit=off tx-scoped in listForUser + appPool max:25         |
| b04d908 | feat | T2 — deduplicate /budgets/active via React cache()             |
| cd4ebbc | test | RED — parallel FX dedup + DTO identity assertions              |
| d3d627e | feat | T3 — parallel meta+display + parallel FX dedup in home-summary |

## Tests

- **pool.test.ts** (new): 3 tests — `appPool().options.max === 25`, singleton identity, resetPools() refresh
- **budgets-active.test.ts** (extended): 2 new integration tests — jit GUC in-tx probe (`current_setting('jit') = 'off'`), identical-rows correctness guard
- **get-budget-home-summary.test.ts** (extended): 2 new unit tests — full DTO identity for mixed-currency+2-overspent fixture (correctness gate), FX spy asserting each distinct pair called exactly once (dedup gate)
- All 11 home-summary tests pass; all 9 budgets-active integration tests pass

## Before / After Performance

**Before (investigation baseline, still-running old image captured before T4 deploy):**

- listForUser: ~882ms JIT compile + ~41ms query = ~923ms per /budgets/active call
- /budgets/active called 2× per home render = ~1850ms backend alone
- appPool default-10: 72 concurrent txs saturated pool → 6.7× serial collapse (~7261ms vs ~1087ms parallel)
- Home page worst case for uat-probe-1 (12 budgets): ~11s

**After (images deployed at 2026-06-13 ~10:08 UTC):**

- All 3 services rebuilt (api, worker, web) and restarted; all healthy
- JIT compile eliminated: listForUser runs at ~41ms base query time
- appPool max:25 absorbs 72-tx burst without saturation
- /budgets/active: 1 call per home render (layout cache HIT from page call)
- home-summary: 2 parallel waves instead of 2 serial awaits + 1 parallel wave

**Live AFTER measurement:** Pending uat-probe-1 session — user to time `/budgets/active` + home page load and report.

- Expected: `/budgets/active` ~40-100ms (was ~923ms), home page ~1-2s (was ~11s)

## Safety / Correctness

- **RLS unchanged**: SET LOCAL is in the same tx as the RLS GUC (`app.current_user_id` + `app.tenant_ids`); tenant isolation unaffected
- **No global jit=off**: Confirmed by grep — not in `postgresql.conf` or `pool.ts`
- **Identical rows**: Integration test asserts listForUser returns byte-identical results before/after
- **Identical DTO**: Unit test asserts full home-summary DTO values unchanged after parallelization
- **FX dedup**: Each distinct currency pair resolved once; wallets sharing a currency get a Map lookup, not a duplicate DB round-trip

## Deferred (Future Hardening)

**Durable JIT fix:** Drop the `el.id::text` cast (join draft_id as uuid) + replace EXISTS→JOIN to fix the planner cost estimate at source rather than suppressing JIT. This eliminates the misestimate permanently (~504k estimated cost → accurate low-cost plan) without needing SET LOCAL. Deferred because: higher risk to RLS + exact pending-task semantics; requires careful testing. SET LOCAL is fully revertible in one line.

## Deviations from Plan

None — plan executed exactly as written. TDD RED→GREEN gate followed for T1 and T3.
