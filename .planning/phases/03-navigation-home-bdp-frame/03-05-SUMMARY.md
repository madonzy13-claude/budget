---
phase: 03-navigation-home-bdp-frame
plan: 05
subsystem: ui
tags:
  [rsc, suspense, next-intl, lucide, tailwind, intl-numberformat, home-route]

requires:
  - phase: 03
    plan: 02
    provides: "/budgets/:id/home-summary endpoint returning HomeSummaryResponse DTO; /budgets/active dual-emit { budgets, workspaces }"
  - phase: 03
    plan: 04
    provides: "BudgetSummary type exported from @/components/budgeting/budget-switcher; activeBudgetId derivation pattern"
provides:
  - "BudgetCard async RSC fetching /budgets/{id}/home-summary with single Link wrap (HOME-01..03)"
  - "BudgetCardSkeleton Suspense fallback matching card anatomy"
  - "HomeCardsGrid with per-card Suspense streaming (D-PH3-11)"
  - "HomeEmptyHero empty state with CTA to /budgets/new"
  - "PlaceholderChart 240px-minHeight box (HOME-04)"
  - "/[locale]/(app)/page.tsx home route default async RSC"
  - "home.* i18n namespace in en.json"
affects: [03-06-BDP-frame, 03-07-E2E, phase-04, phase-08-insights]

tech-stack:
  added: []
  patterns:
    - "Async RSC + RTL: await component invocation then render(ui) to test server-rendered JSX"
    - "Per-card <Suspense fallback={<Skeleton/>}> boundaries inside grid wrapper for independent streaming"
    - "Intl.NumberFormat with try/catch fallback when currency code is unknown"

key-files:
  created:
    - apps/web/src/components/budgeting/budget-card.tsx
    - apps/web/src/components/budgeting/budget-card-skeleton.tsx
    - apps/web/src/components/budgeting/placeholder-chart.tsx
    - apps/web/src/components/budgeting/home-cards-grid.tsx
    - apps/web/src/components/budgeting/home-empty-hero.tsx
    - apps/web/src/app/[locale]/(app)/page.tsx
    - apps/web/test/components/budgeting/budget-card.test.tsx
    - apps/web/test/components/budgeting/placeholder-chart.test.tsx
  modified:
    - apps/web/messages/en.json

key-decisions:
  - "Tests assert lucide SVG class `lucide-chart-column` (lucide v1.14+) OR legacy `lucide-bar-chart-3` so the assertion stays stable across upgrades"
  - "Plan-grep-compatible doc comments: removed literal `<Link>` from JSDoc so `grep -c '<Link'` returns exactly 1 (Pitfall 5 guard)"
  - "Empty/Error path keeps the Link wrapper so the card always routes to the BDP — fail-soft instead of fail-loud"

patterns-established:
  - "Async RSC + RTL testing: mock external deps with vi.mock, then `const ui = await Component({ ...props }); render(ui);`"
  - "Per-card Suspense streaming pattern reusable for other grid-of-async-cards surfaces in Phase 8"

requirements-completed: [HOME-01, HOME-02, HOME-03, HOME-04]

duration: 11min
completed: 2026-05-12
---

# Phase 3 Plan 5: Home page — BudgetCard grid + PlaceholderChart Summary

**Responsive 1/2/3-column home page rendering per-budget async RSC cards with streaming Suspense, FX-converted wallet totals, and a placeholder chart card.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-12T23:29:00Z
- **Completed:** 2026-05-12T23:40:00Z
- **Tasks:** 2 (one TDD pair: RED + GREEN, plus a wiring task)
- **Files modified:** 9 (8 created + 1 modified)

## Accomplishments

- BudgetCard async RSC fetches `/budgets/{id}/home-summary` and renders header (kind icon + name + type badge), two-column spent + wallets stat row, top-1–2 overspent strip with "–" prefix or "All categories on budget" empty copy, all wrapped in a single Next.js Link to `/${locale}/budgets/${id}/spendings`.
- Error path returns the same Link wrapper so a card stays clickable when the API fails — user always lands on the BDP where the tenant guard will run again.
- HomeCardsGrid wraps each card in its own `<Suspense fallback={<BudgetCardSkeleton/>}>` boundary (D-PH3-11) so a slow card never blocks siblings.
- HomeEmptyHero empty state ships with Button `asChild size=lg variant=primary` wrapping a Link to `/${locale}/budgets/new`.
- Home page (`/[locale]/(app)/page.tsx`) fetches `/budgets/active`, reads `body.budgets ?? body.workspaces ?? []` per 03-02 dual-emit, branches to empty hero or grid + placeholder chart under `max-w-[1280px] px-4 sm:px-8 pt-12`.
- PlaceholderChart inline-style `minHeight: 240px` so the page composes correctly before Phase 8 ships the real insights chart.
- 11/11 Vitest cases green (10 plan-required + 1 extra SHARED-badge case).
- en.json gained the full `home.*` i18n namespace; no other locale catalogs touched (PL/UK staying parity-only until Phase 8 copy QA pass).

## Task Commits

1. **Task 1 RED — failing tests for BudgetCard + PlaceholderChart** — `b33b3e8` (test)
2. **Task 1 GREEN — BudgetCard + BudgetCardSkeleton + PlaceholderChart + i18n** — `010721d` (feat)
3. **Task 2 — HomeCardsGrid + HomeEmptyHero + home route /** — `ad6c906` (feat)

_(Final docs commit for SUMMARY.md + STATE.md follows separately.)_

## Files Created/Modified

- `apps/web/src/components/budgeting/budget-card.tsx` — async RSC card fetching `/budgets/{id}/home-summary`; single Link wrap; Lock/Users kind icon; two-column stats; overspent strip; error fallback.
- `apps/web/src/components/budgeting/budget-card-skeleton.tsx` — Suspense fallback mirroring card anatomy.
- `apps/web/src/components/budgeting/placeholder-chart.tsx` — 240px-minHeight CSS box with BarChart3 icon.
- `apps/web/src/components/budgeting/home-cards-grid.tsx` — `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` with per-card Suspense.
- `apps/web/src/components/budgeting/home-empty-hero.tsx` — async RSC empty state with CTA to `/budgets/new`.
- `apps/web/src/app/[locale]/(app)/page.tsx` — home route default async RSC; reads `body.budgets ?? body.workspaces` dual-emit.
- `apps/web/test/components/budgeting/budget-card.test.tsx` — 9 cases (PRIVATE+SHARED badges, Lock+Users icons, formatted amounts, all-on-budget copy, overspent rows with minus, single-Link wrap, error fallback).
- `apps/web/test/components/budgeting/placeholder-chart.test.tsx` — 2 cases (240px minHeight, BarChart3 icon + copy).
- `apps/web/messages/en.json` — added `home.*` namespace.

## Decisions Made

- **lucide class assertion uses union** — lucide-react v1.14 renames `BarChart3` → `ChartColumn` internally; SVG carries `lucide-chart-column` rather than `lucide-bar-chart-3`. Test accepts either class so we don't lock to a specific lucide-react minor version. The render path itself still imports `BarChart3` from `lucide-react` — that's the public API alias.
- **Doc comment phrasing avoids literal `<Link>`** — plan acceptance criterion `grep -c '<Link' budget-card.tsx === 1` is brittle: a doc comment with the literal `<Link>` would falsely count as a second match. Comment rephrased to "one Next.js Link" so the grep guard stays meaningful as a Pitfall 5 check.
- **Error path keeps Link wrapper** — when the home-summary fetch fails, the card still renders inside the Link to `/budgets/[id]/spendings` so users can drill in (tenant guard will 403 server-side if the user actually lacks access). T-03-05-02 from the threat register is honored: only the STATIC i18n string is rendered, never the raw API error.
- **No tests for `page.tsx`** — composition-only; HomeCardsGrid + HomeEmptyHero + PlaceholderChart each tested in isolation, and Plan 03-07 adds Gherkin E2E coverage for the full route.

## Deviations from Plan

None — plan executed exactly as written. The lucide class-name detail in the placeholder-chart test was a TDD discovery, not a deviation: my initial test asserted the wrong class, I corrected the assertion (union of legacy + current), and re-ran. No code path changed.

## Issues Encountered

- **Initial Vitest run on RED test for PlaceholderChart asserted `svg.lucide-bar-chart-3`** — lucide-react v1.14 renders `lucide-chart-column` instead (BarChart3 is now an alias). Fixed assertion to accept either class. Resolved in the Task 1 GREEN commit `010721d`.
- Pre-existing transaction-edit-form.test.tsx bulk-correct failure (1 test) — out-of-scope per Plan 03-04's `deferred-items.md`. Untouched.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 03-06 (BDP frame) can compose against the home route now that the canonical async-RSC + per-card-Suspense + per-budget `serverApiFetch(budget.id, ...)` pattern is in place.
- Plan 03-07 Gherkin E2E will exercise the home page through both the empty branch (zero budgets → CTA) and the populated branch (≥1 card visible, card click navigates to /spendings).
- Phase 8 insights work can replace `PlaceholderChart` in-place (same parent, same surrounding layout) without touching the home page composition.

---

_Phase: 03-navigation-home-bdp-frame_
_Plan: 05_
_Completed: 2026-05-12_

## Self-Check: PASSED

- FOUND: apps/web/src/components/budgeting/budget-card.tsx
- FOUND: apps/web/src/components/budgeting/budget-card-skeleton.tsx
- FOUND: apps/web/src/components/budgeting/placeholder-chart.tsx
- FOUND: apps/web/src/components/budgeting/home-cards-grid.tsx
- FOUND: apps/web/src/components/budgeting/home-empty-hero.tsx
- FOUND: apps/web/src/app/[locale]/(app)/page.tsx
- FOUND: apps/web/test/components/budgeting/budget-card.test.tsx
- FOUND: apps/web/test/components/budgeting/placeholder-chart.test.tsx
- FOUND: home.\* keys in apps/web/messages/en.json
- FOUND commit: b33b3e8 (RED tests)
- FOUND commit: 010721d (BudgetCard + BudgetCardSkeleton + PlaceholderChart)
- FOUND commit: ad6c906 (HomeCardsGrid + HomeEmptyHero + page route)
