---
phase: 09-investments-wallet
plan: 05
subsystem: testing
tags: [tenant-leak, ci-gate, playwright-bdd, gherkin, rls, scaffold, nyquist]

# Dependency graph
requires:
  - phase: 09-investments-wallet
    provides: "09-01 budgeting.investments table + RLS (the gate probe targets it live)"
provides:
  - "Investments route integration scaffold (apps/api/test/routes/investments.test.ts, skipped pending 09-06)"
  - "Live tenant-leak RLS probe for budgeting.investments (runs in make ci-gate today)"
  - "budgeting.investments registered in USER-DATA-TABLES.txt (force-rls gate covers it)"
  - "@investments-wallet Gherkin feature + InvestmentsPo + step bindings (gated @skip-phase-09-debt)"
affects: [09-06, 09-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tenant-leak registration = USER-DATA-TABLES.txt line + a tests/tenant-leak/*-cross-tenant.test.ts probe (no central config file)"
    - "E2E scaffold gated via a @skip-phase-09-debt feature tag excluded in playwright.config defineBddConfig tags"

key-files:
  created:
    - apps/api/test/routes/investments.test.ts
    - tests/tenant-leak/investments-cross-tenant.test.ts
    - apps/web/e2e/features/investments-wallet.feature
    - apps/web/e2e/page-objects/InvestmentsPo.ts
    - apps/web/e2e/steps/investments.steps.ts
  modified:
    - tests/tenant-leak/USER-DATA-TABLES.txt
    - apps/web/playwright.config.ts

key-decisions:
  - "Tenant-leak gate is directory-based (tests/tenant-leak/*.test.ts + USER-DATA-TABLES.txt) — there is NO apps/api/test/ci-gate/tenant-leak.config.ts as the plan assumed; registered via the real mechanism"
  - "Wrote the cross-tenant RLS probe as a LIVE test (not it.skip) since budgeting.investments already exists from 09-01 — stronger than the planned skipped scaffold"
  - "E2E paths follow repo convention: features/ + page-objects/ (PascalCasePo.ts), not the plan's e2e/<feature>.feature + pages/<feature>-po.ts"
  - "bunfig.toml needs NO change — coverage globs already match packages/* (investments domain tests already counted)"
  - "Gated the feature with @skip-phase-09-debt (excluded in playwright.config) so make test-e2e stays green until 09-07 un-skips"

patterns-established:
  - "New tenant-scoped table -> add to USER-DATA-TABLES.txt + add a cross-tenant probe in the same gate run"

requirements-completed: [INV-01, INV-02, INV-03, INV-06, INV-11, INV-14, INV-16]

# Metrics
duration: 18min
completed: 2026-06-21
---

# Phase 9 Plan 05: Wave-0 Test Scaffolding Summary

**Nyquist scaffolds for the investments routes/E2E/ci-gate: a skipped route integration shell, a LIVE cross-tenant RLS gate probe for budgeting.investments, and an @investments-wallet Gherkin feature + Page Object + steps — so no downstream task ships with a MISSING automated verify.**

## Performance

- **Duration:** ~18 min (incl. dev-stack restore after ci-gate teardown)
- **Tasks:** 2
- **Files:** 5 created, 2 modified
- **Gate:** `make ci-gate` → 54 pass / 0 fail across 15 files (includes the new investments probe + force-rls coverage of budgeting.investments)

## Accomplishments

- Route scaffold `apps/api/test/routes/investments.test.ts` (3 it.skip placeholders, 09-06 fills).
- `budgeting.investments` registered in the tenant-leak gate: USER-DATA-TABLES.txt (force-rls coverage) + a live `withTenantTx` cross-tenant probe asserting tenant A's holdings are invisible under tenant B's GUC (T-9-13).
- `@investments-wallet` feature (4 scenarios: flag visibility, add-custom, drag-into-group, optimistic-create) + `InvestmentsPo` selector contract + step bindings — `bunx bddgen` green.

## Task Commits

1. **Route scaffold + tenant-leak registration** — `f73b61a` (test)
2. **@investments-wallet e2e scaffold** — `23b908d` (test)

## Decisions Made

See key-decisions frontmatter — the plan's assumed paths (ci-gate config, e2e/pages, bunfig enumeration) did not match the repo; used the real mechanisms.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/path-mismatch] Plan referenced non-existent paths; used the real repo structure**

- **Found during:** Task 1 & 2 (read_first exploration)
- **Issue:** Plan listed `apps/api/test/ci-gate/tenant-leak.config.ts` (no such file — the gate is directory-based: `tests/tenant-leak/*.test.ts` + `USER-DATA-TABLES.txt`), `apps/web/e2e/investments-wallet.feature` / `pages/investments-po.ts` (real layout is `e2e/features/` + `e2e/page-objects/<Name>Po.ts`), and `bunfig.toml` (coverage already glob-covers packages/\*).
- **Fix:** Registered investments via USER-DATA-TABLES.txt + a live cross-tenant probe; placed the feature/PO/steps under the real e2e dirs; left bunfig untouched; added `not @skip-phase-09-debt` to playwright.config defineBddConfig tags to gate the unbuilt UI.
- **Files modified:** USER-DATA-TABLES.txt, playwright.config.ts (in place of the planned tenant-leak.config.ts + bunfig.toml)
- **Verification:** `make ci-gate` 54 pass/0 fail; `bunx bddgen` exit 0; `bun run typecheck` clean.
- **Committed in:** `f73b61a`, `23b908d`

**2. [Rule 2 - Missing Critical] dev compose stack must be restarted after make ci-gate**

- **Found during:** post-gate verification
- **Issue:** `make ci-gate` (run-tenant-leak.sh) brings the compose project DOWN at the end, stopping the shared dev stack (db/api/web/worker/cloudflared).
- **Fix:** `infisical run --env=dev -- docker compose --env-file .env --env-file .env.local up -d` — all services healthy again; migrator re-applied 0038.
- **Files modified:** none (ops)
- **Verification:** docker ps shows db/api/web healthy.

---

**Total deviations:** 2 auto-fixed (path-mismatch + ops). **Impact:** Plan intent fully met via the real mechanisms. No scope creep.

## Issues Encountered

- `make ci-gate` exits 1 due to the PRE-EXISTING coverage-threshold artifact (tenant-leak tests pull transitive imports → ~aggregate < 80%; documented in STATE.md Pending Todos). All 54 security tests pass / 0 fail — not a regression from this plan.

## User Setup Required

None.

## Next Phase Readiness

- 09-06 un-skips `apps/api/test/routes/investments.test.ts` and fills the route harness.
- 09-07 removes the `@skip-phase-09-debt` tag + the playwright.config clause and implements the InvestmentsPo data-testid contract.

---

_Phase: 09-investments-wallet_
_Completed: 2026-06-21_
