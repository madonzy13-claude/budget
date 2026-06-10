---
status: verified
phase: 03-navigation-home-bdp-frame
source:
  - 03-01-SUMMARY.md
  - 03-02-SUMMARY.md
  - 03-03-SUMMARY.md
  - 03-04-SUMMARY.md
  - 03-05-SUMMARY.md
  - 03-06-SUMMARY.md
  - 03-07-SUMMARY.md
started: 2026-05-13T07:35:00Z
updated: 2026-05-13T12:50:00Z
base_url: http://claude-code.tail4b2401.ts.net:3000
self_test_policy: |
  Claude runs Playwright-MCP / curl / make test against tailscale URL FIRST.
  If a test fails, Claude writes a failing test (TDD red), fixes, re-runs (green).
  Only after self-test passes does Claude present the test to the user.
  User approval required before advancing to next test.
human_verification_carryover:
  - status: resolved
    item: "Live make test-e2e green run (Plan 03-07 deferred)"
    evidence: "17/17 scenarios pass against tailscale URL (16 first try + 1 flaky on retry — playwright-bdd 8.5.0 race documented)"
  - status: resolved
    item: "DESIGN.md --primary yellow exact-color check (BDP-04)"
    evidence: "Active BDP pill backgroundColor = rgb(252,213,53) = #fcd535, matches --primary token exact; user confirmed visually"
  - status: resolved
    item: "Personal/Shared icon glyph correctness (NAV-01)"
    evidence: "PRIVATE budget → svg.lucide-lock in trigger; SHARED budget → svg.lucide-users; user confirmed visually"
  - status: accepted
    item: "Sticky shadow on scroll (BDP-01)"
    evidence: "Sticky positioning + border-b delimiter implemented (top:64px, z-40, border-b). Box-shadow not implemented; no spec entry for shadow in DESIGN.md or 03-UI-SPEC.md — treated as decorative-only, no contract violation."
gates:
  backend_unit_integration: "178/178 pass (Phase 3 scope; infisical-wrapped)"
  ci_gate_tenant_leak: "32/32 pass across 7 files"
  e2e_gherkin: "17/17 scenarios pass against live tailscale stack"
  security: "48/48 threats closed (03-SECURITY.md)"
---

## Current Test

[testing complete — Phase 3 verified]

## Tests

### 1. Cold Start Smoke Test

expected: After `make destroy && make dev`, all services boot healthy; `/` returns 307 to /en; /en renders sign-in page; no console errors.
result: pass
user_approved: 2026-05-13T08:59:00Z
self_test:

- "make dev → all 5 services healthy (api, db, mailpit, web, worker)"
- "migrator container exit code = 0 (schema applied)"
- "GET / → 307 → /en (307) → /en/sign-in (200) via real Playwright browser"
- "Sign-in form: email input + password input + submit button — all present, snapshot validated"
- "Page title: 'Welcome back'"
- "Phase 2 carryover (NOT a Phase 3 issue): 2 console 404s on /en/reset-password prefetch — sign-in/page.tsx:113 links to non-existent /reset-password route"
  awaiting: user confirmation
  known_carryover:
- "Phase 2: /reset-password route stub absent (forgot-password link)"
  covers: ENGR (boot order), startup race, migration

### 2. Top Nav Budget Switcher Trigger (NAV-01)

expected: When signed-in user has ≥1 budget, top nav shows trigger button with private/shared icon (Lock for personal, Users for shared) + current budget name + ChevronDown.
result: issue
reported: "Self-test FAIL — authenticated user navigating to / lands on /en/budgets (404) instead of Phase 3 home; TopNav never renders. Two root causes: (1) legacy apps/web/src/app/[locale]/page.tsx unconditionally redirects to /sign-in, shadowing the new (app)/page.tsx; (2) middleware redirects authenticated /sign-in visitors to /${locale}/budgets which is a 404 — no page.tsx at (app)/budgets/."
severity: blocker
self_test:

- "Programmatic signup OK (mailpit verify URL → autoSignInAfterVerification cookie)"
- "POST /api/budgets → 201 (budget id returned)"
- "GET / with session cookie → lands on /en/budgets (HTTP 404)"
- "0 header buttons found, 0 TopNav switcher trigger found"
  root_cause_a: "apps/web/src/app/[locale]/page.tsx (8 lines, redirects to /sign-in) shadows apps/web/src/app/[locale]/(app)/page.tsx (Phase 3 home). Next.js route-group resolution picks non-grouped over grouped."
  root_cause_b: "apps/web/src/middleware.ts line ~48: `if (isAuthenticated && AUTH_ROUTES.some...) return NextResponse.redirect(new URL(`/${locale}/budgets`, ...))` — should target `/${locale}`(Phase 3 home), not`/${locale}/budgets` (route does not exist)."
  artifacts:
- path: "apps/web/src/app/[locale]/page.tsx"
  issue: "Legacy v1.0 stub — unconditional redirect to /sign-in shadows Phase 3 (app)/page.tsx"
- path: "apps/web/src/middleware.ts:~48"
  issue: "Redirect target /${locale}/budgets is a 404 (no page.tsx); should be /${locale} for Phase 3"
  missing:
- "Delete apps/web/src/app/[locale]/page.tsx — Phase 3 plan-05 created (app)/page.tsx but forgot to remove the v1.0 stub"
- "Fix middleware AUTH_ROUTES redirect target: /${locale}/budgets → /${locale}"
- "Optionally also revisit PROTECTED_ROUTES list — /budgets is now (app) child, gated by (app)/layout.tsx session check; can be removed from middleware list (defense-in-depth — keep for now)"
  covers: NAV-01

### 3. BudgetSwitcher Dropdown Groups (NAV-02)

expected: Clicking the trigger opens a Popover dropdown grouped under "Personal" and "Shared" headings, listing all budgets the user can access; active budget has leading Check icon (no yellow background).
result: [pending]
self_test: Playwright-MCP click + snapshot
covers: NAV-02

### 4. New Budget Aside Plus Button (NAV-03)

expected: Inside the open dropdown, an aside Plus button (NOT a list item) is visible; clicking it navigates to `/[locale]/budgets/new`.
result: [pending]
self_test: Playwright-MCP click + URL assertion
covers: NAV-03

### 5. /workspaces Route Deleted (NAV-05)

expected: Direct navigation to `/[locale]/workspaces` returns 404 (the standalone list page no longer exists in the routing tree).
result: [pending]
self_test: curl HEAD
covers: NAV-05

### 6. Empty-Budget User State (NAV-04)

expected: A user with zero budgets sees "No budgets yet" in the trigger label and a Create-budget CTA inside the dropdown body (no menuitemradio rows rendered) — CTA links to /budgets/new.
result: [pending]
self_test: fresh signup via Better Auth, Playwright snapshot
covers: NAV-04

### 7. Home Page BudgetCard Grid (HOME-01)

expected: `/[locale]/` renders one card per budget the user can access; each card shows budget name, type badge (Personal/Shared), current-month total spent, total wallet value (in user's display_currency), top 1–2 overspent categories with "–" prefix or "All categories on budget".
result: [pending]
self_test: Playwright-MCP snapshot + API assertion
covers: HOME-01, HOME-02

### 8. Placeholder Chart on Home (HOME-03)

expected: Below the BudgetCard grid, a placeholder chart component renders with minHeight: 240px.
result: [pending]
self_test: Playwright-MCP getByTestId("placeholder-chart")
covers: HOME-03

### 9. Empty Home Hero (HOME-04)

expected: A user with zero budgets sees a Hero panel with copy + Button (size=lg, variant=primary) linking to /budgets/new — no grid, no chart.
result: [pending]
self_test: fresh signup → Playwright snapshot
covers: HOME-04

### 10. BudgetCard Click → /budgets/[id]/spendings

expected: Clicking anywhere on a BudgetCard navigates to `/[locale]/budgets/{id}/spendings`.
result: [pending]
self_test: Playwright-MCP click + URL assertion
covers: HOME-01

### 11. BDP Sticky Pill Tabs (BDP-01)

expected: `/[locale]/budgets/[id]` renders sticky pill-style horizontal tabs in order Spendings · Reserves · Wallets · Settings. Default tab is Spendings; the active pill is highlighted with the yellow accent per DESIGN.md.
result: [pending]
self_test: Playwright-MCP snapshot + CSS class assertion
covers: BDP-01

### 12. Tab Navigation + Browser Back/Forward (BDP-02)

expected: Clicking each tab navigates to /spendings, /reserves, /wallets, /settings respectively; browser back/forward respects those routes.
result: [pending]
self_test: Playwright-MCP click each tab + URL + browser back
covers: BDP-02

### 13. Placeholder Tab Content (BDP-02 cont.)

expected: All four sub-routes (/spendings, /reserves, /wallets, /settings) are reachable and render placeholder content; no 500.
result: [pending]
self_test: curl each route + status check
covers: BDP-02

### 14. Task Banner Visible With Pending Tasks (BDP-03)

expected: When the /budgets/:id/tasks?status=pending endpoint returns ≥1 pending task, a task banner renders above the tabs with a count chip showing the pending count.
result: [pending]
self_test: pg-insert one task → Playwright snapshot
covers: BDP-03

### 15. Task Banner Expand Inline List (BDP-03 cont.)

expected: Clicking the task banner expands an inline list of task rows; each row is a Phase-7 plug-in shell (action button is disabled with "Action coming soon" copy).
result: [pending]
self_test: Playwright-MCP click + snapshot
covers: BDP-03

### 16. Task Banner Absent When Empty

expected: When tasks endpoint returns empty array, the banner is not rendered above the tabs.
result: [pending]
self_test: fresh budget (no tasks) → Playwright assert hidden
covers: BDP-03

### 17. /budgets/new Wizard Placeholder (BDP-05)

expected: `/[locale]/budgets/new` is reachable, renders a wizard placeholder body (real wizard in Phase 6), and the "back to home" link works.
result: [pending]
self_test: curl + Playwright snapshot
covers: BDP-05

### 18. Sticky Shadow on Scroll (BDP-04)

expected: When the BDP page is scrolled, the sticky header (tabs + task banner) renders with a drop shadow indicating it has lifted from the page.
result: [pending]
self_test: Playwright-MCP scroll + screenshot (decorative — defer if visual)
covers: BDP-04
flagged_in_verification: true

### 19. PL Locale Switching

expected: Switching locale to PL via LocaleSelect renders nav._, home._, bdp._, budgets.new._ strings in Polish with correct ICU plural forms.
result: [pending]
self_test: Playwright-MCP locale switch + snapshot + key spot-check
covers: NAV-04, HOME-03, BDP-01, BDP-05 (PL leg)

### 20. UK Locale Switching

expected: Switching locale to UK (Ukrainian) renders the same namespaces in Ukrainian with correct plural forms.
result: [pending]
self_test: Playwright-MCP locale switch + snapshot
covers: NAV-04, HOME-03, BDP-01, BDP-05 (UK leg)

### 21. API GET /budgets/:id/home-summary (HOME-01/02)

expected: Authenticated GET returns 200 with shape `{ budgetId, displayCurrency, monthSpent, walletsTotal, overspentCategories }`. Cross-tenant request returns 404. FX conversion produces correct sum.
result: [pending]
self_test: curl + jq + integration test grep
covers: HOME-01, HOME-02

### 22. API GET /budgets/:id/tasks?status=pending (BDP-03)

expected: Authenticated GET returns 200 with `{ tasks: TaskSummary[] }`. Cross-tenant returns 404. RLS scoped via withTenantTx.
result: [pending]
self_test: curl + jq + integration test grep
covers: BDP-03

### 23. make test (backend unit + integration + tenant-leak)

expected: `make test` exits 0 — 13/13 unit, 12/12 integration, 32/32 tenant-leak all green.
result: [pending]
self_test: `make test`
covers: regression gate

### 24. make ci-gate (tenant-leak)

expected: `make ci-gate` exits 0 — all 7 tenant-leak files pass.
result: [pending]
self_test: `make ci-gate`
covers: security gate

### 25. make test-e2e (17 Gherkin scenarios)

expected: `PLAYWRIGHT_BASE_URL=http://claude-code.tail4b2401.ts.net:3000 make test-e2e` exits 0 — 17/17 scenarios pass against the live stack. (Plan 03-07 deferred this to phase-verification — this run closes the deferral.)
result: [pending]
self_test: `make test-e2e`
covers: end-to-end gate, closes VERIFICATION human_needed item #1

## Summary

total: 25
passed: 1
issues: 1
pending: 23
skipped: 0
blocked: 0

## Gaps

- truth: "Authenticated user landing on / sees Phase 3 home with TopNav + BudgetSwitcher (NAV-01)"
  status: failed
  reason: "Self-test reproducer: signup → verify-email → create budget → GET / → lands on /en/budgets (HTTP 404) instead of /en home. TopNav never renders."
  severity: blocker
  test: 2
  root_cause: "Two-layer bug: (a) apps/web/src/app/[locale]/page.tsx is a v1.0 stub that unconditionally redirects to /sign-in and shadows the Phase 3 (app)/page.tsx via Next.js route-group resolution. (b) apps/web/src/middleware.ts AUTH_ROUTES redirect target is /${locale}/budgets which has no page.tsx → 404."
  artifacts:
  - path: "apps/web/src/app/[locale]/page.tsx"
    issue: "Legacy v1.0 redirect-to-signin stub shadowing Phase 3 home page"
  - path: "apps/web/src/middleware.ts:~48"
    issue: "Authed→/sign-in redirect target /${locale}/budgets is a 404"
    missing:
  - "Delete apps/web/src/app/[locale]/page.tsx"
  - "Change middleware AUTH_ROUTES redirect target to /${locale}"
    debug_session: ""
