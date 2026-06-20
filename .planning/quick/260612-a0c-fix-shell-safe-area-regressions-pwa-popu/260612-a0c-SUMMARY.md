---
phase: quick-260612-a0c
plan: 01
subsystem: web-shell
tags: [pwa, safe-area, ios, sticky-header, sheet, tasks-banner, e2e-geometry]
requires: []
provides:
  - "Right-side Sheet drawers decoupled from .pb-shell-safe; home-indicator inset absorbed inside the sheet (standalone-scoped in-flow spacer)"
  - "Tasks banner (PillTaskSlider) rendered inside the [data-bdp-tabs] sticky band — never occluded by the pinned header in browser mode"
  - "Playwright boundingBox geometry scenario (browser mode) + hardened Vitest shell guards"
affects: [bdp-layout, sheet-primitive, pill-task-slider, e2e-suite]
tech-stack:
  added: []
  patterns:
    - "ActivePillTaskSlider client shim: server layout cannot read pathname/searchParams — tiny client component derives active pill + deep-link param"
    - "Safe-area absorption via real in-flow spacer child (not padding) — iOS WebKit ignores end-of-scroll padding on scroll containers; tailwind-merge strips variant pb-* when callers pass p-0"
key-files:
  created:
    - apps/web/src/components/budgeting/tasks/active-pill-task-slider.tsx
    - apps/web/e2e/steps/bdp-shell-geometry.steps.ts
  modified:
    - apps/web/src/components/ui/sheet.tsx
    - apps/web/src/components/budgeting/tasks/pill-task-slider.tsx
    - apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx
    - apps/web/src/app/[locale]/(app)/budgets/[id]/wallets/page.tsx
    - apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx
    - apps/web/src/app/[locale]/(app)/budgets/[id]/reserves/page.tsx
    - apps/web/src/app/[locale]/(app)/budgets/[id]/settings/page.tsx
    - apps/web/test/shell-safe-area.test.ts
    - apps/web/e2e/features/bdp-tab-frame.feature
    - apps/web/e2e/page-objects/BdpPo.ts
decisions:
  - "R1 mechanism: real in-flow spacer (data-sheet-safe-area), standalone-scoped via [@media(display-mode:standalone)]:block — not pb-* (stripped by tailwind-merge under p-0) and not padding-bottom (iOS ignores end-of-scroll padding on scroll containers, SHELL-R8..R10)"
  - "R2 mechanism: zero-CSS in-wrapper move — slider renders inside [data-bdp-tabs] via ActivePillTaskSlider in BDP layout; inherits sticky offset + z-40 in both display modes; global.css untouched"
  - "key={pill} on the moved slider preserves always-start-collapsed + deep-link auto-expand mount semantics across tab switches"
metrics:
  duration: "~35m (continuation session)"
  completed: "2026-06-12"
  tasks: 3
  commits: 2
---

# Quick 260612-a0c: Fix Shell Safe-Area Regressions (PWA Popup + Browser Banner) Summary

Right-side edit sheets now absorb the iOS home-indicator inset via a standalone-scoped in-flow spacer (decoupled from .pb-shell-safe), and the tasks banner moved inside the [data-bdp-tabs] sticky band so it can never slide under the pinned header — proven by live Playwright boundingBox geometry on chromium + mobile.

## Root Causes

### Regression 1 — standalone PWA: edit sheets shifted up with a gap below

The three edit sliders (category / transaction / recurring-rule) are `side="right"` full-height drawers, portaled to `document.body`, `fixed inset-y-0 h-full` (ICB-anchored — `.pb-shell-safe` page padding never reaches them). The visible gap is the home-indicator inset reading through: nothing inside the sheet compensated `env(safe-area-inset-bottom)`. Two implementation traps made the obvious fix wrong:

1. All three sliders pass `p-0` in `className` — a `pb-*` utility on the cva variant is silently stripped by tailwind-merge.
2. iOS WebKit ignores end-of-scroll `padding-bottom` on scroll containers (device-verified SHELL-R8..R10), and the sheet content IS the scroll container (`overflow-y-auto`).

### Regression 2 — Safari browser mode: tasks banner half-hidden behind the pinned header

The plan's DOM assumption was stale: `PillTaskSlider` was NOT inside the `[data-bdp-tabs]` sticky wrapper — each tab page rendered it as in-flow page content BELOW the band. In browser mode `[data-shell-header]` is pinned (`sticky top:0`) and the band sticks at `top:calc(4rem+1px)`; on native page scroll the banner (plain content) slid up under both. Pre-fix proof: banner top **-274px** vs header bottom **65px** after `scrollBy(0,400)` (mobile project).

## Code Changes

### R1 — apps/web/src/components/ui/sheet.tsx

`SheetContent` renders, for `side="left" | "right"` only, a real in-flow spacer as the last child:

```tsx
<div
  aria-hidden
  data-sheet-safe-area
  className="pointer-events-none hidden h-[env(safe-area-inset-bottom,0px)] shrink-0 [@media(display-mode:standalone)]:block"
/>
```

Standalone-scoped so browser mode gets no extra flex-`gap-4` row. Variant strings untouched (`inset-y-0 h-full` kept); `bottom`/`top` variants untouched. Comment documents the `.pb-shell-safe` blast-radius boundary.

### R2 — slider moved inside the sticky band (zero new CSS)

- **New** `apps/web/src/components/budgeting/tasks/active-pill-task-slider.tsx`: client shim — active pill from `usePathname()` (same prefix match as BdpTabs), deep-link `?task=` from `useSearchParams()`, `key={pill}` remount per tab.
- `budgets/[id]/layout.tsx`: renders `<ActivePillTaskSlider>` (Suspense-wrapped) inside `[data-bdp-tabs]`, after `<BdpTabs>`, reusing the layout's existing `initialTasks` fetch.
- `wallets/spendings/reserves/settings/page.tsx`: slider render + per-page `fetchInitialTasks` + `?task=` plumbing removed.
- `pill-task-slider.tsx`: outer wrapper `mt-3` → `mb-3 mt-3` (gutter above the band's `border-b`).
- `global.css` NOT modified — all shell rules (`.pb-shell-safe`, `[data-shell-header]`, `[data-bdp-tabs]`) byte-identical.

## Geometry Proof (Regression 2, live against budget-dev, rebuilt image BUILD_ID `Mk_KclAZ08F5i13w45ggq`)

| Project  | Viewport | Header (y/h/bottom) | Banner at rest (y/h) | After scrollY=400 (banner y) | Verdict                              |
| -------- | -------- | ------------------- | -------------------- | ---------------------------- | ------------------------------------ |
| chromium | 1280x720 | 0 / 65 / 65         | 125 / 46             | 125                          | banner top 125 >= header bottom 65 ✓ |
| mobile   | 390x844  | 0 / 65 / 65         | 125 / 46             | 125                          | banner top 125 >= header bottom 65 ✓ |

Pre-fix RED (same scenario, mobile): banner y = **-274** after scroll → occluded. The after-scroll step also asserts `window.scrollY > 50` so a too-short page can never produce a false pass (scenario seeds 12 categories with limits for real scroll room).

## Verification

- `bun run test -- shell-safe-area`: **9/9 green** (new decoupling guard + all pre-existing standalone/browser/header/PTR/lvh/viewport-fit guards).
- Full web Vitest suite: **625 passed, 0 failed** (77 files; 3 skipped files pre-existing).
- `bunx tsc --noEmit`: clean.
- New E2E geometry scenario: green on chromium + mobile (table above).
- Regression sweep (`bdp-tab-frame spendings category-archive tasks` vs budget-dev): **78 passed, 6 skipped (pre-tagged @skip), 0 failed** — includes every @tasks-redesign slider scenario (collapsed/expand/row/resolve/badges) and all sheet open/close flows (CategorySlider create/edit, draft confirm/dismiss/promote).
- Served bundle verified inside the container (`data-sheet-safe-area` in server pages; `mb-3 mt-3` slider chunk in the BDP layout client JS) — no stale-cache false pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RED scenario seeded the wrong pill/tab combination**

- **Found during:** Task 1 (making RED honest)
- **Issue:** Draft scenario seeded RESERVE_TOPUP but opened the spendings tab and measured the spendings-pill banner; RESERVE_TOPUP maps to the _reserves_ pill (kind-pill-map.ts) so the banner never rendered.
- **Fix:** Scenario opens the reserves tab and measures the reserves-pill banner (mirrors tasks.feature); added 12-category seeding Given + `window.scrollY > 50` honesty guard.
- **Files modified:** bdp-tab-frame.feature, bdp-shell-geometry.steps.ts
- **Commit:** da386b2

**2. [Rule 1 - Bug] Plan-prescribed `pb-*` fix would be silently defeated**

- **Found during:** Task 2 diagnosis
- **Issue:** All three sliders pass `p-0` — tailwind-merge strips a variant-level `pb-[env(...)]`; additionally iOS ignores end-of-scroll padding on scroll containers (the sheet content scrolls).
- **Fix:** Real in-flow spacer child, standalone-scoped (plan allowed an equivalent safe-area-aware mechanism; required comment kept).
- **Files modified:** sheet.tsx
- **Commit:** d519d15

**3. [Rule 1 - Bug] Plan's DOM assumption stale — banner was never inside the band**

- **Found during:** Task 2 diagnosis (plan instructed: "verify current DOM ... confirm it is within the sticky wrapper")
- **Issue:** Tab pages rendered the slider as page content below the band; the plan's preferred "in-wrapper, zero-CSS" approach therefore required moving the render site.
- **Fix:** New ActivePillTaskSlider in the BDP layout's sticky wrapper; slider removed from 4 tab pages (files beyond the plan's files_modified list: 4 pages + new component + pill-task-slider.tsx margin).
- **Commit:** d519d15

**4. [Rule 1 - Test refinement] New guard contradicted the plan's required comment**

- **Found during:** Task 2 verify
- **Issue:** Guard asserted sheet.tsx contains no `pb-shell-safe` literal, but the plan also mandates a comment mentioning `.pb-shell-safe` in sheet.tsx.
- **Fix:** Guard strips comments before the not-match — the functional assertion (no class usage in code) is fully preserved.
- **Files modified:** shell-safe-area.test.ts
- **Commit:** d519d15

**5. Task 3 produced no file delta** — feature + steps shipped in the RED commit; geometry proof recorded here instead of an empty `test(...)` commit.

## Authentication Gates

None.

## Known Stubs

None.

## Commits

- `da386b2` test(quick-260612-a0c): RED — geometry guards for PWA popup + browser banner regressions
- `d519d15` fix(quick-260612-a0c): GREEN — decouple right-side sheets from .pb-shell-safe; keep tasks banner below pinned header

## Self-Check: PASSED

All created/modified files exist on disk; commits da386b2 and d519d15 present in git log; working tree clean except pre-existing out-of-scope 08-UAT.md modification and the (intentionally uncommitted) .planning/quick/260612-a0c-\* artifacts.

## Remaining Human Step (the only one)

Real-device standalone PWA (iOS): open the three edit sheets — **edit category**, **edit transaction**, **edit recurring rule** — and confirm each reaches the screen bottom with no gap above the home indicator, and that full-page scroll still clears the last row past the bottom bar. `display-mode: standalone` is not Playwright-emulatable and no webkit project exists, so this is guarded by Vitest source/rule assertions only.
