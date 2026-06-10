---
phase: 03-navigation-home-bdp-frame
plan: 04
subsystem: ui
tags:
  [
    next.js,
    react,
    next-intl,
    radix-popover,
    lucide,
    tailwind,
    middleware,
    rsc,
    tdd,
  ]

# Dependency graph
requires:
  - phase: 03
    provides: "Plan 03-01 mounted React Query and deleted /workspaces route; Plan 03-02 dual-emit /budgets/active body { budgets, workspaces }"
provides:
  - "Popover-based BudgetSwitcher client component with Personal/Shared groups, leading Check active row, currency Badge, empty-state CTA, z-[60] PopoverContent"
  - "NewBudgetButton (ghost icon, lucide Plus) routing to /${locale}/budgets/new"
  - "TopNav async RSC composition (BrandMark + BudgetSwitcher + NewBudgetButton + LocaleSelect + SignOutButton) fetching /budgets/active server-side"
  - "Rewritten (app)/layout.tsx — preserves session-gate verbatim, mounts <TopNav>, derives activeBudgetId from middleware x-pathname header, header z-50"
  - "Extended middleware.ts injecting x-pathname request header on the final non-redirect pass (OVERWRITE; defense against client spoofing T-03-04-06)"
  - "Deleted v1.0 workspace switcher (workspace-switcher.tsx + workspace-switcher.test.tsx)"
  - "EN i18n keys under nav.{budgetSwitcher.trigger.aria, switcher.{personal, shared, empty.{trigger, body, cta}}, newBudget, newBudgetTooltip}"
affects:
  [
    03-05 BDP,
    03-06 BDP layout sticky wrapper z-40 + tasks banner,
    03-07 PL/UK i18n mirror,
    03-08 e2e BDD,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Radix Popover + happy-dom: open via userEvent.click(trigger) for component tests"
    - "RSC fetches /budgets/active via serverApiFetch(null, path); dual-key body.budgets ?? body.workspaces for the Phase 3 transition"
    - "Middleware-injected x-pathname header — RSC layout reads via headers().get('x-pathname'); regex extracts UUID budget id (skips /settings, /budgets/new)"

key-files:
  created:
    - apps/web/src/components/budgeting/budget-switcher.tsx
    - apps/web/src/components/budgeting/new-budget-button.tsx
    - apps/web/src/components/budgeting/top-nav.tsx
    - apps/web/test/components/budgeting/budget-switcher.test.tsx
    - apps/web/test/components/budgeting/new-budget-button.test.tsx
    - .planning/phases/03-navigation-home-bdp-frame/deferred-items.md
  modified:
    - apps/web/src/middleware.ts
    - apps/web/src/app/[locale]/(app)/layout.tsx
    - apps/web/messages/en.json
  deleted:
    - apps/web/src/components/workspace/workspace-switcher.tsx
    - apps/web/test/workspace-switcher.test.tsx

key-decisions:
  - "LocaleSelect import path adapted: @/components/settings/locale-select (the actual file location) instead of @/components/common/locale-select (plan assumption). Component takes initialLocale prop (not locale)."
  - "Test 1 asserts at-least-one occurrence of 'My Budget' (not exactly one) because the active budget name appears in both the trigger label AND the menuitemradio row when activeBudgetId matches that row — a single getByText fails Found-multiple."
  - "x-pathname middleware injection OVERWRITES (not set-if-absent) so client-supplied values are discarded — T-03-04-06 mitigation."
  - "Header z-index bumped from z-40 to z-50 so the BudgetSwitcher PopoverContent z-[60] floats above it while the future BDP sticky wrapper z-40 (Plan 03-06) renders below."

patterns-established:
  - "Top-nav RSC composition pattern: async RSC fetches user-scoped data via serverApiFetch(null, '/path'), passes props to client subcomponents that drive interaction. Future BDP layout can mirror this structure with serverApiFetch(budgetId, ...)."
  - "Pathname-aware RSC layouts: middleware clones request headers, sets x-pathname = request.nextUrl.pathname, RSC consumes via headers(). Will be reused by Plan 03-06 BDP layout for active-tab derivation."
  - "Dual-emit transition pattern: web fetchers fall back body.budgets ?? body.workspaces during a renaming wave; once Plan 03-08 lands, drop the alias."

requirements-completed: [NAV-01, NAV-02, NAV-03, NAV-04]

# Metrics
duration: ~8 min
completed: 2026-05-12
---

# Phase 03 Plan 04: TopNav + BudgetSwitcher (v1.1 IA chrome) Summary

**Popover-based BudgetSwitcher with Personal/Shared groups + ghost NewBudgetButton, composed into a TopNav RSC, mounted in the rewritten (app)/layout that derives activeBudgetId from a middleware-injected `x-pathname` header.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-12T23:16:06Z
- **Completed:** 2026-05-12T23:24:30Z
- **Tasks:** 3
- **Files created:** 6 (3 components, 2 test files, 1 deferred-items doc)
- **Files modified:** 3 (middleware, (app)/layout, en.json)
- **Files deleted:** 2 (legacy workspace switcher + its test)

## Accomplishments

- **NAV-01..04 shipped** — top-nav switcher (Lock/Users icon + name + ChevronDown trigger; Personal/Shared groups; leading Check on active row, no yellow bg; aside Plus button; click row → /${locale}/budgets/${id}/spendings).
- **Empty-state path** — zero-budget user sees "No budgets yet" trigger label and a Create-budget CTA that routes to /budgets/new (no `menuitemradio` rows rendered).
- **Pathname header plumbing** — middleware injects `x-pathname` on the final non-redirect pass; layout extracts the active budget UUID via regex so `/en/settings` and `/en/budgets/new` don't spuriously match.
- **v1.0 cleanup** — workspace-switcher.tsx + workspace-switcher.test.tsx deleted (final piece of the Sheet-based switcher tree). The remaining workspace/\* files belong to Phase 6.
- **13 new Vitest cases** (9 BudgetSwitcher + 4 NewBudgetButton) all green; typecheck + lint clean; full web suite passes except 1 pre-existing Phase 02 failure (transaction-edit-form.test.tsx — see deferred-items.md).

## Task Commits

1. **Task 1: BudgetSwitcher (TDD)** — `ff989f9` (feat) — RED → GREEN single commit since the test file imports the component directly; failing-test gate verified before implementation.
2. **Task 2: NewBudgetButton + TopNav RSC** — `5ba2455` (feat) — same TDD pattern; 4 NewBudgetButton cases plus the TopNav composition.
3. **Task 3: middleware x-pathname + (app)/layout rewrite + legacy delete** — `3ebb164` (feat).

_Note: TDD RED was verified separately (import-resolution failure before each component existed) before committing; the per-task commits roll the test + implementation together since the test file was new._

## Files Created/Modified

### Created

- `apps/web/src/components/budgeting/budget-switcher.tsx` — Popover-based client component; Personal/Shared groups; empty-state branch; z-[60] PopoverContent.
- `apps/web/src/components/budgeting/new-budget-button.tsx` — Ghost icon Button → `/${locale}/budgets/new`.
- `apps/web/src/components/budgeting/top-nav.tsx` — Async RSC; serverApiFetch + dual-key fallback; max-w-[1280px], h-16, px-4 sm:px-8.
- `apps/web/test/components/budgeting/budget-switcher.test.tsx` — 9 Vitest cases (NAV-01/02/04 + empty + z-index).
- `apps/web/test/components/budgeting/new-budget-button.test.tsx` — 4 Vitest cases (aria-label, Plus icon, push path, variant/size).
- `.planning/phases/03-navigation-home-bdp-frame/deferred-items.md` — logs pre-existing Phase 02 test failure as out-of-scope.

### Modified

- `apps/web/src/middleware.ts` — appended x-pathname header injection on final non-redirect pass; preserved all redirect branches.
- `apps/web/src/app/[locale]/(app)/layout.tsx` — replaced inline header with `<TopNav>`; preserved session-gate; bumped header z-index 40 → 50.
- `apps/web/messages/en.json` — extended `nav.*` with nested `budgetSwitcher`, `switcher`, `newBudget`, `newBudgetTooltip` keys.

### Deleted

- `apps/web/src/components/workspace/workspace-switcher.tsx` — replaced by budget-switcher.tsx.
- `apps/web/test/workspace-switcher.test.tsx` — replaced by test/components/budgeting/budget-switcher.test.tsx.

## Decisions Made

- **LocaleSelect import path** — the canonical file is `@/components/settings/locale-select` (not `@/components/common/locale-select` as the plan assumed). It takes `initialLocale` prop, not `locale`. Plan deviation protocol applied: adapted, documented here.
- **Active-row text duplication in tests** — when `activeBudgetId` matches a row, the budget's name appears twice in the rendered output (trigger label + menuitemradio row). Test 1 asserts `getAllByText(...).length >= 1` and queries the role-scoped row, instead of a single `getByText` that would fail.
- **Header z-index 50** — bumped from the v1.0 `z-40` so the switcher's `z-[60]` PopoverContent floats above the header AND the planned BDP sticky wrapper `z-40` (Plan 03-06) renders below it. Three-layer stack (60 > 50 > 40) honored throughout.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] LocaleSelect import path correction**

- **Found during:** Task 2 (TopNav RSC composition)
- **Issue:** Plan referenced `@/components/common/locale-select` but the actual file lives at `@/components/settings/locale-select`. The plan also assumed a `locale` prop; the actual signature is `initialLocale`.
- **Fix:** Import from the real path and pass `initialLocale={locale}`.
- **Files modified:** `apps/web/src/components/budgeting/top-nav.tsx`.
- **Verification:** `bun run typecheck` exits 0; `bun run test` covers TopNav transitively via session-gate; no runtime mounting required by Plan 03-04 tests.
- **Committed in:** `5ba2455` (Task 2).

**2. [Rule 1 - Bug] Test 1 multi-occurrence on "My Budget"**

- **Found during:** Task 1 (TDD GREEN run)
- **Issue:** Initial test used `screen.getByText("My Budget")` but the active budget name appears in BOTH the trigger label (`triggerLabel = active.name`) AND inside the matching `menuitemradio` row. `getByText` threw `Found multiple elements`.
- **Fix:** Switched to `getAllByText(...).length >= 1` plus a scoped `getAllByRole("menuitemradio")` lookup with `textContent.includes`.
- **Files modified:** `apps/web/test/components/budgeting/budget-switcher.test.tsx`.
- **Verification:** All 9 Vitest cases green.
- **Committed in:** `ff989f9` (Task 1).

---

**Total deviations:** 2 auto-fixed (1 Rule 3 - blocking, 1 Rule 1 - bug)
**Impact on plan:** Both were trivial corrections. No scope creep. The LocaleSelect path correction matches the codebase as-shipped; the test fix aligns the assertion with the component's intentional duplication of the active name.

## Issues Encountered

- **Pre-existing Phase 02 test failure in `apps/web/test/components/transaction-edit-form.test.tsx`** — baseline `Tests 1 failed | 95 passed (96)` before any Plan 03-04 work; unchanged afterwards. Out-of-scope per scope-boundary rule. Logged to `.planning/phases/03-navigation-home-bdp-frame/deferred-items.md` for Phase 02 follow-up.

## Verification Gate Results

| Gate              | Command                                                                                                                     | Result                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Task 1            | `cd apps/web && bun run test budget-switcher`                                                                               | **9 / 9 PASS**                                                 |
| Task 2            | `cd apps/web && bun run test new-budget-button`                                                                             | **4 / 4 PASS**                                                 |
| Task 3 typecheck  | `cd apps/web && bun run typecheck`                                                                                          | **PASS**                                                       |
| Task 3 full suite | `cd apps/web && bun run test`                                                                                               | **102 / 103 PASS** (1 pre-existing Phase 02 failure, deferred) |
| Task 3 lint       | `cd apps/web && bun run lint`                                                                                               | **PASS**                                                       |
| Legacy deleted    | `! test -e apps/web/src/components/workspace/workspace-switcher.tsx && ! test -e apps/web/test/workspace-switcher.test.tsx` | **PASS**                                                       |
| Middleware grep   | `grep -q x-pathname apps/web/src/middleware.ts`                                                                             | **PASS**                                                       |
| Layout grep       | `grep -q x-pathname … && grep -q TopNav … && grep -q z-50 …`                                                                | **PASS**                                                       |

## User Setup Required

None — pure UI / middleware change. No env vars, no DB migrations.

## Next Phase Readiness

- **Plan 03-05 (Home page)** ready — TopNav RSC + middleware x-pathname plumbing is the chrome that the Home page renders inside.
- **Plan 03-06 (BDP layout + sticky wrapper)** ready — the z-50 header + z-[60] popover contract leaves z-40 for the BDP sticky wrapper as planned.
- **Plan 03-07 (PL/UK i18n)** has nested `nav.switcher.empty.{trigger,body,cta}` schema to mirror.
- **Plan 03-08 (Playwright BDD)** can drive the switcher via `[aria-label="Switch budget"]` trigger + `[role="menuitemradio"]` row selectors (stable contracts).

## Self-Check: PASSED

- All 6 created files exist on disk.
- All 2 deleted files are gone.
- All 3 task commits (`ff989f9`, `5ba2455`, `3ebb164`) present in `git log`.

---

_Phase: 03-navigation-home-bdp-frame_
_Completed: 2026-05-12_
