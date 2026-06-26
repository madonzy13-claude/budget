---
phase: 09-investments-wallet
plan: 06
subsystem: api
tags: [hono, zod, use-cases, factory, rls, rate-limit, fx-enrichment, flag]

# Dependency graph
requires:
  - phase: 09-investments-wallet
    provides: "09-01 tables/api_rate_limits; 09-02 metrics; 09-03 repos/composite; 09-05 route scaffold"
provides:
  - "Investments API surface: contracts + 7 use-cases + factory"
  - "Hono /budgets/:budgetId/investments route (CRUD + search + reorder + on-add fetch)"
  - "investments_enabled plumbed PATCH + GET DTO end-to-end"
affects: [09-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Enriched list: HoldingRepo cache-JOIN (tracked) + portfolio-metrics + memoized FX rate map"
    - "On-add fetch rate-limited via api_rate_limits atomic upsert (10/user/min); blocks save on no-price (A2)"
    - "Holding bigint cents serialized to string at the route boundary (c.json can't serialize BigInt)"

key-files:
  created:
    - packages/investments/src/contracts/api.ts
    - packages/investments/src/contracts/factory.ts
    - packages/investments/src/application/{create,update,archive,list,reorder}-holding(s).ts
    - packages/investments/src/application/search-instruments.ts
    - packages/investments/src/application/fetch-instrument-price.ts
    - apps/api/src/routes/investments.ts
  modified:
    - packages/investments/src/index.ts, package.json
    - apps/api/src/{boot.ts,app.ts}, apps/api/src/routes/{budget-identity.ts,budgets.ts}
    - apps/api/package.json, apps/api/Dockerfile, apps/migrator/Dockerfile, apps/migrator/post-migration.sql
    - packages/tenancy/src/{adapters/persistence/workspace-repo.ts,ports/budget-repo.ts,contracts/api.ts}
    - packages/shared-kernel/src/env.ts
    - apps/api/test/routes/investments.test.ts

key-decisions:
  - "Price fetch + block-on-no-price lives in the separate POST /price/:instrumentId endpoint (frontend fetches before create); create-holding just persists"
  - "Read-time cache JOIN lives in HoldingRepo.listForBudget (09-03); list-holdings consumes it + layers metrics — keeps the DTO boundary in the use-case"
  - "isDelisted returned false in the list (surfaced via the 09-04 task); per-row chrome deferred to P07"
  - "app_role granted INSERT/UPDATE on instrument_price_cache (the on-add fetch writes the cache)"

requirements-completed:
  [INV-01, INV-03, INV-04, INV-05, INV-07, INV-08, INV-09, INV-10, INV-14]

# Metrics
duration: 35min
completed: 2026-06-21
---

# Phase 9 Plan 06: Investments API Surface Summary

**Full investments server contract — Zod contracts + 7 use-cases + DI factory + Hono CRUD/search/reorder/on-add-fetch route + investments_enabled flag plumbing — with cache-price-wins enrichment and a 10/user/min on-add rate limit. 4 route tests green on real Postgres; API boots healthy.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3 (contracts/use-cases/factory; route + wiring; flag + un-skip tests)
- **Files:** 18 created/modified
- **Tests:** 4 route integration tests pass / 0 fail (round-trip, cross-tenant RLS, cache-wins, rate-limit); full monorepo typecheck clean; API rebuilt + restarted healthy.

## Accomplishments

- Contracts (9-value holdingTypeSchema, create/update/reorder/search) + 7 use-cases + `createInvestmentsModule`.
- `createInvestmentsRoute` mounted at `/budgets/:budgetId/investments`; bigint cents serialized at the boundary; error map (404/422/429); reorder guards `holding_id_not_in_section` (T-9-15).
- `listHoldings` enriches value / P-L % / weight % in budget ccy; **tracked holdings read the refreshed instrument_price_cache price (cache wins over the add-time row price — B4/INV-08), proven by test**.
- On-add `fetchInstrumentPrice` rate-limited 10/user/min via the api_rate_limits atomic counter; 11th → 429 (proven).
- `investments_enabled` round-trips PATCH → GET DTO (mirrors cushion_enabled).

## Task Commits

1. **Contracts + use-cases + factory** — `6e45590` (feat)
2. **Route + boot/app wiring** — `22af372` (feat)
3. **Flag plumbing + un-skip tests** — `779f5ac` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] app_role cache-write grant + Dockerfile/dep propagation**

- The on-add fetch writes instrument_price_cache, but 09-01 granted app_role SELECT-only → added INSERT/UPDATE (post-migration, re-migrated). apps/api needed @budget/investments dep + the api AND migrator Dockerfiles needed `COPY packages/investments/package.json` (bun only links depended-on workspaces; the migrator install resolves the whole workspace). Committed `22af372`.

**2. [Rule 1 - Bug] BigInt serialization + investments exports**

- `c.json(Holding)` throws on bigint → added a route serializer. investments `exports` lacked `./src/contracts/*` → added. Committed `6e45590`/`22af372`.

---

**Total deviations:** 2 auto-fixed. **Impact:** essential for the route to run + serialize + resolve. No scope creep.

## Issues Encountered

- `make ci-gate` not re-run here (it tears down the dev stack); cross-tenant RLS is proven by the route test, and the budgeting.investments tenant-leak probe passed in 09-05's gate run. Re-run at phase verification.

## User Setup Required

Price-provider API keys (env: TWELVE_DATA_API_KEY / COINGECKO_API_KEY / METALS_DEV_API_KEY) — the on-add fetch blocks the save without them.

## Next Phase Readiness

- 09-07 consumes this contract: flag toggle (INV-01), CRUD (INV-03/04), group autocomplete (INV-05), search (INV-07), enriched read (INV-08/09/10), rate-limited add (INV-14).

---

_Phase: 09-investments-wallet_
_Completed: 2026-06-21_
