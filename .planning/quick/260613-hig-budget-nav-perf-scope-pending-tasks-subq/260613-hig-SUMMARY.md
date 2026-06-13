---
quick_id: 260613-hig
phase: quick
plan: 260613-hig
subsystem: budgeting/tenancy/identity/web
tags:
  [
    perf,
    query,
    sql,
    lateral,
    uuid-cast,
    index,
    migration,
    loading,
    skeleton,
    cookieCache,
  ]
dependency_graph:
  requires: [260613-dn1]
  provides:
    [
      scoped-lateral-tk-query,
      budget_members_user_id_idx,
      loading-skeletons,
      cookie-cache,
    ]
  affects: [GET /budgets/active, BDP navigation, session lookup]
tech_stack:
  added: []
  patterns: [LATERAL subquery scoping, uuid-cast guard, signed cookie cache]
key_files:
  created:
    - drizzle/0034_budget_nav_perf_indexes.sql
    - apps/web/src/app/[locale]/(app)/loading.tsx
    - apps/web/src/app/[locale]/(app)/budgets/[id]/loading.tsx
    - apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/loading.tsx
    - apps/web/src/app/[locale]/(app)/budgets/[id]/wallets/loading.tsx
    - apps/web/src/app/[locale]/(app)/budgets/[id]/reserves/loading.tsx
    - apps/web/src/app/[locale]/(app)/budgets/[id]/settings/loading.tsx
  modified:
    - packages/tenancy/src/adapters/persistence/workspace-repo.ts
    - packages/budgeting/src/adapters/persistence/task-repo.ts
    - drizzle/meta/_journal.json
    - apps/api/test/routes/budgets-active.test.ts
    - packages/identity/src/adapters/persistence/better-auth.ts
decisions:
  - "LATERAL correlation (t.budget_id = w.id) chosen over GROUP BY + IN-list — cleaner, no raw IN-list injection risk, lets planner restrict to the outer budget's rows"
  - "Regex uuid guard before ::uuid cast — belt-and-suspenders for legacy/malformed rows; evaluated left-to-right in AND"
  - "No tasks(status,budget_id) composite index added — EXPLAIN after LATERAL rewrite shows cost 47 (well below 100k); budget_id index already used by LATERAL correlation"
  - "cookieCache maxAge=60s — short enough for prompt revocation, long enough to cover a full page nav cycle (~8 concurrent fetches)"
  - "refreshCache omitted — stateful DB setup; including it causes a warning + no-op"
metrics:
  duration: "~25 min"
  completed: "2026-06-13"
  tasks: 3
  files: 12
---

# Quick Task 260613-hig: Budget Nav Perf — LATERAL Scoping + UUID Cast + Index

**One-liner:** LATERAL-scoped pending-tasks subquery (cost 47 vs 504k), uuid PK cast fix, budget_members(user_id) index, 6 loading.tsx skeletons, 60s cookieCache — GET /budgets/active drops from ~1900ms to 45ms median.

## Before / After Timings

| Metric                     | Before (260613-dn1)              | After (260613-hig)             |
| -------------------------- | -------------------------------- | ------------------------------ |
| GET /budgets/active median | ~1900ms (JIT: ~882ms compile)    | **45ms**                       |
| EXPLAIN Total Cost         | ~504k (superuser BYPASSRLS path) | **47.09** (app_role real GUCs) |
| JIT block in EXPLAIN       | Yes (Functions > 0)              | **None**                       |
| Session DB lookups per nav | ~8 (one per API fetch)           | **0** (signed cookie cache)    |

Note: 260613-dn1 used `SET LOCAL jit=off` as a mitigation. That GUC was confirmed ineffective in the live extended-protocol path. This task eliminates the JIT trigger by construction: cost 47 < jit_above_cost 100k regardless of the jit GUC.

## EXPLAIN Proof (app_role, real GUCs)

```
EXPLAIN (FORMAT JSON, ANALYZE FALSE) — as app_role with real app.tenant_ids GUC:

Total Cost: 47.09
JIT: (none)
```

Root plan node cost **47.09** — 10,000× below jit_above_cost (100k). By-construction fix, independent of `SET LOCAL jit=off` (left in place as harmless defense-in-depth).

## Index Decision

**Added:** `budget_members_user_id_idx` on `tenancy.budget_members(user_id)` — turns the WHERE/INNER JOIN `m.user_id = $1` predicate from a seq-scan of 7679 rows into an index scan. Also improves planner row-count estimates.

**Not added:** `tasks(status, budget_id)` composite index — after the LATERAL rewrite, the planner uses the existing `budget_id` FK index for the correlation and filters `status='PENDING'` as a cheap post-scan predicate at ~15-row scale. No measurable improvement from a composite index (cost already 47).

## Banner Parity

All 11 tests in `budgets-active.test.ts` pass:

- 3 unit (mock listForUser, no DB)
- 8 integration (real Postgres):
  - pendingTasksCount=0/2, RESOLVED not counted
  - JIT GUC structural test
  - Identical rows correctness guard
  - Banner parity (orphan CONFIRM_DRAFT, Maczfit archived-category shape)
  - **NEW** 260613-hig multi-budget archived+orphan fixture (budget B isolation)
  - **NEW** 260613-hig EXPLAIN cost gate (app_role, cost < 100k, no JIT block)

Both `workspace-repo.ts` `tk` LATERAL and `task-repo.ts` `listPending` use identical predicates with the uuid-cast fix — parity test enforces this.

## Auth Revocation

`session.cookieCache { enabled: true, maxAge: 60 }` added to Better Auth config. The signed session data cookie appears in sign-in response (`better-auth.session_data`). `refreshCache` intentionally omitted (stateful DB setup) — Better Auth uses the `cookieRefreshCache=false` path (cookie read only, no DB round-trip). Session DB remains source of truth; revocation takes effect within 60s (browser also stops sending the session_token cookie immediately on sign-out).

## Skeletons

6 `loading.tsx` files created — zero existed before this task:

- `(app)/loading.tsx` — 3-column BudgetCardSkeleton grid
- `budgets/[id]/loading.tsx` — sticky pills band + content block
- `spendings/loading.tsx` — month header + 8 expense rows
- `wallets/loading.tsx` — summary card + 4 wallet rows
- `reserves/loading.tsx` — totals grid + 6 reserve rows with progress bar
- `settings/loading.tsx` — 5 label+input rows + action button

All use `Skeleton` (`bg-primary/10 animate-pulse`) and existing DESIGN.md tokens (`--canvas-dark`, `--surface-card-dark`, `--hairline-dark`, `--radius-xl`). No new colors or fonts. Build compiles cleanly (`✓ Compiled successfully in 51s`).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. The LATERAL query preserves all RLS tenant joins (`el.tenant_id = t.tenant_id`, `c.tenant_id = el.tenant_id`). ci-gate: 51 pass, 0 fail.

## Commits

| Hash       | Message                                                                               |
| ---------- | ------------------------------------------------------------------------------------- |
| c3154bf    | feat(260613-hig-T1): scope tk LATERAL + uuid-cast fix + budget_members(user_id) index |
| (lint fix) | fix(260613-hig-T1): remove unused r variable in EXPLAIN test (eslint)                 |
| 6a7fbc2    | feat(260613-hig-T2): add loading.tsx Suspense skeletons for home + BDP segments       |
| eb37224    | feat(260613-hig-T3): enable Better Auth session.cookieCache (60s TTL)                 |

## Self-Check: PASSED

- workspace-repo.ts LATERAL query: present, no `::text` cast remains
- task-repo.ts uuid-cast fix: present, comment references 260613-hig
- drizzle/0034_budget_nav_perf_indexes.sql: exists
- budget_members_user_id_idx: confirmed in `\d tenancy.budget_members`
- All 6 loading.tsx: confirmed present
- better-auth.ts session.cookieCache: present
- Live median: 45ms (was ~1900ms)
- EXPLAIN cost: 47.09 (< 100k), no JIT block
- ci-gate: 51 pass, 0 fail
