---
phase: 11-budget-overview
plan: 02
subsystem: ui
tags: [recharts, charts, react, nextjs, design-system, vitest]

# Dependency graph
requires:
  - phase: 11-budget-overview
    provides: DESIGN tokens (global.css CSS vars) + Phase-9 UI_TYPE_COLOR map
provides:
  - "recharts@3.9.0 (latest stable) in apps/web (D-19)"
  - "Four themed responsive client chart wrappers: OverviewAreaChart/LineChart/BarChart/PieChart"
  - "chart-theme.ts — DESIGN-token palette + shared axis/tooltip styles (var() refs, theme-agnostic)"
  - "Pie tap/hover active-slice highlight (D-18) with caller-supplied colorFor"
affects: [11-09]

# Tech tracking
tech-stack:
  added: [recharts@3.9.0]
  patterns:
    - "Chart wrappers are 'use client' over ResponsiveContainer (width=100%) — never raw recharts in feature code"
    - "CSS-var-only chart theming (var(--token)) so light+dark themes flip with no hard-coded series hex"

key-files:
  created:
    - apps/web/src/components/budgeting/charts/chart-theme.ts
    - apps/web/src/components/budgeting/charts/area-chart.tsx
    - apps/web/src/components/budgeting/charts/line-chart.tsx
    - apps/web/src/components/budgeting/charts/bar-chart.tsx
    - apps/web/src/components/budgeting/charts/pie-chart.tsx
    - apps/web/test/components/budgeting/charts/charts.test.tsx
  modified:
    - apps/web/package.json
    - bun.lock

key-decisions:
  - "recharts@3.9.0 confirmed as npm `latest` dist-tag (not an alpha/beta/canary). v3 Pie dropped the activeIndex prop (Tooltip-driven now), so the controlled tap-highlight is implemented via useState + per-Cell fill/opacity; hover enlarge via activeShape."
  - "All chart colors are var(--token) references resolving against global.css — covers both light and dark themes automatically; only fixed palette is the caller-passed UI_TYPE_COLOR for the investments pie."
  - "Smoke tests assert mount + ResponsiveContainer presence (happy-dom can't lay out SVG geometry), with offsetWidth/getBoundingClientRect/ResizeObserver shims."

patterns-established:
  - "One module owns chart theme + responsive + a11y; section charts (11-09) are pure data-wiring"

requirements-completed: [SC9, D-19]

# Metrics
duration: 20 min
completed: 2026-06-28
---

# Phase 11 Plan 02: Charting Foundation Summary

**recharts@3.9.0 + four themed, responsive `"use client"` wrappers (Area/Line/Bar/Pie) over ResponsiveContainer, CSS-var-themed for both light/dark, with D-18 Pie tap/hover highlight; 5 Vitest smoke tests green.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-06-28
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- recharts@3.9.0 added to apps/web (verified `latest` via npm dist-tags).
- chart-theme.ts: DESIGN-token palette (yellow accent, trading up/down, hairline grid, dark/light card tooltip, BinanceNova/BinancePlex fonts) — zero hard-coded series hex.
- Area/Line/Bar(+vertical)/Pie wrappers — width=100% (375px-safe), data-agnostic, isAnimationActive off for deterministic tests.
- Pie: controlled activeIndex tap highlight + activeShape hover enlarge + colorFor prop (D-18).
- 5 render smoke tests pass.

## Task Commits

1. **Task 1: recharts dep** — `3b863c1` (feat)
2. **Task 2: theme + 4 wrappers** — `03a780c` (feat)
3. **Task 3: Vitest smoke tests** — `fe45c2e` (test)

## Files Created/Modified

- `charts/chart-theme.ts` — palette + shared axis/tooltip styles.
- `charts/area-chart.tsx` / `line-chart.tsx` / `bar-chart.tsx` / `pie-chart.tsx` — wrappers.
- `test/components/budgeting/charts/charts.test.tsx` — smoke tests.
- `apps/web/package.json` + `bun.lock` — recharts dep.

## Decisions Made

See key-decisions frontmatter (latest-stable confirmation; v3 Pie activeIndex removal workaround; CSS-var theming for light+dark).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] recharts v3 Pie has no `activeIndex` prop**

- **Found during:** Task 2 (Pie wrapper)
- **Issue:** Plan's `<Pie activeIndex=...>` API was removed in recharts v3 (Tooltip-driven active state).
- **Fix:** Controlled `activeIndex` via useState driving per-Cell fill/opacity (tap) + `activeShape` for hover enlarge; typecheck clean.
- **Verification:** `bunx tsc --noEmit` exits 0; smoke tests pass.
- **Committed in:** `03a780c`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** D-18 highlight delivered with the v3 API. No scope creep.

## Issues Encountered

None blocking. happy-dom cannot lay out recharts SVG → smoke tests assert mount + ResponsiveContainer presence (per plan's allowance), not pixel geometry.

## User Setup Required

None.

## Next Phase Readiness

- Wrappers ready for 11-09 to wire data; theme covers light + dark.
- **Deferred verification:** the plan asks to confirm the dep via a `web` image rebuild (Docker ignores bun.lock). recharts is in `apps/web/package.json` (the source Docker reads), so the rebuild in 11-08/11-09 (which import these wrappers + restart web) is the live confirmation point. A standalone rebuild now is blocked from full restart by infisical/Tailscale being down.

---

_Phase: 11-budget-overview_
_Completed: 2026-06-28_
