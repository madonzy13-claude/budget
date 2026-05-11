---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Budget Restructure
status: completed
stopped_at: Phase 1 context gathered
last_updated: "2026-05-11T18:16:37.698Z"
last_activity: 2026-05-11 — v1.1 ROADMAP.md created
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-11 for v1.1 milestone)

**Core value:** A family can replace a complex personal-budget spreadsheet with a multi-user, multi-currency tool that tells them — through a single Tasks queue — exactly what to do this week to keep budget, reserve, and cushion healthy.
**Current focus:** v1.1 Budget Restructure — roadmap landed (8 phases), planning Phase 1 next

## Current Position

Phase: Phase 1 — Schema Migration & Rename Foundation (not yet planned)
Plan: —
Status: Roadmap complete (126/126 REQ-IDs mapped); awaiting `/gsd-plan-phase 1`
Last activity: 2026-05-11 — v1.1 ROADMAP.md created

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v1.1 — v1.0 history archived)
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase                                       | Plans | Total | Avg/Plan |
| ------------------------------------------- | ----- | ----- | -------- |
| 1. Schema Migration & Rename Foundation     | 0/TBD | —     | —        |
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

### Pending Todos

- `/gsd-plan-phase 1` — plan the Schema Migration & Rename Foundation
- Decide cushion-mode history storage (SCD-2 mini-table vs audit-log snapshot) in Phase 1 plan
- Decide reserves auto-compute as regular view vs materialized view in Phase 2 plan
- Probe Better Auth orgs invite-token revocation API in Phase 2 spike

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

Last session: 2026-05-11T18:16:37.661Z
Stopped at: Phase 1 context gathered
Resume file: .planning/phases/01-schema-migration-rename-foundation/01-CONTEXT.md

## v1.0 History (archived)

v1.0 milestone (Phases 1–2 shipped, Phases 3–6 frozen) is archived at:

- `.planning/archive/v1.0/ROADMAP.md`
- `.planning/archive/v1.0/REQUIREMENTS.md`

v1.0 carried-forward production capabilities are listed in `REQUIREMENTS.md` § v1.0 Validated.
