---
phase: 11-budget-overview
plan: 07
subsystem: worker
tags: [worker, pg-boss, cron, snapshots, rls, idempotent, wealth]

# Dependency graph
requires:
  - phase: 11-budget-overview
    provides: budget_wealth_snapshots table + bucket index (11-01); computeBudgetWealthNow (11-03)
provides:
  - "budget-wealth-snapshot-3h pg-boss handler (run + register)"
  - "worker schedule cron 0 */3 * * * (after price/fx refresh)"
affects: [11-06, 11-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "withInfraTx scans DISTINCT budgets (id only) → per-budget withTenantTx write (RLS GUC scoped to one tenant), mirrors budgeting-reconciliation"
    - "Idempotent ON CONFLICT on the (budget_id, date_trunc('hour', captured_at AT TIME ZONE 'UTC')) expression index; RETURNING id → honest inserted count"

key-files:
  created:
    - apps/worker/src/handlers/budget-wealth-snapshot-3h.ts
    - apps/worker/test/handlers/budget-wealth-snapshot-3h.test.ts
  modified:
    - apps/worker/src/worker.ts
    - apps/migrator/post-migration.sql

key-decisions:
  - "The cron writes via withTenantTx, which uses the app_role pool — so app_role needs INSERT on budget_wealth_snapshots. 11-01 granted INSERT to worker_role only, which contradicted this plan's own threat model T-11-02 (the write runs inside withTenantTx). Fixed the grant (app_role INSERT) + applied to the running DB."
  - "tenancy.budgets has NO tenant_id column (v1.1: budget_id === tenant_id). The plan's example scan SELECT'd a non-existent tenant_id; corrected to `id AS tenant_id`."
  - "computeBudgetWealthNow is built INSIDE the handler from ComputeBudgetWealthNowDeps (keeps the key_link literal in the file) and reused with the same investments-module valuation as the API card — consistent numbers."
  - "RETURNING id makes the inserted counter honest: a same-hour re-run logs inserted=0 (ON CONFLICT no-op)."

patterns-established:
  - "Worker constructs its own investments module (createInvestmentsModule with the existing priceProvider + appPool) to value holdings for the snapshot — mirrors the API boot."

requirements-completed: [SC8, D-04]

# Metrics
duration: 60 min
completed: 2026-06-28
---

# Phase 11 Plan 07: 3h Budget Wealth Snapshot Cron Summary

**pg-boss handler that snapshots every budget's wealth every 3h via the shared computeBudgetWealthNow primitive — one idempotent row per budget per UTC-hour bucket, written under a per-tenant RLS GUC. Scheduled after the price/fx refresh. Real-DB integration test: one row/budget in default_ccy, idempotent re-run, tenant-scoped.**

## Performance

- **Duration:** ~60 min (incl. 2 real-DB bugs found by the test)
- **Completed:** 2026-06-28
- **Tasks:** 3 (handler, worker schedule, integration test)
- **Files modified:** 4

## Accomplishments

- `runBudgetWealthSnapshot3h` / `registerBudgetWealthSnapshot3h`: withInfraTx budget scan → per-budget computeBudgetWealthNow → idempotent INSERT under withTenantTx(TenantId, SYSTEM_USER). Per-budget try/catch (one failure doesn't abort the batch).
- worker.ts: queue + `schedule("budget-wealth-snapshot-3h", "0 */3 * * *", …)` after the investment refresh; builds the investments module + holdingsValuation + wallet repo deps.
- Real-Postgres integration test: 2 budgets (USD/EUR), one row each in default_ccy, idempotent re-run, RLS cross-tenant invisibility.

## Task Commits

1. **Handler + worker wiring** — `feat(11-07): 3h budget wealth snapshot cron + worker wiring`.
2. **Test + fixes** — `feat(11-07): snapshot integration test + fix scan (v1.1 tenant_id) + app_role INSERT grant`.

## Decisions Made

See key-decisions frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] app_role lacked INSERT on budget_wealth_snapshots**

- **Found during:** Task 3 — `permission denied for table budget_wealth_snapshots`.
- **Cause:** 11-01 granted INSERT to worker_role only, but the cron writes via withTenantTx (app_role pool) per its own threat model T-11-02. The two plans disagreed.
- **Fix:** `GRANT INSERT … TO app_role, worker_role` in post-migration.sql + applied to the running DB.
- **Verification:** integration test inserts + reads succeed.

**2. [Rule 1 - Bug] scan referenced a non-existent tenant_id column**

- **Found during:** Task 3 — `42703 errorMissingColumn` (swallowed by the scan's err-default, surfaced via a probe).
- **Cause:** the plan's example `SELECT … tenant_id FROM tenancy.budgets`; that table has only `id` (v1.1: budget_id === tenant_id).
- **Fix:** `SELECT id AS budget_id, id AS tenant_id, default_currency`.
- **Verification:** scan now returns all budgets (scanned=405 in the test DB).

**3. [Polish] honest inserted counter**

- The counter incremented per attempt; on a no-op re-run it logged "inserted=403". Added `RETURNING id` and increment by rows returned → re-run logs inserted=0.

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 polish).
**Impact on plan:** Same behavior; corrected the grant/scan so the cron actually writes; honest ops metric.

## Issues Encountered

- infisical/Tailscale down → integration test runs with DATABASE_URL_APP + DATABASE_URL_WORKER sourced from the api container; the app_role INSERT grant was applied via psql (see [[project_infisical_down_db_workaround]]). On a clean `make migrate`, post-migration.sql applies it automatically.

## User Setup Required

- On the next real migration run, post-migration.sql re-applies the app_role INSERT grant (already hot-applied to the dev DB here).

## Next Phase Readiness

- Wave 2 complete (11-06 service + 11-07 cron). The wealth series now has both a live point (read) and a growing history (cron). UI work (11-08/11-09) can consume all four overview endpoints.
- **Verification caveat:** `make test`/`make ci-gate` (infisical-wrapped) not run; the handler test + full typecheck run directly green. The worker-boot schedule line is verified by grep; a live worker-boot log check is deferred to phase validation.

---

_Phase: 11-budget-overview_
_Completed: 2026-06-28_
