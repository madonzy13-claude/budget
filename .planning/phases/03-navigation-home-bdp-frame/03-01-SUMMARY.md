---
phase: 03-navigation-home-bdp-frame
plan: 01
subsystem: infra

tags: [react-query, playwright-bdd, gherkin, e2e, nextjs, wave-0]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Better Auth + Drizzle + [locale]/(app) route group already established"
  - phase: 02-domain-api-restructure
    provides: "users.display_currency column present in drizzle/0001_overjoyed_echo.sql (no migration this plan)"
provides:
  - "@tanstack/react-query@5 client mounted globally via QueryProvider at [locale]/layout.tsx"
  - "TestQueryProvider + makeTestQueryClient harness for Vitest component tests"
  - "playwright-bdd@8 installed and bound via apps/web/playwright.config.ts using v8 defineBddConfig({features, steps}) API"
  - "e2e/{features,page-objects,fixtures}/ directory scaffold with .gitkeep markers"
  - "fresh-user-per-scenario fixture skeleton (Plan 03-07 fills in real Better Auth signup wiring)"
  - "Hard-deletion of v1.0 /workspaces page tree (8 files) — unblocks Plan 03-04 top-nav rewrite"
affects: [03-02, 03-03, 03-04, 03-05, 03-06, 03-07, 04-grid, 08-pwa]

# Tech tracking
tech-stack:
  added:
    - "@tanstack/react-query@^5"
    - "@tanstack/react-query-devtools@^5"
    - "playwright-bdd@^8"
    - "@playwright/test@^1.60"
  patterns:
    - "QueryProvider mounted at locale layout (above (app) group) so future public routes inherit the same client"
    - "playwright-bdd v8 features/steps glob API (NOT v7 paths/require)"
    - "PLAYWRIGHT_BASE_URL env-driven baseURL (CLAUDE.md memory feedback_test_baseurl)"
    - "Hard-delete legacy routes — no 301 redirects (D-PH3-17, Phase 1 D-09 'no aliases')"

key-files:
  created:
    - "apps/web/src/components/providers/query-provider.tsx"
    - "apps/web/test/setup/query-client.tsx"
    - "apps/web/playwright.config.ts"
    - "apps/web/e2e/features/.gitkeep"
    - "apps/web/e2e/page-objects/.gitkeep"
    - "apps/web/e2e/fixtures/fresh-user-per-scenario.ts"
  modified:
    - "apps/web/package.json"
    - "apps/web/src/app/[locale]/layout.tsx"
    - "bun.lock"
  deleted:
    - "apps/web/src/app/[locale]/(app)/workspaces/page.tsx"
    - "apps/web/src/app/[locale]/(app)/workspaces/[wsId]/layout.tsx"
    - "apps/web/src/app/[locale]/(app)/workspaces/[wsId]/accounts/page.tsx"
    - "apps/web/src/app/[locale]/(app)/workspaces/[wsId]/recurring/page.tsx"
    - "apps/web/src/app/[locale]/(app)/workspaces/[wsId]/transactions/page.tsx"
    - "apps/web/src/app/[locale]/(app)/workspaces/[wsId]/budget/page.tsx"
    - "apps/web/src/components/workspace/workspace-sidebar.tsx"
    - "apps/web/src/components/workspace/workspace-row.tsx"

key-decisions:
  - "QueryProvider mounted at [locale]/layout.tsx (outside the (app) group) so future public pages inherit it"
  - "QueryClient defaults: staleTime 30s, refetchOnWindowFocus false — explicit visibility listener will live in the task-banner hook instead (D-PH3-13)"
  - "playwright-bdd v8 API only — features/steps globs; deprecated v7 paths/require not used"
  - "fresh-user-per-scenario fixture is a stub on Wave 0; Plan 03-07 wires Better Auth signUpEmail() and cookie copy"
  - "Hard-delete legacy /workspaces tree via explicit per-file git rm (auditable; no -r)"
  - "Did NOT touch workspace-switcher.tsx (Plan 03-04 rewrite) or workspace-fetch{.server}.ts (Phase 1 D-08 shim) per 03-RESEARCH 'File Map: Delete'"
  - "Did NOT modify apps/web/src/app/[locale]/(app)/layout.tsx — string-href links to /workspaces remain until Plan 03-04 rewrites the layout"

patterns-established:
  - "QueryProvider: mount at locale layout, instantiate QueryClient in useState init so it survives StrictMode double-render"
  - "TestQueryProvider: gcTime 0, retry false, staleTime 0 — deterministic component tests"
  - "playwright-bdd v8: defineBddConfig consumed by defineConfig({ testDir }); no .bddrc needed"

requirements-completed:
  - NAV-05

# Metrics
duration: 7min
completed: 2026-05-12
---

# Phase 03 Plan 01: Wave 0 Prep — React Query, Playwright-BDD, Legacy /workspaces Deletion Summary

**React Query v5 client + provider mounted at locale layout; playwright-bdd v8 scaffolded with v8 features/steps API; v1.0 /workspaces page tree (8 files) hard-deleted to unblock Plan 03-04 top-nav rewrite.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-12T22:12:21Z
- **Completed:** 2026-05-12T22:19:24Z
- **Tasks:** 3
- **Files created:** 6
- **Files modified:** 3
- **Files deleted:** 8

## Accomplishments

- Installed `@tanstack/react-query@5.100.10` and `@tanstack/react-query-devtools@5.100.10` in `apps/web`; mounted `QueryProvider` above `NextIntlClientProvider` in `[locale]/layout.tsx` (staleTime 30s, refetchOnWindowFocus off)
- Added Vitest `TestQueryProvider` + `makeTestQueryClient` harness at `apps/web/test/setup/query-client.tsx` for upcoming Plan 03-04..06 component tests
- Installed `playwright-bdd@8.5.0` + `@playwright/test@1.60.0` and bound them via `apps/web/playwright.config.ts` using the v8 `defineBddConfig({ features, steps })` API (verified deprecated v7 `paths`/`require` keys are NOT present)
- Scaffolded `apps/web/e2e/{features,page-objects,fixtures}/` with `.gitkeep` markers and a fresh-user-per-scenario fixture skeleton; preserved existing `cross-tenant-cache.spec.ts` as Phase 8 migration debt per 03-RESEARCH Path A
- Hard-deleted 8 v1.0 workspace files (6 routes + `workspace-sidebar.tsx` + `workspace-row.tsx`) via explicit per-file `git rm` for audit trail; grep for `WorkspaceSidebar|WorkspaceRow|workspace-sidebar|workspace-row` in `apps/web/src/` now returns zero hits

## Task Commits

Each task was committed atomically:

1. **Task 1: Install React Query + scaffold QueryClient provider** — `6eba003` (feat)
2. **Task 2: Bootstrap playwright-bdd v8 + e2e scaffolding** — `71c3bb8` (feat)
3. **Task 3: Hard-delete v1.0 /workspaces page tree** — `a54a4ac` (chore)

**Plan metadata commit:** Pending (this SUMMARY.md commit)

## Files Created/Modified

### Created

- `apps/web/src/components/providers/query-provider.tsx` — Client `QueryProvider` wrapping `QueryClientProvider`; instantiates `QueryClient` via `useState` initializer so it survives React strict-mode double render. Defaults: `staleTime: 30_000`, `refetchOnWindowFocus: false`.
- `apps/web/test/setup/query-client.tsx` — Exports `makeTestQueryClient()` (retry off, gcTime 0, staleTime 0 for determinism) and `<TestQueryProvider>` for Vitest component tests.
- `apps/web/playwright.config.ts` — Uses v8 `defineBddConfig({ features: "e2e/features/**/*.feature", steps: ["e2e/page-objects/**/*.ts", "e2e/fixtures/**/*.ts", "e2e/steps/**/*.ts"] })`; `baseURL` reads `process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"`.
- `apps/web/e2e/features/.gitkeep` — Empty marker; Plan 03-07 lands real `.feature` files.
- `apps/web/e2e/page-objects/.gitkeep` — Empty marker.
- `apps/web/e2e/fixtures/fresh-user-per-scenario.ts` — Skeleton fixture extending `playwright-bdd` `test` base with `freshUser` (email/password/userId); Plan 03-07 replaces the `userId = "pending-implementation"` stub with real Better Auth `signUpEmail()` + session-cookie copy.

### Modified

- `apps/web/src/app/[locale]/layout.tsx` — Imports `QueryProvider` from `@/components/providers/query-provider`; wraps existing `<NextIntlClientProvider>` so the client lives outside the `(app)` route group and future public routes inherit it.
- `apps/web/package.json` — Added `@tanstack/react-query`, `@tanstack/react-query-devtools` (dependencies); added `playwright-bdd`, `@playwright/test` (devDependencies); added `"e2e": "bddgen && playwright test"` script. (Bun re-sorted the dependency keys alphabetically — pre-existing dependency ordering changed but no semantic difference.)
- `bun.lock` — Lockfile updated for 4 new packages + transitives.

### Deleted (8 files via `git rm`)

- `apps/web/src/app/[locale]/(app)/workspaces/page.tsx`
- `apps/web/src/app/[locale]/(app)/workspaces/[wsId]/layout.tsx`
- `apps/web/src/app/[locale]/(app)/workspaces/[wsId]/accounts/page.tsx`
- `apps/web/src/app/[locale]/(app)/workspaces/[wsId]/recurring/page.tsx`
- `apps/web/src/app/[locale]/(app)/workspaces/[wsId]/transactions/page.tsx`
- `apps/web/src/app/[locale]/(app)/workspaces/[wsId]/budget/page.tsx`
- `apps/web/src/components/workspace/workspace-sidebar.tsx`
- `apps/web/src/components/workspace/workspace-row.tsx`

## Decisions Made

- **QueryProvider placement:** Mounted at `[locale]/layout.tsx` (above the `(app)` group) so the same client serves future public/landing pages — matches 03-RESEARCH §"Mount in apps/web/src/app/[locale]/layout.tsx (outside (app) so future public pages can also use it)".
- **QueryClient defaults:** `staleTime: 30_000` from 03-RESEARCH Pattern §4; `refetchOnWindowFocus: false` because the task-banner hook (D-PH3-13) implements its own `document.visibilitychange` listener.
- **v8 API only:** `playwright.config.ts` uses `features` + `steps` glob strings. Verified `paths:` and `require:` keys are absent (`grep -c` returned 0 for both).
- **Lockfile committed:** `bun.lock` lives at the monorepo root (not `apps/web/bun.lock`); committed with each task that touches dependencies.
- **`.gitkeep` markers:** Used to preserve empty `features/` and `page-objects/` directories until Plan 03-07; chose `.gitkeep` over `.bddrc` because v8 needs no on-disk config file (configuration is entirely in `playwright.config.ts`).
- **Did NOT delete `workspace-switcher.tsx`:** Plan 03-04 owns its rewrite + relocation to `components/budgeting/budget-switcher.tsx` per 03-RESEARCH "Out-of-phase but adjacent".
- **Did NOT modify `(app)/layout.tsx`:** Contains only a string-href reference (`{t("workspaces")}` i18n key on line 53, no import of deleted modules); Plan 03-04 rewrites the layout to mount `<TopNav>`. Leaving stale string hrefs for one wave is acceptable since TS compiles (string hrefs aren't typed against the file tree) and the `(app)` header is not on the hot path between waves.

## Deviations from Plan

None — plan executed exactly as written.

The only minor surprise was that the project's bun lockfile lives at the **monorepo root** (`/home/claude/budget/bun.lock`) rather than `apps/web/bun.lock`. This is consistent with Bun's workspace install behavior — committed correctly with each dependency-touching task.

## Issues Encountered

- **Stale `.next/types/` cache produced misleading typecheck errors after Task 1.** The cached `.next/types/app/[locale]/(app)/workspaces/[id]/page.ts` referenced a non-existent `[id]` route (current source uses `[wsId]`). Cleared via `rm -rf .next` before re-running typecheck. Not a deviation — this is normal Next.js build artifact staleness. Subsequent typecheck runs were clean.

## User Setup Required

None — no external service configuration required for Wave 0. CLI tools (`bddgen`, `playwright`) installed via Bun; the existing `PLAYWRIGHT_BASE_URL` env contract from earlier phases remains the runtime authority for E2E base URL.

## Threat Flags

None — Wave 0 introduces no new auth, RLS, or input-validation surface. The plan's STRIDE register lists three `accept`/`mitigate` low-severity threats (npm-audit risk, bookmark 404s, CI baseURL fallback); all three remain in the documented disposition.

## Verification Evidence

- `grep -c '"@tanstack/react-query"' apps/web/package.json` → 1 ✓
- `grep -c '"@tanstack/react-query-devtools"' apps/web/package.json` → 1 ✓
- `head -1 apps/web/src/components/providers/query-provider.tsx` → `"use client";` ✓
- `grep -c 'QueryProvider' apps/web/src/app/[locale]/layout.tsx` → 2 ✓
- `grep -c '"playwright-bdd"' apps/web/package.json` → 1 ✓
- `grep -c '"@playwright/test"' apps/web/package.json` → 1 ✓
- `grep -c 'defineBddConfig' apps/web/playwright.config.ts` → 1 ✓
- `grep -c 'features:' apps/web/playwright.config.ts` → 1 ✓
- `grep -c 'steps:' apps/web/playwright.config.ts` → 1 ✓
- `grep -c 'paths:[[:space:]]*\[' apps/web/playwright.config.ts` → 0 ✓ (no deprecated v7 keys)
- `grep -c '\brequire:' apps/web/playwright.config.ts` → 0 ✓
- `grep -c 'PLAYWRIGHT_BASE_URL' apps/web/playwright.config.ts` → 1 ✓
- `! test -e apps/web/src/app/[locale]/(app)/workspaces/page.tsx` → true ✓
- `! test -e apps/web/src/components/workspace/workspace-sidebar.tsx` → true ✓
- `! test -e apps/web/src/components/workspace/workspace-row.tsx` → true ✓
- `grep -rn 'WorkspaceSidebar\|WorkspaceRow\|workspace-sidebar\|workspace-row' apps/web/src/` → zero hits (exit 1) ✓
- `test -f apps/web/src/components/workspace/workspace-switcher.tsx` → exists ✓ (preserved for Plan 03-04)
- `test -f apps/web/src/lib/workspace-fetch.server.ts` → exists ✓ (preserved per Phase 1 D-08)
- `cd apps/web && bun run typecheck` → exit 0 ✓ (after `.next/` cache cleared)

## Next Phase Readiness

Plans 03-02 through 03-07 may now assume:

- `useQuery` / `useMutation` from `@tanstack/react-query` are available in any client component under `[locale]`.
- Vitest component tests can wrap subjects with `<TestQueryProvider>` from `apps/web/test/setup/query-client`.
- E2E features can land at `apps/web/e2e/features/*.feature` and step definitions at `apps/web/e2e/page-objects/*.ts` / `e2e/fixtures/*.ts`; `bun run e2e` invokes `bddgen && playwright test`.
- No `/workspaces/*` route handlers exist — Plan 03-04 may freely rewrite `(app)/layout.tsx` to mount `<TopNav>` without coordinating with stale page files.
- `workspace-switcher.tsx` is intentionally still present at `apps/web/src/components/workspace/workspace-switcher.tsx` — Plan 03-04 owns its rewrite and relocation.

No blockers.

## Self-Check: PASSED

All 6 created files exist on disk. All 8 deleted files confirmed absent. All 3 task commits (`6eba003`, `71c3bb8`, `a54a4ac`) present in `git log --oneline --all`.

---

_Phase: 03-navigation-home-bdp-frame_
_Completed: 2026-05-12_
