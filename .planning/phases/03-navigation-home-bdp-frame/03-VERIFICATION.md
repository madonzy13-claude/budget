---
phase: 03-navigation-home-bdp-frame
verified: 2026-05-13T00:22:00Z
status: human_needed
score: 14/14 must-haves verified (code-level); make test-e2e run pending live verification
re_verification:
  previous_status: none
  previous_score: 0/0
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Run `make test-e2e` against the live dev stack and confirm all 17 Gherkin scenarios pass"
    expected: "17/17 green across nav-switcher.feature (4), home.feature (4), bdp-tab-frame.feature (5), task-banner.feature (4)"
    why_human: "Plan 03-07 explicitly defers the green run to phase-verification time. Verifier did not invoke the live stack to keep verification fast and deterministic. Plan-level evidence (feature files parse, page objects + Better-Auth-backed fresh-user fixture in place, Makefile target present, typecheck exit 0) establishes the scaffolding is intact; a green E2E run is the only piece that requires the running stack."
  - test: "Open `/budgets/[id]` in Chrome DevTools and confirm active pill renders with --primary yellow accent matching DESIGN.md"
    expected: "Active pill computed background-color = DESIGN.md --primary token (yellow)"
    why_human: "BDP-04 visual fidelity — component test asserts class names but not computed pixel color"
  - test: "Open BudgetSwitcher and verify Lock vs Users glyph for Personal vs Shared budgets"
    expected: "Personal rows show Lock icon, Shared rows show Users icon"
    why_human: "NAV-01 — icon glyph correctness is visual"
  - test: "Scroll the BDP page and confirm the sticky tabs+banner wrapper stays at top with the documented shadow"
    expected: "z-40 sticky wrapper stays at top:64px under z-50 top-nav; shadow appears per DESIGN.md --shadow-sticky"
    why_human: "BDP-01 sticky CSS — Playwright can assert position, but the shadow is decorative"
---

# Phase 3: Navigation, Home & BDP Frame — Verification Report

**Phase Goal (from ROADMAP.md):** Replace the v1.0 sidebar+pages chrome with the v1.1 top-nav budget switcher + combined home page + Budget Detail Page tab shell. Ship the structural UI scaffold — routes, dropdown, cards, sticky-pill tabs, task-banner shell — that every subsequent tab phase plugs into.
**Verified:** 2026-05-13T00:22:00Z
**Status:** human_needed (all code-level must-haves verified; live `make test-e2e` run + visual checks need human)
**Re-verification:** No — initial verification.

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria + REQ traceability)

| #   | Truth                                                                                                                                                                               | Status   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Top nav shows current budget name + private/shared icon + chevron; dropdown groups Personal/Shared; aside `+` button routes to `/budgets/new`; `/workspaces` deleted (NAV-01..05)   | VERIFIED | `apps/web/src/components/budgeting/budget-switcher.tsx` (Popover trigger renders Lock/Users + name + ChevronDown; Personal/Shared groups; menuitemradio rows route via `router.push("/${locale}/budgets/${id}/spendings")`); `new-budget-button.tsx` (`router.push("/${locale}/budgets/new")` confirmed); `apps/web/src/app/[locale]/(app)/workspaces/` not present (`test -f` returns false)                                                                  |
| 2   | `/` renders one card per accessible budget with name, type badge, spent, wallets-converted, top overspent; click → `/budgets/[id]/spendings`; placeholder chart below (HOME-01..04) | VERIFIED | `apps/web/src/app/[locale]/(app)/page.tsx` fetches `/budgets/active` and renders HomeEmptyHero or HomeCardsGrid + PlaceholderChart; `budget-card.tsx` fetches `/budgets/{id}/home-summary` per card and renders Lock/Users icon + Badge + spent stat + wallets stat + overspent list; whole card wrapped in single Next.js Link to `/${locale}/budgets/${id}/spendings`; backend `/budgets/:id/home-summary` route present in `apps/api/src/routes/budgets.ts` |
| 3   | `/budgets/[id]` renders sticky pill tabs Spendings/Reserves/Wallets/Settings; default Spendings; active pill yellow; back/forward respects routes (BDP-01, BDP-02, BDP-04, BDP-05)  | VERIFIED | `apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx` mounts `<div className="sticky top-16 z-40 …">` holding `<BdpTabs/>`; `bdp-tabs.tsx` renders 4 `<Link>` pills in declared order, active flag derived from `usePathname().startsWith(href)`, active styling `bg-[var(--primary)] text-[var(--on-primary)]`; `[id]/page.tsx` server-redirects to `/spendings`                                                                                          |
| 4   | When tasks API returns ≥1 pending task, banner renders above tabs with count chip; click expands inline list (BDP-03 shell only — Phase 7 fills kind-specific action wiring)        | VERIFIED | Backend: `apps/api/src/routes/tasks.ts` registered in `app.ts` as `app.route("/budgets/:budgetId/tasks", createTasksRoute(deps))`. Frontend: `task-banner.tsx` returns `null` when `tasks.length === 0`; otherwise renders count Badge + expand button + `role="list"` with `TaskBannerRow` children; React Query 60s poll + visibilitychange invalidation present                                                                                             |
| 5   | All four tab routes reachable, render placeholder content (BDP-02 + structural scaffold)                                                                                            | VERIFIED | `apps/web/src/app/[locale]/(app)/budgets/[id]/{spendings,reserves,wallets,settings}/page.tsx` all exist (22 lines each, read `bdp.tab.{slug}.{title,placeholder}` i18n keys via `getTranslations`)                                                                                                                                                                                                                                                             |

**Score:** 5/5 truths verified at the code level.

### Required Artifacts — Three-Level Verification

| Artifact                                                                                            | Exists | Substantive (>stub)                                                                                                                                                     | Wired (imported & used)                                                                                     | Status   |
| --------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------- |
| `apps/web/src/components/budgeting/budget-switcher.tsx`                                             | yes    | yes (198 LOC; Personal/Shared groups, empty state, Popover, menuitemradio)                                                                                              | imported by `top-nav.tsx`                                                                                   | VERIFIED |
| `apps/web/src/components/budgeting/new-budget-button.tsx`                                           | yes    | yes (35 LOC; lucide Plus, router.push to `/budgets/new`)                                                                                                                | imported by `top-nav.tsx`                                                                                   | VERIFIED |
| `apps/web/src/components/budgeting/top-nav.tsx`                                                     | yes    | yes (RSC fetches `/budgets/active`, mounts BrandMark + BudgetSwitcher + NewBudgetButton + LocaleSelect + SignOutButton)                                                 | imported by `(app)/layout.tsx`                                                                              | VERIFIED |
| `apps/web/src/app/[locale]/(app)/page.tsx`                                                          | yes    | yes (fetches `/budgets/active`, branches empty hero vs grid + placeholder chart)                                                                                        | route file — Next.js routing wires it                                                                       | VERIFIED |
| `apps/web/src/components/budgeting/budget-card.tsx`                                                 | yes    | yes (async RSC; fetches `/budgets/{id}/home-summary`; renders kind/icon/badge/spent/wallets/overspent inside Link)                                                      | imported by `home-cards-grid.tsx`                                                                           | VERIFIED |
| `apps/web/src/components/budgeting/budget-card-skeleton.tsx`                                        | yes    | yes (Suspense fallback)                                                                                                                                                 | imported by `home-cards-grid.tsx`                                                                           | VERIFIED |
| `apps/web/src/components/budgeting/home-cards-grid.tsx`                                             | yes    | yes (grid + per-card Suspense)                                                                                                                                          | imported by `page.tsx`                                                                                      | VERIFIED |
| `apps/web/src/components/budgeting/home-empty-hero.tsx`                                             | yes    | yes (CTA to `/budgets/new`)                                                                                                                                             | imported by `page.tsx`                                                                                      | VERIFIED |
| `apps/web/src/components/budgeting/placeholder-chart.tsx`                                           | yes    | yes (240px minHeight; lucide chart icon)                                                                                                                                | imported by `page.tsx`                                                                                      | VERIFIED |
| `apps/web/src/components/budgeting/bdp-tabs.tsx`                                                    | yes    | yes (82 LOC; 4 Link pills; pathname-driven active flag; mobile-collapse)                                                                                                | imported by `(app)/budgets/[id]/layout.tsx`                                                                 | VERIFIED |
| `apps/web/src/components/budgeting/task-banner.tsx`                                                 | yes    | yes (RSC-initial + React Query 60s poll + visibilitychange listener; null when empty)                                                                                   | imported by `(app)/budgets/[id]/layout.tsx`                                                                 | VERIFIED |
| `apps/web/src/components/budgeting/task-banner-row.tsx`                                             | yes    | yes (Phase-7 plug-in shape)                                                                                                                                             | imported by `task-banner.tsx`                                                                               | VERIFIED |
| `apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx`                                           | yes    | yes (sticky wrapper z-40 top:64px; membership-checks via `/budgets/active`; banner mounted only when initialTasks > 0)                                                  | route file — Next.js wires it                                                                               | VERIFIED |
| `apps/web/src/app/[locale]/(app)/budgets/[id]/page.tsx`                                             | yes    | yes (server redirect to `/spendings`)                                                                                                                                   | route file                                                                                                  | VERIFIED |
| `apps/web/src/app/[locale]/(app)/budgets/[id]/{spendings,reserves,wallets,settings}/page.tsx`       | yes    | yes (each reads `bdp.tab.{slug}.{title,placeholder}` i18n; intentional placeholder for later phases)                                                                    | route files                                                                                                 | VERIFIED |
| `apps/web/src/app/[locale]/(app)/budgets/new/page.tsx`                                              | yes    | yes (placeholder per D-PH3-18; Phase 6 plugs wizard)                                                                                                                    | route file                                                                                                  | VERIFIED |
| `apps/web/src/middleware.ts` x-pathname injection                                                   | yes    | yes (line 60: `requestHeaders.set("x-pathname", request.nextUrl.pathname)` on final non-redirect pass)                                                                  | read by `(app)/layout.tsx` line 40                                                                          | VERIFIED |
| `apps/api/src/routes/tasks.ts` (`createTasksRoute`)                                                 | yes    | yes (literal `status=pending` zValidator + tenantIds-membership 404 guard + DrizzleTaskRepo via withTenantTx)                                                           | mounted in `app.ts` as `app.route("/budgets/:budgetId/tasks", createTasksRoute(deps))`                      | VERIFIED |
| `apps/api/src/routes/budgets.ts` GET `/:id/home-summary`                                            | yes    | yes (composes 3 sub-queries; FX-converts via FxProvider.rateAsOf; 404 on cross-tenant)                                                                                  | registered in budgets router; tested integration                                                            | VERIFIED |
| `tests/tenant-leak/home-summary-cross-tenant.test.ts`                                               | yes    | yes (7.0K; 3 Layer-2 RLS cases)                                                                                                                                         | run via `make ci-gate`                                                                                      | VERIFIED |
| `tests/tenant-leak/tasks-cross-tenant.test.ts`                                                      | yes    | yes (7.0K; 3 Layer-2 RLS cases)                                                                                                                                         | run via `make ci-gate`                                                                                      | VERIFIED |
| `apps/web/e2e/features/{nav-switcher,home,bdp-tab-frame,task-banner}.feature`                       | yes    | yes (4+4+5+4 = 17 scenarios; Given/When/Then with Page Object steps)                                                                                                    | run via `make test-e2e` (bddgen + playwright test)                                                          | VERIFIED |
| `apps/web/e2e/page-objects/{TopNavPo,SwitcherPo,HomePo,BdpPo,TaskBannerPo}.ts`                      | yes    | yes (5 POs)                                                                                                                                                             | imported by `e2e/steps/common-steps.ts`                                                                     | VERIFIED |
| `apps/web/e2e/fixtures/fresh-user-per-scenario.ts`                                                  | yes    | yes (Better-Auth signup + cookie-copy via context.addCookies; no `pending-implementation` stub remains)                                                                 | imported by `common-steps.ts`                                                                               | VERIFIED |
| `apps/web/messages/{en,pl,uk}.json` — `nav.*`, `home.*`, `bdp.*`, `budgets.new.*` namespaces        | yes    | yes (verified via node JSON parse: all three locales contain `nav`, `home`, `bdp` namespaces; `bdp.tab` carries `aria,spendings,reserves,wallets,settings` in EN/PL/UK) | read by RSC + client components via next-intl                                                               | VERIFIED |
| `Makefile` `test-e2e:` target                                                                       | yes    | yes (line 74; PLAYWRIGHT_BASE_URL_RESOLVED reads APP_URL from .env.local)                                                                                               | invoked by user / CI                                                                                        | VERIFIED |
| `apps/web/package.json` `@tanstack/react-query@^5`, `playwright-bdd@^8`, `@playwright/test@^1.60.0` | yes    | yes (4 packages listed)                                                                                                                                                 | QueryProvider wires React Query at `[locale]/layout.tsx`; playwright-bdd consumed by `playwright.config.ts` | VERIFIED |

### Key Link Verification

| From                       | To                                                   | Via                                                                                                    | Status |
| -------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------ |
| `(app)/layout.tsx`         | `TopNav`                                             | direct import + render with `locale`, `activeBudgetId` props (active id derived from x-pathname)       | WIRED  |
| `TopNav`                   | `/budgets/active` API                                | `serverApiFetch(null, "/budgets/active")` — dual-emit `body.budgets ?? body.workspaces`                | WIRED  |
| `TopNav`                   | `BudgetSwitcher`, `NewBudgetButton`                  | direct imports + render                                                                                | WIRED  |
| `BudgetSwitcher` row click | `/${locale}/budgets/${id}/spendings`                 | `router.push(...)`                                                                                     | WIRED  |
| `NewBudgetButton`          | `/${locale}/budgets/new`                             | `router.push(...)`                                                                                     | WIRED  |
| Home `page.tsx`            | `/budgets/active`                                    | `serverApiFetch(null, "/budgets/active")` + dual-emit fallback                                         | WIRED  |
| Home `page.tsx`            | `HomeCardsGrid`, `HomeEmptyHero`, `PlaceholderChart` | direct imports                                                                                         | WIRED  |
| `BudgetCard`               | `/budgets/${id}/home-summary`                        | `serverApiFetch(budget.id, "/budgets/${id}/home-summary")`                                             | WIRED  |
| `BudgetCard`               | `/${locale}/budgets/${id}/spendings`                 | `<Link href=...>` wrapping the whole card (HOME-03)                                                    | WIRED  |
| `BdpLayout`                | `/budgets/active` (membership)                       | `serverApiFetch(null, "/budgets/active")`; redirect `/${locale}` on miss                               | WIRED  |
| `BdpLayout`                | `/budgets/${id}/tasks?status=pending`                | `serverApiFetch(id, ...)` then passes `initialTasks` to TaskBanner                                     | WIRED  |
| `TaskBanner`               | `/budgets/${id}/tasks?status=pending`                | `clientApiFetch(...)` inside `useQuery` queryFn; `initialData: initialTasks`; `refetchInterval:60_000` | WIRED  |
| `BdpTabs`                  | per-tab `/budgets/${id}/${slug}` routes              | `<Link href=...>` per pill; active flag from `usePathname().startsWith(href)`                          | WIRED  |
| `middleware.ts`            | x-pathname request header                            | `requestHeaders.set("x-pathname", request.nextUrl.pathname)` on final non-redirect pass                | WIRED  |
| `(app)/layout.tsx`         | x-pathname header                                    | `headers().get("x-pathname")` → regex-extract budget UUID → pass as `activeBudgetId`                   | WIRED  |
| `apps/api/src/app.ts`      | tasks sub-router                                     | `app.route("/budgets/:budgetId/tasks", createTasksRoute(deps))`                                        | WIRED  |
| `apps/api/src/boot.ts`     | `listPendingTasks`, `getBudgetHomeSummary`           | both wired into `BootedDeps.budgeting`                                                                 | WIRED  |

### Data-Flow Trace (Level 4)

| Artifact         | Data Variable    | Source                                                                                                                                                         | Produces Real Data                                                                                                              | Status                                  |
| ---------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Home `page.tsx`  | `budgets`        | `GET /budgets/active` (real Postgres query in `apps/api/src/routes/budgets.ts`)                                                                                | YES (RLS-scoped real query)                                                                                                     | FLOWING                                 |
| `BudgetCard`     | `summary`        | `GET /budgets/{id}/home-summary` (real Drizzle queries: budget meta, current-month spend, wallets, overspent categories; FX-converted via FxProvider.rateAsOf) | YES (verified by integration tests, 6 cases against real Postgres)                                                              | FLOWING                                 |
| `BdpLayout`      | `list` (members) | `GET /budgets/active`                                                                                                                                          | YES                                                                                                                             | FLOWING                                 |
| `BdpLayout`      | `initialTasks`   | `GET /budgets/{id}/tasks?status=pending` (Drizzle SELECT against `budgeting.tasks` via withTenantTx)                                                           | YES (returns empty list today because Phase 7 generators don't yet write rows; banner correctly returns null in DOM — D-PH3-14) | FLOWING (empty by design until Phase 7) |
| `TaskBanner`     | `tasks`          | React Query refetch of same endpoint every 60s                                                                                                                 | YES                                                                                                                             | FLOWING                                 |
| `BdpTabs`        | `pathname`       | `usePathname()` — Next.js native                                                                                                                               | YES                                                                                                                             | FLOWING                                 |
| `BudgetSwitcher` | `budgets`        | prop drilled from TopNav RSC                                                                                                                                   | YES                                                                                                                             | FLOWING                                 |

**Note on BDP-03:** TaskBanner being absent from DOM when tasks are empty is the documented design (D-PH3-14). Phase 3 ships the shell; Phase 7 wires generators that produce rows. The wiring is verified by the route returning a real (possibly empty) array from a real Drizzle query, not by a hardcoded `[]`. The 3 Layer-2 tenant-leak tests in `tests/tenant-leak/tasks-cross-tenant.test.ts` confirm the adapter executes real SQL.

### Behavioral Spot-Checks

Skipped — no isolated runnable entry points for this phase outside the full stack. Live verification routed through `make test-e2e` (see human verification section).

Already-verified during execution (per orchestrator brief):

- bun:test backend unit: 13/13 pass (get-budget-home-summary 7, list-pending-tasks 6)
- bun:test API integration: 12/12 pass (budgets-home-summary 6, tasks 6) against real Postgres
- bun:test tenant-leak gate: 32/32 across 7 files (incl. 2 new Phase 3 files)
- Vitest web component: 41/41 Phase 3 cases pass (budget-switcher 9, new-budget-button 4, budget-card 9, placeholder-chart 2, bdp-tabs 7, tabs-pill 2, task-banner 8)
- Web typecheck exit 0

### Requirements Coverage

| Requirement | Source Plan(s) | Description                                                               | Status    | Evidence                                                                                                                                                        |
| ----------- | -------------- | ------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NAV-01      | 03-04          | Top nav shows current budget name + private/shared icon + chevron         | SATISFIED | `budget-switcher.tsx` PopoverTrigger renders Lock/Users + name + ChevronDown; component test `budget-switcher.test.tsx` 9 cases                                 |
| NAV-02      | 03-04, 03-07   | Dropdown lists Personal / Shared sections                                 | SATISFIED | `BudgetGroup` rendered twice with `nav.switcher.personal` / `nav.switcher.shared` headings; menuitemradio rows in each                                          |
| NAV-03      | 03-04          | Aside `+` button routes to `/budgets/new`                                 | SATISFIED | `NewBudgetButton` `router.push("/${locale}/budgets/new")`; rendered as sibling of switcher in `top-nav.tsx`                                                     |
| NAV-04      | 03-04, 03-07   | Click budget → `/budgets/[id]/spendings`                                  | SATISFIED | `onPick` callback in `budget-switcher.tsx` `router.push("/${locale}/budgets/${id}/spendings")`; Gherkin `nav-switcher.feature` scenario                         |
| NAV-05      | 03-01          | `/workspaces` page tree deleted                                           | SATISFIED | `apps/web/src/app/[locale]/(app)/workspaces/` not present; 8 v1.0 files hard-deleted in commit a54a4ac                                                          |
| HOME-01     | 03-02, 03-05   | `/` renders one card per accessible budget                                | SATISFIED | `page.tsx` maps `body.budgets` to `HomeCardsGrid` → `BudgetCard` per element; backend `/budgets/active` RLS-scoped                                              |
| HOME-02     | 03-02, 03-05   | Card shows name, type badge, spent, wallets (FX-converted), top overspent | SATISFIED | `budget-card.tsx` renders all 5 fields; server-side FX via FxProvider.rateAsOf; 6 integration tests pass against real Postgres                                  |
| HOME-03     | 03-05, 03-07   | Card click → `/budgets/[id]/spendings`                                    | SATISFIED | `<Link href="/${locale}/budgets/${budget.id}/spendings">` wraps entire card                                                                                     |
| HOME-04     | 03-05, 03-07   | Placeholder chart below cards                                             | SATISFIED | `placeholder-chart.tsx` 240px minHeight box, mounted in `page.tsx` under `<HomeCardsGrid>`                                                                      |
| BDP-01      | 03-06, 03-07   | Pill-style horizontal tabs sticky on scroll                               | SATISFIED | `(app)/budgets/[id]/layout.tsx` wraps `<BdpTabs>` in `<div className="sticky top-16 z-40 …">`; `bdp-tabs.tsx` renders pill `<Link>`s with rounded-pill          |
| BDP-02      | 03-06          | Tab order Spendings · Reserves · Wallets · Settings; default Spendings    | SATISFIED | `TABS` array literal order in `bdp-tabs.tsx`; `[id]/page.tsx` server-redirect to `/spendings`                                                                   |
| BDP-03      | 03-03, 03-06   | Task banner above tabs with count chip + expand                           | SATISFIED | Backend `/budgets/:budgetId/tasks?status=pending` route + RLS adapter; frontend `TaskBanner` reads initialTasks + 60s React Query poll + expand UI              |
| BDP-04      | 03-06, 03-07   | Active pill highlighted yellow accent                                     | SATISFIED | `bdp-tabs.tsx` active branch uses `bg-[var(--primary)] text-[var(--on-primary)]`; component tests cover; visual exact-color check routed to human gate          |
| BDP-05      | 03-06, 03-07   | Browser back/forward respects tab routes                                  | SATISFIED | Tabs are real `<Link>` components, active state derived from `usePathname()`; Gherkin `bdp-tab-frame.feature` scenario "Browser back restores the previous tab" |

**Total Phase 3 reqs: 14/14 SATISFIED at code level. No ORPHANED reqs detected** (all 14 reqs from REQUIREMENTS.md traceability table appear in plan `requirements-completed` frontmatter across 03-01..07).

### Anti-Patterns Found

| File                                                                                          | Line  | Pattern                                  | Severity | Impact                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------- | ----- | ---------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/[locale]/(app)/budgets/[id]/{spendings,reserves,wallets,settings}/page.tsx` | 11-22 | "placeholder" copy                       | INFO     | Intentional. Per ROADMAP Success Criterion #5 ("All four tab routes are reachable and render placeholder content where the real content will land in Phases 4–6") and BDP-02. NOT a stub failure. |
| `apps/web/src/app/[locale]/(app)/budgets/new/page.tsx`                                        | 1-30  | "placeholder" copy                       | INFO     | Intentional. Per D-PH3-18 — Phase 6 plugs the wizard.                                                                                                                                             |
| `apps/web/src/components/budgeting/task-banner-row.tsx`                                       | -     | disabled action button (Phase-7 plug-in) | INFO     | Intentional. Per BDP-03 shell scope ("kind-specific action wiring is filled in Phase 7; this phase ships the shell").                                                                             |

No stub failures detected. All "placeholder" content is in routes whose real content is scoped to later phases per ROADMAP.

### Deferred Items

| #   | Item                                                              | Addressed In                      | Evidence                                                                                                                                            |
| --- | ----------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Pre-existing `transaction-edit-form.test.tsx > bulkApply` failure | Phase 02 retro                    | `deferred-items.md` documents the failure was present on `main` HEAD before any Phase 3 work (commit 7e2eb5b in Phase 02-07). Out of Phase 3 scope. |
| 2   | Live `make test-e2e` green run                                    | Phase 3 verification (this phase) | Plan 03-07 §verification explicitly defers green run to phase-verification time. Routed to `human_verification` (see below).                        |

### Human Verification Required

See `human_verification:` block in frontmatter. Four items requiring human:

1. **Live `make test-e2e` run** — 17 Gherkin scenarios; deferred by Plan 03-07 to phase-verification time.
2. **DESIGN.md `--primary` yellow exact-color check** (BDP-04) — Playwright class assertion confirms but not computed pixel.
3. **Personal/Shared icon glyph correctness** (NAV-01) — visual.
4. **Sticky shadow on scroll** (BDP-01) — decorative CSS.

### Gaps Summary

**No gaps found at code level.** All 14 Phase 3 requirements (NAV-01..05, HOME-01..04, BDP-01..05) are traceable to specific files and test files. Wiring verified by import graph (28 component/route files cross-reference correctly via grep). Backend routes mounted in `app.ts` and registered in `boot.ts`. Tenant-leak gate extended by both new endpoints (5→6→7 files; 26→29→32 cases). 17 Gherkin scenarios + 5 Page Objects + Better-Auth-backed fresh-user fixture in place. PL + UK i18n locked nested shape parity with EN across `nav.*`, `home.*`, `bdp.*`, `budgets.new.*`. React Query + playwright-bdd installed.

The only outstanding items are visual / live-stack verifications that require human eyes or a running Docker stack, both explicitly deferred to phase-verification time per Plan 03-07.

**Phase 3 goal achievement: confirmed at the code/test level. Status `human_needed` because Plan 03-07 deferred the live `make test-e2e` green run to phase-verification, which the verifier did not invoke per orchestrator brief ("Don't block phase verification on this; the feature files exist and typecheck").**

---

_Verified: 2026-05-13T00:22:00Z_
_Verifier: Claude (gsd-verifier)_
