---
phase: 11-budget-overview
plan: 08
subsystem: web
tags: [frontend, bdp, overview, cards, react-query, prefetch, i18n, e2e, theme]

# Dependency graph
requires:
  - phase: 11-budget-overview
    provides: GET /budgets/:id/overview/cards (11-03)
provides:
  - "overview pill (first) + carousel case + popstate + first pill in BdpTabs"
  - "useOverviewCards persisted RQ hook + priority prefetch warming"
  - "OverviewTab shell (cards + sections slot) + OverviewCards (5 cards, default_ccy)"
  - "bdp.tab.overview.* EN i18n contract (full; PL/UK in 11-10)"
affects: [11-09, 11-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "New BDP tab = prepend TAB_ORDER + carousel switch case + popstate regex + BdpTabs TABS entry + countsByPill key; redirect target stays hardcoded /wallets (not TAB_ORDER-derived)"
    - "Overview has no task strip — PillTaskSlider guarded on activeTab!=='overview' (also narrows BdpTab→Pill for the prop)"

key-files:
  created:
    - apps/web/src/hooks/use-overview-cards.ts
    - apps/web/src/components/budgeting/overview/overview-tab.tsx
    - apps/web/src/components/budgeting/overview/overview-cards.tsx
    - apps/web/test/components/budgeting/overview/overview-cards.test.tsx
    - apps/web/e2e/features/overview.feature
    - apps/web/e2e/steps/overview-steps.ts
  modified:
    - apps/web/src/lib/bdp-tabs.ts
    - apps/web/src/components/budgeting/budget-detail.tsx
    - apps/web/src/components/budgeting/bdp-tabs.tsx
    - apps/web/src/hooks/use-prefetch-budget-tabs.ts
    - apps/web/messages/en.json
    - apps/web/e2e/page-objects/BdpPo.ts

key-decisions:
  - "Cards layout per UI-SPEC DD-1: full-width Capitalization hero (yellow --primary figure) + 2-col grid of four. Hero figure is the single big yellow number; the other figures are --body-on-dark, overspent --trading-down when >0, all via theme tokens so light+dark both render correctly (no hardcoded hex)."
  - "Bare /budgets/:id redirect kept at /wallets (hardcoded in the catch-all page, not derived from TAB_ORDER[0]) — overview is the first PILL but not the default landing tab; the bdp-tab-frame redirect E2E stays green (ponytail: don't change the redirect unless asked)."
  - "Overview is prefetched in the PRIORITY tier (it's the first pill); section endpoints stay lazy (collapsed by default, 11-09)."
  - "Full EN copy contract added now (cards + range + sections + planned + wealth + empty) so 11-09 has its keys; PL/UK parity enforced in 11-10."

patterns-established:
  - "Overview cards format cents via the existing centsToDisplay(default_currency, locale) — no new formatter; tabular .num figures."

requirements-completed: [SC1, SC2]

# Metrics
duration: 75 min
completed: 2026-06-28
---

# Phase 11 Plan 08: Overview Tab Shell + Cards UI Summary

**The `overview` pill is now the first BDP tab (same pushState carousel, zero RSC) and renders five summary cards in the budget default_currency — full-width Capitalization hero + a 2-col grid (available-to-spend, available reserves, overspent, cushion) — all theme-tokened (light+dark), 375px-safe, warmed in the priority prefetch. Component test green + @overview golden E2E stubbed.**

## Performance

- **Duration:** ~75 min
- **Completed:** 2026-06-28
- **Tasks:** 4 (tab frame + i18n, hook + prefetch, components, test + E2E)
- **Files:** 6 created, 6 modified

## Accomplishments

- TAB_ORDER prepends `overview`; budget-detail carousel `case "overview"` + popstate regex; BdpTabs first pill (LayoutDashboard) + countsByPill key.
- `useOverviewCards` persisted RQ hook (X-Budget-ID, refetchOnMount) + priority prefetch warming.
- `OverviewCards` (hero + 2×2, default_ccy, calm zero-states, cushion 1-decimal) + `OverviewTab` shell with the sections slot for 11-09.
- Full EN i18n `bdp.tab.overview.*`; component test (4 cases) + `@overview` golden E2E (first pill, /overview, five cards, no h-scroll @375px).

## Task Commits

1. **Tab frame + cards + hooks + i18n** — `feat(11-08): overview pill (first) + 5 summary cards UI`.
2. **Test + E2E** — `test(11-08): overview cards component test + @overview golden E2E`.

## Decisions Made

See key-decisions frontmatter.

## Deviations from Plan

- **Restraint on card figure color:** UI-SPEC lists "each card's primary number" as yellow-allowed; applied yellow only to the Capitalization hero (others --body-on-dark, overspent red) for a calmer surface within the single-accent rule. 11-09 UI review can adjust if the checker wants all figures yellow.
- No other deviations; redirect intentionally unchanged (see decisions).

## Issues Encountered

- None blocking. `bddgen` resolves all steps; `tsc --noEmit` exits 0; the Vitest component test passes.

## User Setup Required

None.

## Next Phase Readiness

- The sections slot in `OverviewTab` + the range selector are the 11-09 surface; the four section endpoints (planned/overspent/wealth) + chart wrappers (11-02) are ready to wire.
- **Verification caveat:** verified via `tsc` + Vitest + `bddgen` (per the plan's verify). A full `next build` + live `@overview` E2E run is deferred to 11-10 / phase validation (infisical/Tailscale down). Changes are client-only (no new server/client boundary crossing), so the RSC-boundary build risk is low.

---

_Phase: 11-budget-overview_
_Completed: 2026-06-28_
