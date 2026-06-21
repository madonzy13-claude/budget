---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: track)_
status: executing
stopped_at: "Phase 09: 6/7 plans complete (waves 1-3). Paused before 09-07 web UI (human-verify checkpoint) for fresh context."
last_updated: "2026-06-21T10:54:15.639Z"
last_activity: 2026-06-21
progress:
  total_phases: 9
  completed_phases: 8
  total_plans: 70
  completed_plans: 74
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-11 for v1.1 milestone)

**Core value:** A family can replace a complex personal-budget spreadsheet with a multi-user, multi-currency tool that tells them — through a single Tasks queue — exactly what to do this week to keep budget, reserve, and cushion healthy.
**Current focus:** Phase 09 — investments-wallet

## Current Position

Phase: 09 (investments-wallet) — EXECUTING
Plan: 7 of 7
Next: `/gsd-verify-work 08` — conversational UAT, then phase completion.
Status: Ready to execute
Last activity: 2026-06-21

### Known test-debt (non-CI, non-blocking)

CI does NOT run `packages/budgeting/test/**` or `apps/api/test/routes/**` integration suites. Two phase-07 verification gaps live there, so they do not gate merge:

- `packages/budgeting/test/tasks/reserve-topup.test.ts:610` — `it.skip("hourly sweep …")` still skipped (Plan 07-06 promised a real assertion).
- `resolve-idempotency.test.ts` / `cushion-summary` assertions flagged in 07-VERIFICATION.md (2026-05-31) — re-verify if those suites are ever wired into CI.

Phase-02 dead-table gap (`account_balance_adjustments`) is RESOLVED — only doc comments remain; route removed.

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
| Phase 05-reserves-wallets-tabs P08 | 180 | 5 tasks | 18 files |
| Phase 05 P12 | 31m | 3 tasks | 16 files |
| Phase 05 P13 | 23min | 3 tasks | 16 files |
| Phase 05 P14 | 25m | 2 tasks | 5 files |
| Phase 05 P19 | 25m | 3 tasks | 16 files |
| Phase 08 P08-05 | 18 | 4 tasks | 20 files |
| Phase 09 P01 | 12 min | 4 tasks | 12 files |
| Phase 09 P02 | 8 min | 2 tasks | 5 files |
| Phase 09 P05 | 18 min | 2 tasks | 7 files |
| Phase 09 P03 | 13 min | 2 tasks | 16 files |
| Phase 09 P04 | 60 min | 2 tasks | 14 files |
| Phase 09 P06 | 35 min | 3 tasks | 18 files |

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
- [Phase ?]: 05-12: get-reserve-positions is the replay orchestrator (event-loader → reserve-engine); reserves/spendings summaries consume engine cells
- [Phase ?]: 05-12: reserves DTO reshaped to reserve/used/overspent + internal/userDefined/surplus(+direction); old VIEW/actual/share/mismatch removed
- [Phase ?]: [Phase 05]: Plan 05-13 — reserve mutations rewritten to the replay model (delta-only adjust = target−currentR, userDefined-only wallet edits, surplus-driven RESERVE_TOPUP); greedy allocator + stored reserveActualCents deleted. Executed on tasks-redesign branch parallel to the main Phase-07 cursor.
- [Phase 05]: 05-14 — reserve HTTP contracts locked to the engine shape: /reserves rows{reserveCents,usedCents,overspentCents} + totals{internal,userDefined,surplus,direction,disabled,budgetCurrency}; adjust → {reserveCents,deltaCents,summary}; spendings carries reserveUsedCents+overspentCents+balanceCents (no reserveAvailableCents). Routes are thin forwarders — DTO shaped in the use-case, zero route field-logic change. Real-Postgres integration tests assert key-presence + dead-key absence + adjust ledger delta + disabled path (25 reserve-route tests green).
- [Phase 05]: 05-14 — reserve-balance-repo.ts is now fully orphaned: removed the BudgetingModule field (factory) + the dead boot constructions; getForBudget has ZERO live callers and budget-home-summary-repo reads category_limits, NOT the dropped category_reserve_balance VIEW → no live 500 risk. File deletion deferred to 05-16. Executed on tasks-redesign branch parallel to the Phase-07 cursor (which stays at plan 2 of 10).

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

### Plan 06-01 Decisions (recorded 2026-05-22, execution)

- D-06/ONBD-07: onboarding_progress is USER-SCOPED (app.current_user_id), not TENANT-SCOPED — one row per user, not per budget; pgPolicy predicate uses nullif(current_setting('app.current_user_id', true), '')::uuid
- shadcn new-york uses unified radix-ui ^1.4.3 package; accordion.tsx and switch.tsx import from 'radix-ui' directly (not @radix-ui/react-\* sub-packages); this is the current shadcn convention
- drizzle-kit BigInt serialization bug blocks npx drizzle-kit generate — hand-authored migration 0024 following Phases 1/5 precedent; journal entry registered manually

### Blockers/Concerns

- None blocking; roadmap is approved and dependency graph is clean
- Risk register in ROADMAP.md tracks 10 known risks across phases

## Quick Tasks Completed

| ID         | Date       | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Status                                           | Plan                                                                                 | Summary                                                                                    |
| ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 260507-m3x | 2026-05-07 | Migrate E2E tests to Gherkin (playwright-bdd) + Page Objects + freshUser fixture                                                                                                                                                                                                                                                                                                                                                                                                          | complete ✓                                       | [PLAN](quick/260507-m3x-migrate-e2e-tests-to-gherkin/260507-m3x-PLAN.md)             | [SUMMARY](quick/260507-m3x-migrate-e2e-tests-to-gherkin/260507-m3x-SUMMARY.md)             |
| 260611-vuo | 2026-06-11 | BDP archived-category fixes: full-width names, dead trash (42501 grants), column-wide reveal, unarchive lifecycle                                                                                                                                                                                                                                                                                                                                                                         | complete ✓                                       | [PLAN](quick/260611-vuo-bdp-archived-category-fixes-truncation-r/260611-vuo-PLAN.md) | [SUMMARY](quick/260611-vuo-bdp-archived-category-fixes-truncation-r/260611-vuo-SUMMARY.md) |
| 260612-a0c | 2026-06-12 | Shell safe-area regressions: standalone sheet bottom gap (in-sheet spacer), tasks banner under pinned header (moved into sticky band)                                                                                                                                                                                                                                                                                                                                                     | complete ✓                                       | [PLAN](quick/260612-a0c-fix-shell-safe-area-regressions-pwa-popu/260612-a0c-PLAN.md) | [SUMMARY](quick/260612-a0c-fix-shell-safe-area-regressions-pwa-popu/260612-a0c-SUMMARY.md) |
| 260612-cdu | 2026-06-12 | iOS shell round 2: sheet autofocus pan + top inset, banner below band, grid tail clearance, browser-mode clearance floor, black band (100dvh)                                                                                                                                                                                                                                                                                                                                             | complete ✓ (device T4 pending)                   | [PLAN](quick/260612-cdu-ios-shell-round-2-pwa-sheet-displacement/260612-cdu-PLAN.md) | [SUMMARY](quick/260612-cdu-ios-shell-round-2-pwa-sheet-displacement/260612-cdu-SUMMARY.md) |
| 260612-e82 | 2026-06-12 | iOS shell round 3: sheet X aligned to title, ResizeObserver-measured grid scroller (SHELL-R13), banner gutter trim                                                                                                                                                                                                                                                                                                                                                                        | complete ✓ (device pending)                      | [PLAN](quick/260612-e82-ios-shell-round-3-sheet-x-button-alignme/260612-e82-PLAN.md) | [SUMMARY](quick/260612-e82-ios-shell-round-3-sheet-x-button-alignme/260612-e82-SUMMARY.md) |
| 260612-g7v | 2026-06-12 | Spendings dead band: removed stacked clearances (SHELL-R14), lvh under-bar anchor + 96px browser spacer (SHELL-R15); PWA device-approved                                                                                                                                                                                                                                                                                                                                                  | complete ✓ (Safari device re-check pending)      | [PLAN](quick/260612-g7v-spendings-dead-band-remove-stacked-botto/260612-g7v-PLAN.md) | [SUMMARY](quick/260612-g7v-spendings-dead-band-remove-stacked-botto/260612-g7v-SUMMARY.md) |
| 260612-kxd | 2026-06-12 | Round 5: shell-root dvh cap revert (SHELL-R16), keyboard remeasure freeze, atomic CONFIRM_DRAFT closure on archive/delete + read self-heal                                                                                                                                                                                                                                                                                                                                                | complete ✓ (device checkpoint pending)           | [PLAN](quick/260612-kxd-shell-clip-chain-dvh-grid-keyboard-remea/260612-kxd-PLAN.md) | [SUMMARY](quick/260612-kxd-shell-clip-chain-dvh-grid-keyboard-remea/260612-kxd-SUMMARY.md) |
| 260612-t6s | 2026-06-12 | Round 6: grid box to physical screen bottom on iOS Safari (SHELL-R17, gated screen-anchor + dynamic spacer), BDP tab-switch scroll reset (Safari-only month occlusion)                                                                                                                                                                                                                                                                                                                    | complete ✓ (device checkpoint pending)           | [PLAN](quick/260612-t6s-grid-box-to-physical-screen-bottom-on-io/260612-t6s-PLAN.md) | [SUMMARY](quick/260612-t6s-grid-box-to-physical-screen-bottom-on-io/260612-t6s-SUMMARY.md) |
| 260613-aw9 | 2026-06-13 | Round 7: tab-switch month occlusion real fix (SHELL-R18) — reset window/scrollingElement (not just main, which is overflow:visible in browser) keyed on pathname; de-tautologized e2e scrolls real window root on tall reserves tab                                                                                                                                                                                                                                                       | complete ✓ (device checkpoint pending)           | [PLAN](quick/260613-aw9-tab-switch-month-occlusion-persists-rese/260613-aw9-PLAN.md) | [SUMMARY](quick/260613-aw9-tab-switch-month-occlusion-persists-rese/260613-aw9-SUMMARY.md) |
| 260613-dn1 | 2026-06-13 | Budget home page perf: tx-scoped `SET LOCAL jit=off` on listForUser (later found INEFFECTIVE live — see hig), appPool max:25, React cache() dedup of /budgets/active (2×→1×), parallelized home-summary meta+FX                                                                                                                                                                                                                                                                           | complete ✓ (superseded by hig for the JIT issue) | [PLAN](quick/260613-dn1-budget-home-page-perf-jit-off-on-listfor/260613-dn1-PLAN.md) | [SUMMARY](quick/260613-dn1-budget-home-page-perf-jit-off-on-listfor/260613-dn1-SUMMARY.md) |
| 260613-hig | 2026-06-13 | Budget nav perf: scoped pending-tasks subquery to user's budgets via LATERAL + dropped `::text` cast (uuid PK) + `budget_members(user_id)` index → /budgets/active live 1900ms→~60ms (no JIT, cost 47); loading.tsx skeletons (6); Better Auth cookieCache                                                                                                                                                                                                                                | complete ✓ (live-verified)                       | [PLAN](quick/260613-hig-budget-nav-perf-scope-pending-tasks-subq/260613-hig-PLAN.md) | [SUMMARY](quick/260613-hig-budget-nav-perf-scope-pending-tasks-subq/260613-hig-SUMMARY.md) |
| 260613-jp6 | 2026-06-13 | Spendings loading skeleton now mirrors the column-card grid (month nav + 3 column cards w/ planned/overspent/reserves/left rows + expenses input) instead of a generic list                                                                                                                                                                                                                                                                                                               | complete ✓ (deployed)                            | —                                                                                    | [SUMMARY](quick/260613-jp6-spendings-loading-tsx-skeleton-must-mirr/260613-jp6-SUMMARY.md) |
| 260613-nkb | 2026-06-13 | Fix currency change blocked on zero-transaction budgets: dropped stale `budgets_currency_immutable` DB trigger (migration 0035 + post-migration.sql), relaxed Better Auth hook to transaction-aware rule; app guard preserves lock-after-first-transaction. Live: zero-tx EUR→USD 200, with-tx 409                                                                                                                                                                                        | complete ✓ (live-verified)                       | [PLAN](quick/260613-nkb-fix-currency-change-blocked-on-zero-tran/260613-nkb-PLAN.md) | [SUMMARY](quick/260613-nkb-fix-currency-change-blocked-on-zero-tran/260613-nkb-SUMMARY.md) |
| 260613-pdb | 2026-06-13 | Reserves noCategories shortened to one row (en/pl/uk); cushion preview hidden when required=0 (no "Have 0 of 0 — target met"); BDP double-skeleton collapsed to one via non-suspending layout + Suspense data child (membership gate preserved), deleted generic loading.tsx                                                                                                                                                                                                              | complete ✓ (live e2e 5/5)                        | [PLAN](quick/260613-pdb-reserves-nocategories-one-row-text-hide-/260613-pdb-PLAN.md) | [SUMMARY](quick/260613-pdb-reserves-nocategories-one-row-text-hide-/260613-pdb-SUMMARY.md) |
| 260613-v1p | 2026-06-13 | Category color: persisted end-to-end (migration 0036 color_key — was never stored before; zod silently dropped it), rendered as 4px left accent bar on spendings columns + reserves rows (shared category-colors map); removed dead icon picker (no icon_key column ever existed)                                                                                                                                                                                                         | complete ✓ (live-verified)                       | [PLAN](quick/260613-v1p-remove-category-icon-picker-render-categ/260613-v1p-PLAN.md) | [SUMMARY](quick/260613-v1p-remove-category-icon-picker-render-categ/260613-v1p-SUMMARY.md) |
| 260615-e8s | 2026-06-15 | Offline UX 4 fixes: CloudOff→Unplug icon; Tooltip→Popover (tap-to-close, no reopen race); wired the DEAD offline data layer (cacheBudgetSnapshot writer mounted in spendings+wallets islands + per-tab **global** sync-meta bump; IDB read-back fallback in per-entity hooks; new active-budgets store + home write-island via RSC-children). Caught+fixed an RSC boundary build break (client island must not import server-only HomeCardsGrid). 64 Vitest green, served bundle verified | complete ✓ (device checkpoint pending)           | [PLAN](quick/260615-e8s-offline-render/260615-e8s-PLAN.md)                           | [SUMMARY](quick/260615-e8s-offline-render/260615-e8s-SUMMARY.md)                           |

## Deferred Items

| Category | Item | Status | Deferred At |
| -------- | ---- | ------ | ----------- |
| _(none)_ |      |        |             |

### Plan 05-11 Decisions (recorded 2026-06-05, execution)

- Reset reserve persistence to replay-on-read (decision B): migration 0030 dropped `categories.reserve_actual_cents` + the `category_reserve_balance` VIEW (applied to live DB; types regenerate from new shape). Kept `category_reserve_adjustments`, `reserves_enabled`, archive cols, `budget_mode_history`, RESERVE wallets.
- Added `ReserveEventLoaderRepo` (clean port + Drizzle adapter) returning the 8 raw `ReserveEventInputs` the keystone `reserve-engine.ts` consumes; raw→`ReserveEngineEvent[]` mapping deferred to the 05-12 orchestrator. Adapter composes existing ports + in-adapter SQL only.
- Removed the orphaned `GRANT SELECT ON budgeting.category_reserve_balance` from `apps/migrator/post-migration.sql` (ran on every migrate, errored 42P01 after the VIEW drop).
- Deferred (05-13/05-16): ~18 src files + boot.ts still reference the dropped VIEW / `createReserveBalanceRepo`; compile-clean but VIEW reads now fail at query time until 05-12 swaps to the event loader.

## Session Continuity

Last session: 2026-06-21T10:54:15.616Z
Stopped at: Phase 09: 6/7 plans complete (waves 1-3). Paused before 09-07 web UI (human-verify checkpoint) for fresh context.
Resume file: .planning/phases/09-investments-wallet/09-07-PLAN.md

## v1.0 History (archived)

v1.0 milestone (Phases 1–2 shipped, Phases 3–6 frozen) is archived at:

- `.planning/archive/v1.0/ROADMAP.md`
- `.planning/archive/v1.0/REQUIREMENTS.md`

v1.0 carried-forward production capabilities are listed in `REQUIREMENTS.md` § v1.0 Validated.
