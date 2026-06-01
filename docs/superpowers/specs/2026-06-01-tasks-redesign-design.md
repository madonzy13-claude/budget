# Tasks Display Redesign — Per-Pill Badges + Per-Pill Sliders

**Status:** Draft for review
**Date:** 2026-06-01
**Author:** Brainstorming session (Claude + user)
**Supersedes:** Phase 3 + Phase 7 task banner contract (D-PH3-14, BDP-03)

---

## 1. Motivation

Today a single accordion `TaskBanner` sits above the BDP pill bar and lists every pending task for the budget regardless of kind. This forces the user to read three task types in one strip and gives no signal at all on the home page (budget cards have no task indicator).

The redesign moves task affordances to the surfaces where the user is already looking:

1. A red numeric badge on each home-page **budget card** showing the total pending task count for that budget.
2. A red numeric badge on each BDP **pill** (Wallets / Spendings / Reserves / Settings) showing the pending count for kinds that map to that pill.
3. A **per-pill slider** below the pill bar inside each pill page that lists only the tasks belonging to that pill, with a hybrid expand rule.

The top banner is removed from the BDP entirely.

## 2. Scope

In scope:

- Three new components: `kind-pill-map.ts`, `pill-badge.tsx`, `pill-task-slider.tsx`.
- BDP layout: drop `TaskBanner` mount.
- Four pill pages: mount `PillTaskSlider` above content.
- `BdpTabs`: add per-pill badge.
- `BudgetCard`: add corner badge.
- API: extend `GET /budgets/active` response with `pendingTasksCount` per budget.
- i18n: 9 new strings (3 keys × 3 locales) for slider collapsed header.
- Tests: unit + component + integration + tenant-leak + E2E feature rewrite.
- Delete `task-banner.tsx` and its Vitest test in the same PR.

Out of scope:

- New task kinds.
- Changing the existing per-kind row UX (RESERVE_TOPUP deep-link, CUSHION deep-link, CONFIRM_DRAFT inline POST + optimistic collapse + sonner toast). `TaskBannerRow` is reused unchanged.
- Home-page polling (home stays RSC-only; badge values are fresh on every navigation).
- BDP default landing pill (stays `wallets` per UAT-PH5-T2-02).
- The `@skip-phase-07-debt` dedup scenario (orthogonal; carries over verbatim).

## 3. Decisions made during brainstorm

| #   | Decision                                                                                                          | Rationale                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | CONFIRM_DRAFT maps to the **Spendings** pill                                                                      | Recurring drafts materialize into spending rows; Spendings is the closest existing surface.                                                                   |
| D2  | Slider is **absent from DOM** when its filtered task list is empty                                                | Matches existing D-PH3-14 DOM rule and E2E gate.                                                                                                              |
| D3  | Badge content = **numeric count only**, no kind glyph or dot                                                      | Lowest visual noise; aggregates all kinds for that surface.                                                                                                   |
| D4  | Home card badge = **single total per budget**                                                                     | Per-pill chips on the home card add noise without enough payoff.                                                                                              |
| D5  | BDP root URL `/budgets/[id]` continues to redirect to `/budgets/[id]/wallets`                                     | Reverses no prior decision (UAT-PH5-T2-02). Spendings is opened on click like any other pill.                                                                 |
| D6  | Home-card click lands on default pill (current behavior)                                                          | Per-pill badges then guide the user to the right pill.                                                                                                        |
| D7  | Slider hybrid expand rule: **1 task → expanded, ≥2 → collapsed** on initial mount only                            | Auto-expand only fires on initial mount; later count changes never auto-toggle.                                                                               |
| D8  | Settings pill carries a badge **only if** count > 0 (same rule as every other pill)                               | No zero-badges anywhere. Settings has no task kind today, so its badge is dead code today, but the wiring is identical to every other pill — no special case. |
| D9  | Home `GET /budgets/active` is **extended** with `pendingTasksCount: number`                                       | Single round-trip on home. No new endpoint.                                                                                                                   |
| D10 | Pill slider reuses `["tasks", budgetId, "pending"]` React Query and filters client-side by kind→pill              | One 60 s poll drives all four BDP surfaces (badge × 4 pills + slider × 1).                                                                                    |
| D11 | Badge bg = `--trading-down` (#f6465d), fg = white                                                                 | Yellow-on-yellow contrast fails on the active pill; red is a semantic match for "needs attention" and is already in the token system.                         |
| D12 | Approach **B** (new components, old `TaskBanner` deleted) chosen over A (mutate existing) or C (context provider) | Honest component names; hybrid expand rule confined to one new file; row UX bit-identical via `TaskBannerRow` reuse.                                          |
| D13 | Home page **does not poll**                                                                                       | RSC-only; badge values refresh on next navigation.                                                                                                            |

## 4. Architecture

Three surfaces, one shared query.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Home (/[locale])                                                        │
│   GET /budgets/active (RSC, no poll)                                    │
│     → list w/ pendingTasksCount per budget                              │
│   BudgetCard ─── PillBadge (corner, count===0 → null)                   │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ BDP (/[locale]/budgets/[id]/...)                                        │
│                                                                         │
│   BdpLayout (RSC)                                                       │
│     prefetch ["tasks", budgetId, "pending"] via HydrationBoundary       │
│                                                                         │
│   BdpTabs (client, useQuery 60s)                                        │
│     ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                     │
│     │ Wallets │ │Spendings│ │Reserves │ │Settings │  ← per-pill        │
│     │   [2]   │ │   [1]   │ │   [1]   │ │         │     PillBadge      │
│     └─────────┘ └─────────┘ └─────────┘ └─────────┘                     │
│                                                                         │
│   Pill page (e.g. /reserves)                                            │
│     PillTaskSlider pill="reserves" (client, useQuery 60s — same key)    │
│       filters via kindsFor("reserves") = ["RESERVE_TOPUP"]              │
│       hybrid expand: filtered.length===1 → expanded initial state       │
│                      filtered.length >= 2 → collapsed initial state     │
│       renders <TaskBannerRow> children (unchanged)                      │
│                                                                         │
│   [pill content]                                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

Single source of truth for the kind↔pill relation: `kind-pill-map.ts`.

```ts
export type Pill = "wallets" | "spendings" | "reserves" | "settings";

export const KIND_TO_PILL = {
  RESERVE_TOPUP: "reserves",
  CUSHION_BELOW_TARGET: "wallets",
  CONFIRM_DRAFT: "spendings",
} as const satisfies Record<TaskKind, Pill>;

export function pillFor(kind: TaskKind): Pill;
export function kindsFor(pill: Pill): readonly TaskKind[];
```

## 5. Component inventory

### 5.1 New (3 files)

```
apps/web/src/components/budgeting/tasks/
├── kind-pill-map.ts          # pure const + 2 fns, no React
├── pill-badge.tsx            # numeric badge for BdpTabs + BudgetCard
└── pill-task-slider.tsx      # accordion + hybrid 1/≥2 expand rule
```

- **`PillBadge`** — props `{ count: number }`. Returns `null` when `count===0`. Renders `<span>` w/ `bg-[var(--trading-down)] text-white` + radius/padding. Position handled by parent via `relative` wrapper.

- **`PillTaskSlider`** — props `{ budgetId, locale, pill, initialTasks }`. Subscribes to `["tasks", budgetId, "pending"]`. Filters via `kindsFor(pill)`. Mounts iff `filtered.length >= 1`. Initial `expanded` state derived from `filtered.length === 1`. Escape collapses when expanded. Visibility-change invalidates query. Renders `<TaskBannerRow>` for each filtered row. Collapsed header copy: `t("bdp.pillSlider.collapsedHeader", {count})` ("N tasks pending"). Yellow `⚠` lucide icon for both states.

### 5.2 Modified (4 files)

- `app/[locale]/(app)/budgets/[id]/layout.tsx` — drop `TaskBanner` mount + `fetchInitialTasks` + the `TaskBanner` / `TaskSummary` imports. The sticky wrapper now wraps `<BdpTabs>` only. RSC fetches initial tasks and seeds React Query cache via `HydrationBoundary` so pill pages don't waterfall.

- `app/[locale]/(app)/budgets/[id]/{wallets,spendings,reserves,settings}/page.tsx` — each top-level mounts `<PillTaskSlider pill="<slug>" budgetId={id} locale={locale} initialTasks={initialTasks}/>` immediately above content. RSC fetches initial tasks (one call per pill page render — Next.js dedupes with the layout's prefetch).

- `components/budgeting/bdp-tabs.tsx` — add `<PillBadge count={countFor(slug)}/>` inside each pill `NavLink`. `countFor` derives from the shared `useQuery` data via `pillFor(task.kind)` grouping.

- `components/budgeting/budget-card.tsx` — read `pendingTasksCount` from the already-fetched `BudgetSummary` and render `<PillBadge count={pendingTasksCount}/>` absolute top-right.

### 5.3 Deleted (2 files)

- `components/budgeting/task-banner.tsx`
- `apps/web/test/components/budgeting/task-banner.test.tsx`

`TaskBannerRow` and its test stay — both new sliders depend on it.

### 5.4 Backend

- `apps/api/src/routes/budgets.ts` — extend `GET /budgets/active` SQL with a `LEFT JOIN` aggregating `COUNT(*) FILTER (WHERE status='PENDING')` from `budgeting.tasks` grouped by `budget_id`, surfaced as `pendingTasksCount` (default 0 via `COALESCE`). RLS-scoped automatically.
- Response shape change is additive — existing consumers ignore the new field.

### 5.5 i18n

New keys (9 strings = 3 keys × 3 locales):

- `bdp.pillSlider.collapsedHeader` — "{count, plural, one {# task pending} other {# tasks pending}}"
- `bdp.pillSlider.expandAria` — "Expand task list"
- `bdp.pillSlider.collapseAria` — "Collapse task list"

Existing `bdp.tasks.title.*`, `bdp.tasks.action.*.label`, `bdp.tasks.kind.*` keys are unchanged (rows still render via `TaskBannerRow`).

## 6. Data flow

### 6.1 Home page

```
RSC: GET /budgets/active
  → server: existing SQL + LEFT JOIN tasks aggregate
  → response: BudgetSummary[] including pendingTasksCount
  → BudgetCard reads pendingTasksCount from props (no extra fetch)
```

No client polling on home.

### 6.2 BDP load

```
RSC (BdpLayout):
  serverApiFetch(id, "/budgets/${id}/tasks?status=pending")
  → seeds queryClient cache via HydrationBoundary
  → pill page renders w/ initialData; no client first-fetch waterfall

Client (BdpTabs + PillTaskSlider, same query key):
  useQuery({
    queryKey: ["tasks", budgetId, "pending"],
    initialData: <hydrated>,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
  → React Query de-dups: one network call per 60 s drives all surfaces
```

### 6.3 Auto-resolve (unchanged from Phase 7)

- RESERVE_TOPUP / CUSHION_BELOW_TARGET: action button navigates to deep-link; user fixes underlying state; server-side recompute (existing inline hooks) marks task RESOLVED; next poll drops it; slider unmounts if filtered list becomes empty.
- CONFIRM_DRAFT: inline POST → optimistic remove from cache → server confirms.
- visibility-change → `queryClient.invalidateQueries({queryKey: ["tasks", budgetId, "pending"]})`.

## 7. Error handling

- **Tasks API 5xx**: RSC fallback `initialTasks = []` (same as today); client `useQuery` keeps last good cache. Silent degrade — no toast.
- **`/budgets/active` 5xx**: existing home error UI unchanged; `pendingTasksCount` ride-along never reached. Partial SQL failure → `COALESCE(_, 0)` → badge absent.
- **CONFIRM_DRAFT mutation 4xx/5xx**: row revert + sonner error toast via `bdp.tasks.confirmError` (unchanged contract from Plan 07-08).
- **Missing i18n key**: next-intl falls back to key path; covered by component test asserting all 9 new keys exist in en/pl/uk.
- **Cross-tenant**: new SQL JOIN against `budgeting.tasks` runs under app role with existing RLS policy; tenant-leak test asserts isolation.

## 8. Edge cases

- **1 → 2 mid-session**: slider stays in current expand state (no forced collapse).
- **≥2 → 1**: slider stays in current expand state (no forced expand).
- **1 → 0**: slider unmounts.
- **0 → 1**: slider mounts auto-expanded.
- **Settings pill, current scope**: kindsFor("settings") === []; badge count always 0; badge always null. No special-case code — the same generic rule applies.
- **Reserves pill hidden** (reservesEnabled=false, D-PH5-R11): pill is absent from `BdpTabs`; no Reserves badge; no Reserves slider mount. RESERVE_TOPUP tasks in that state are an upstream emit-bug, not a UI concern.

## 9. Testing

### 9.1 Unit (bun:test, packages/budgeting/test/)

- `kind-pill-map.test.ts` — assert each TaskKind has exactly one Pill mapping; `kindsFor("settings")` returns `[]`; round-trip `kindsFor(pillFor(kind)).includes(kind)`.

### 9.2 Component (Vitest + RTL, apps/web/test/components/budgeting/tasks/)

- `pill-badge.test.tsx`
  - renders count
  - returns null when count===0
  - has `bg-[var(--trading-down)]` class
- `pill-task-slider.test.tsx`
  - filters by pill (Reserves slider hides CONFIRM_DRAFT row, etc.)
  - 1 task → expanded on initial mount
  - ≥2 tasks → collapsed on initial mount
  - 1→2 mid-session → expand state unchanged
  - 1→0 → unmounts (returns null)
  - Escape collapses when expanded
  - visibility-change → invalidates query
- `bdp-tabs.test.tsx` (extend) — 1 task on Reserves only → only Reserves pill renders badge; Settings never shows badge in default 3-kind world.
- `budget-card.test.tsx` (extend) — `pendingTasksCount=0` → no badge; `>0` → red badge w/ correct count.

### 9.3 Integration (bun:test, apps/api/test/routes/)

- `budgets-active.test.ts` (extend)
  - response includes `pendingTasksCount` field
  - empty budget → 0
  - budget w/ N PENDING tasks → N
  - RESOLVED tasks not counted

### 9.4 Tenant-leak (tests/tenant-leak/)

- `budgets-active-tasks-count-cross-tenant.test.ts` (new) — tenant A's `pendingTasksCount` unaffected by tenant B's tasks.
- `make ci-gate` count: **8 files → 9 files** (Makefile comment updated).

### 9.5 E2E (apps/web/e2e/features/, playwright-bdd)

- Feature file renamed: `task-banner.feature` → `tasks.feature`
- 11 scenarios, all tagged with the new phase tag (e.g. `@tasks-redesign` or the next-phase number assigned at planning time):
  - Home shows red badge w/ count on budget w/ pending tasks
  - Home shows no badge on budget w/ 0 pending tasks
  - Reserves pill shows red "1" badge when RESERVE_TOPUP pending
  - Wallets pill shows red "1" badge when CUSHION_BELOW_TARGET pending
  - Spendings pill shows red "1" badge when CONFIRM_DRAFT pending
  - Settings pill never shows badge (3-kind scope)
  - Reserves: 1 RESERVE_TOPUP → slider mounted expanded; row + action visible
  - Reserves: 2 RESERVE_TOPUPs → slider mounted collapsed; click expands
  - RESERVE_TOPUP action → /reserves?task=<id>
  - CUSHION action → /wallets?task=<id>&focus=cushion
  - CONFIRM_DRAFT action → inline POST + optimistic collapse + toast
  - Auto-resolve: server resolves → slider unmounts within 90 s
  - Mobile 390×844: pill bar wraps OK; badges visible; slider readable
- `@skip-phase-07-debt` dedup scenario carries over verbatim into `tasks.feature`. (Tag rename to match the new phase number is at planner discretion — the scenario body is unchanged.)

### 9.6 Page Objects (apps/web/e2e/page-objects/)

- `BdpTabsPo` (new) — `getPillBadge(pill: Pill): Locator`
- `HomePo` (extend) — `getCardBadge(budgetName: string): Locator`
- `TaskBannerPo` deleted; replaced by `PillTaskSliderPo` with the same methods (`waitForVisible`, `clickAction`, `getRow(kind)`).

## 10. TDD order

Red→green per task:

1. Tenant-leak test red first.
2. Server: extend `/budgets/active` SQL — green.
3. Component tests red (mapping, badge, slider).
4. New 3 component files — green.
5. Layout/page-wiring tests red.
6. Edit BdpLayout + 4 pill pages + bdp-tabs + budget-card — green.
7. E2E feature rewrite red (against running stack).
8. Final fixups — green.
9. Delete `task-banner.tsx` + test — re-run full `make ci-gate` + Vitest + E2E green.

## 11. Migration plan

- Single PR, single new phase (working title: **Tasks Redesign**; final phase number assigned in ROADMAP at plan time).
- No feature flag — banner removal and slider+badge introduction are atomic.
- Docker rebuild for `web` after frontend edits per `feedback_always_rebuild_web`.
- Phase 7 UAT.md gets a note pointing forward to the Tasks Redesign phase (top banner replaced; current banner-based UAT scenarios superseded).

## 12. Open questions

None at spec time. If new ones emerge during implementation, they go into the new phase's CONTEXT.md.

## 13. References

- DESIGN.md (UI source of truth — yellow accent + Binance dark canvas; `--trading-down` token already present)
- CLAUDE.md (TDD-first, no DB mocks, Page Object E2E pattern)
- Phase 3 Plan 03-06 (BDP-03 — original task banner contract)
- Phase 7 Plans 07-08 / 07-09 / 07-10 (per-kind row UX + i18n + E2E rewrite)
- `feedback_always_rebuild_web`, `feedback_e2e_gherkin`, `feedback_design_md_authority` (auto-memory)
