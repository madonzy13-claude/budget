---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: milestone
status: executing
stopped_at: Phase 04 UI-SPEC approved
last_updated: "2026-05-13T16:23:28.862Z"
last_activity: 2026-05-13 -- Phase 04 execution started
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 22
  completed_plans: 17
  percent: 77
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-11 for v1.1 milestone)

**Core value:** A family can replace a complex personal-budget spreadsheet with a multi-user, multi-currency tool that tells them — through a single Tasks queue — exactly what to do this week to keep budget, reserve, and cushion healthy.
**Current focus:** Phase 04 — Spendings Grid

## Current Position

Phase: 04 (Spendings Grid) — EXECUTING
Plan: 1 of 5
Status: Executing Phase 04
Last activity: 2026-05-13 -- Phase 04 execution started

## Phase 3 Plans

| Plan  | Wave | Title                                                                                 | Reqs                            | Depends       |
| ----- | ---- | ------------------------------------------------------------------------------------- | ------------------------------- | ------------- |
| 03-01 | 0    | Wave 0 prep: React Query + playwright-bdd install; delete /workspaces tree            | NAV-05                          | —             |
| 03-02 | 1    | Backend: GET /budgets/:id/home-summary + FxProvider conversion                        | HOME-01, HOME-02                | [03-01]       |
| 03-03 | 2    | Backend: GET /budgets/:id/tasks?status=pending read shell                             | BDP-03                          | [03-01]       |
| 03-04 | 3    | BudgetSwitcher + NewBudgetButton + TopNav + (app) layout + middleware x-pathname      | NAV-01..04                      | [03-01,02]    |
| 03-05 | 4    | Home / route: BudgetCard async RSC + Suspense grid + placeholder chart + empty hero   | HOME-01..04                     | [03-02,04]    |
| 03-06 | 5    | BDP frame: pill tabs + sticky shell + task banner + 4 placeholder tabs + /budgets/new | BDP-01..05                      | [03-03,04]    |
| 03-07 | 6    | PL/UK i18n + 4 Gherkin features (playwright-bdd) + Page Objects + Makefile            | NAV-04, HOME-03, BDP-01, BDP-05 | [03-04,05,06] |

## Phase 1 Plans (archived)

| Plan  | Title                                                                                   | Reqs                         | Depends |
| ----- | --------------------------------------------------------------------------------------- | ---------------------------- | ------- |
| 01-01 | Schema migration + post-migration.sql + dev DB nuke + CI fixture retarget               | MIG-01..09, MIG-13 (backend) | —       |
| 01-02 | Domain entity rename (Workspace→Budget, Account→Wallet) + categories.scope drop cascade | MIG-12                       | 01-01   |
| 01-03 | Hono route rename + middleware header rename (X-Workspace-ID→X-Budget-ID)               | MIG-11                       | 01-02   |
| 01-04 | i18n EN/PL/UK + web client + ci-gate Playwright verification                            | MIG-10, MIG-13 (Playwright)  | 01-03   |

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v1.1 — v1.0 history archived)
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase                                       | Plans | Total | Avg/Plan |
| ------------------------------------------- | ----- | ----- | -------- |
| 1. Schema Migration & Rename Foundation     | 4/4   | ~185m | ~46m     |
| 2. Domain & API Restructure                 | 0/TBD | —     | —        |
| 3. Navigation, Home & BDP Frame             | 0/TBD | —     | —        |
| 4. Spendings Grid                           | 0/TBD | —     | —        |
| 5. Reserves & Wallets Tabs                  | 0/TBD | —     | —        |
| 6. Settings, Onboarding & Share UI          | 0/TBD | —     | —        |
| 7. Tasks Queue                              | 0/TBD | —     | —        |
| 8. PWA, Offline, Push, i18n & E2E Hardening | 0/TBD | —     | —        |

**Recent Trend:**

- Last 5 plans: none in v1.1 (v1.0 history archived to `.planning/archive/v1.0/`)
- Trend: —

_Updated after each plan completion_
| Phase 03 P02 | 85min | 3 tasks | 8 files |
| Phase 3 P3 | 32 | - tasks | - files |
| Phase 03-navigation-home-bdp-frame P04 | 8min | 3 tasks | 11 files |
| Phase 3 P5 | 11min | 2 tasks | 9 files |
| Phase 03 P06 | 12 min | 3 tasks | 15 files |
| Phase 03 P07 | 17 min | 3 tasks | 13 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

**Carried-forward from v1.0 (still in force after restructure):**

- Postgres + tenant_id + RLS (not schema-per-tenant); app + worker roles have NO BYPASSRLS; FORCE ROW LEVEL SECURITY on all user-data tables
- Better Auth + organization plugin (used for SHARED budgets; app-facing label "shared budget")
- Drizzle (not Prisma) for first-class `pgPolicy()` RLS
- Crypto-shredding day 1 — PII columns separated from ledger
- dependency-cruiser CI rule — `domain/` cannot import `drizzle-orm`, Hono, AI SDK, or `adapters/`
- 80% domain coverage threshold in `bunfig.toml`
- TransactionRepo split surface: create() delegates to createInTx()
- FX freshness gate (60-min server-side threshold; 409 FxRateStale with freshRate payload)
- Web app avoids bundling pg/drizzle: getSupportedCurrencies() fetches /api/currencies endpoint

**v1.1 milestone decisions (from v1.1-SPEC.md):**

- Rename workspace→budget and account→wallet at every layer in one mega-migration
- Drop `transaction.kind` / `account_id` / `to_account_id` / `direction` — transactions are categorical-only
- wallet_type enum is display-only (SPENDINGS / CUSHION / RESERVE); no income/transfer ledger
- Reserves auto-compute via SQL view (materialized view as fallback in plan-phase)
- Cushion-mode is a budget-wide toggle with history tracked (SCD-2 mini-table or audit-log snapshot — decision deferred to Phase 1 plan)
- Tasks queue: 4 deterministic generators (RESERVE_TOPUP / CONFIRM_DRAFT / STALE_WALLET / MONTH_END_REVIEW)
- Recurring drafts surface only in Spendings grid as highlighted rows (standalone inbox UI removed)
- Share-link only invite flow (no email send required) via Better Auth orgs invite-token
- Dev DB nuked — no data preservation; acceptable because no prod deploy
- [Phase ?]: Phase 3-02: UserDisplayCurrencyReader local port avoids budgeting → identity coupling; FxProvider adapted to rateAsOf; tenant-leak gate 5→6 files
- [Phase ?]: BDP-03 backend shell ships as port + service + adapter + sub-router trio mirroring HOME-02
- [Phase ?]: Tenant-leak gate adds one file per new tenant-scoped endpoint; BDP-03 increments 6 -> 7 files
- [Phase ?]: Plan 03-04: Header z-index bumped from z-40 to z-50 so BudgetSwitcher PopoverContent z-[60] floats above and BDP sticky wrapper z-40 (Plan 03-06) renders below.
- [Phase ?]: Plan 03-04: Middleware OVERWRITES x-pathname (not set-if-absent) to discard any client-supplied value — T-03-04-06 mitigation.
- [Phase 3]: Plan 3-5: lucide v1.14 renames BarChart3 → ChartColumn; tests accept svg.lucide-chart-column OR svg.lucide-bar-chart-3 for stability across upgrades
- [Phase 3]: Plan 3-5: BudgetCard error path keeps Link wrapper so card always routes to /budgets/[id]/spendings — tenant guard enforces access at BDP
- [Phase 3]: Plan 3-5: Async-RSC + RTL test pattern — await Component({props}) then render(ui); mock @/lib/budget-fetch.server + next-intl/server.getTranslations
- [Phase ?]: Plan 03-06: i18n bdp.tab.\* nested {label, title, placeholder} shape locked upfront in Task 1 (BLOCKER #11 resolution)
- [Phase ?]: Plan 03-06: TaskBanner 60s polling test asserts DELTA across vi.advanceTimersByTimeAsync(60_000) rather than exact mount-time call count
- [Phase 3]: Plan 03-07: Better Auth cookie-copy via /auth/sign-up/email POST + context.addCookies() — preferred over UI form-fill because it survives sign-in form evolution
- [Phase 3]: Plan 03-07: Dynamic `import('pg')` in E2E task-seeding step keeps pg out of the web bundle
- [Phase 3]: Plan 03-07: DATABASE_URL_APP rewriter (@db: -> @localhost:) lets E2E steps run from host AND inside compose net
- [Phase 3]: Plan 03-07: Empty-user step inlines signup (rather than swapping fixtures) because playwright-bdd binds steps to a single test extender

### Pending Todos

- Phase 1 complete — begin Phase 2 planning (Domain & API Restructure)
- Decide reserves auto-compute as regular view vs materialized view in Phase 2 plan
- Probe Better Auth orgs invite-token revocation API in Phase 2 spike
- Investigate pre-existing make ci-gate coverage threshold failure (tenant-leak tests pull transitive imports; ~51% aggregate vs 80% threshold — security tests all pass 25/25)

### Plan 01-01 Decisions (recorded 2026-05-11, execution)

- Conditional DO block for workspace_share_dirty rename — fresh DB installs skip (post-migration.sql creates budget_share_dirty directly)
- wallet_type stored as text+CHECK in Drizzle schema, PG ENUM in migration SQL — easier future ALTER TYPE

### Plan 01-02 Decisions (recorded 2026-05-11, execution)

- Backward-compat shims: account.ts/account-repo.ts/workspace.ts/workspace-repo.ts kept with re-exports for Plan 01-03 migration period
- D-07 minimum compile-fix: TransactionRow.kind and TransactionRow.accountId TypeScript fields preserved; SQL INSERTs/SELECTs drop account_id/kind only — Phase 2 reshapes TS types
- Better Auth organizationId carve-out confirmed: schema.ts organizationId JS field maps to budget_id SQL column per Better Auth org plugin contract
- Backward-compat export aliases on all renamed Drizzle tables — avoids cascading compile failures before 01-02
- tasks table ownership DO block in migration handles postgres-superuser dev installs
- drizzle-kit TTY limitation requires hand-authored migration; journal entry registered manually

### Phase 1 Late Decisions (recorded 2026-05-11, post-research)

- D-10: Header `X-Workspace-ID` → `X-Budget-ID` renamed in lockstep with routes/tables
- D-11: Cushion column stays `cushion_amount` (already exists in schema); `_cents` suffix not applied
- D-12: `balance_adjustments` retained (WALT-03 manual edit path); FK cols renamed
- D-13: `categories.scope` dropped (redundant with budget-level visibility); cascades through ~8 files

### Plan 01-04 Decisions (recorded 2026-05-11, execution)

- workspace-fetch.ts/workspace-fetch.server.ts kept as backward-compat shims re-exporting from budget-fetch to avoid missed import paths
- D-13 scope cascade: filter chips UI, category form, E2E steps, i18n keys all cleaned up in single plan
- Migration 0012 made idempotent via DO $$ IF EXISTS $$ wrappers — Postgres lacks IF EXISTS on RENAME TABLE
- Function ownership fix needed for dev DB (postgres-owned functions from prior superuser post-migration.sql run); fresh DB (CI) creates correctly
- make ci-gate coverage threshold failure is pre-existing (tenant-leak transitive imports pull uncovered packages); 25/25 security tests pass

### Blockers/Concerns

- None blocking; roadmap is approved and dependency graph is clean
- Risk register in ROADMAP.md tracks 10 known risks across phases

## Quick Tasks Completed

| ID         | Date       | Task                                                                             | Status     | Plan                                                                     | Summary                                                                        |
| ---------- | ---------- | -------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 260507-m3x | 2026-05-07 | Migrate E2E tests to Gherkin (playwright-bdd) + Page Objects + freshUser fixture | complete ✓ | [PLAN](quick/260507-m3x-migrate-e2e-tests-to-gherkin/260507-m3x-PLAN.md) | [SUMMARY](quick/260507-m3x-migrate-e2e-tests-to-gherkin/260507-m3x-SUMMARY.md) |

## Deferred Items

| Category | Item | Status | Deferred At |
| -------- | ---- | ------ | ----------- |
| _(none)_ |      |        |             |

## Session Continuity

Last session: 2026-05-13T14:30:04.534Z
Stopped at: Phase 04 UI-SPEC approved
Resume file: .planning/phases/04-spendings-grid/04-UI-SPEC.md

## v1.0 History (archived)

v1.0 milestone (Phases 1–2 shipped, Phases 3–6 frozen) is archived at:

- `.planning/archive/v1.0/ROADMAP.md`
- `.planning/archive/v1.0/REQUIREMENTS.md`

v1.0 carried-forward production capabilities are listed in `REQUIREMENTS.md` § v1.0 Validated.
