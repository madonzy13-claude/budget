---
quick_id: 260615-e8s
phase: quick
plan: 260615-e8s
subsystem: offline-ux
tags: [offline, pwa, idb, indicator, home]
tech-stack:
  added: []
  patterns:
    - IDB read-back fallback in queryFn catch (use-wallets, use-transactions, use-budget-data)
    - Client island write-on-visit + IDB read-when-empty (HomeOfflineCache)
    - Radix Popover for tap-to-close (replaces Tooltip + manual onClick race)
    - bumpGlobalSyncMeta on every budget tab mount (BdpTabs)
key-files:
  created:
    - apps/web/src/components/budgeting/home-offline-cache.tsx
    - apps/web/test/offline-readback.test.tsx
    - apps/web/test/home-offline-cache.test.tsx
  modified:
    - apps/web/src/components/common/offline-status-badge.tsx
    - apps/web/test/components/offline-status-badge.test.tsx
    - apps/web/src/lib/offline-cache.ts
    - apps/web/src/hooks/use-cache-on-fetch.ts
    - apps/web/src/hooks/use-wallets.ts
    - apps/web/src/hooks/use-transactions.ts
    - apps/web/src/hooks/use-budget-data.ts
    - apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx
    - apps/web/src/components/budgeting/wallets-tab/wallets-sectioned-list.tsx
    - apps/web/src/components/budgeting/bdp-tabs.tsx
    - apps/web/src/app/[locale]/(app)/page.tsx
    - apps/web/test/offline-cache.test.ts
    - apps/web/test/offline-write-path.test.tsx
decisions:
  - Unplug icon + testid "offline-cloud-off" kept stable to avoid cascading test churn
  - Popover replaces Tooltip: native tap-to-close eliminates manual onClick race
  - WalletDto has no budgetId field; offline wallet read-back returns all cached wallets (per-browser per-tenant, safe)
  - BudgetCard is server-only; HomeOfflineCache passes cached list into HomeCardsGrid (no BudgetCard boundary issue)
  - bumpGlobalSyncMeta exported from use-cache-on-fetch.ts (re-export) for single import path
  - SpendingsGridClient caches categories (localCategoryOrder) not the summary object (derived, not stored)
  - use-spendings-summary queryFn: no cached read-back added — summary is derived; categories+txns fallback is enough for grid
metrics:
  duration: ~20 minutes
  completed: "2026-06-15"
  tasks_completed: 5
  files_changed: 14
---

# Quick 260615-e8s: Offline Render Fixes Summary

One-liner: IDB write+read-back wired into real islands + active-budgets store + Unplug/Popover indicator polish.

## Tasks Completed

| Task | Name                               | Commit            | Status |
| ---- | ---------------------------------- | ----------------- | ------ |
| 1    | Swap CloudOff → Unplug             | 205867c           | DONE   |
| 2    | Swap Tooltip → Popover             | 7a2a9c8           | DONE   |
| 3    | Mount snapshot writer into islands | 9a61f43 + ea844e2 | DONE   |
| 4    | Read-back path in per-entity hooks | 3703a61 + 3b4976c | DONE   |
| 5    | Home offline render                | 578c7cc           | DONE   |

## What Was Fixed

**Issue 4 (icon):** `CloudOff` → `Unplug` from lucide-react. Testid `offline-cloud-off` kept stable.

**Issue 1 (tap race):** Replaced `Tooltip` + manual `onClick={() => setOpen(o => !o)}` with `Popover` which owns tap-to-open/close natively. The controlled-open + onClick reopen race is eliminated.

**Issue 2+3 (dead IDB write path / unknown cache age):** Root cause — `cacheBudgetSnapshot` was only called from `useBudgetData` which was never mounted. Fixed by:

- `SpendingsGridClient`: writes categories + transactions on `summary.isSuccess && txns.isSuccess`
- `WalletsSectionedList`: writes wallets on `walletsQuery.isSuccess`
- `BdpTabs`: calls `bumpGlobalSyncMeta()` on mount — every budget tab visit dates the indicator
- New `bumpGlobalSyncMeta` helper in `offline-cache.ts`, re-exported via `use-cache-on-fetch.ts`

**Read-back path (new):** Per-entity hooks now catch fetch errors and fall back to IDB:

- `use-wallets` → `getCachedEntities("wallets")`
- `use-transactions` → `getCachedTransactions(budgetId, month)` (month-scoped by `_cacheKey` prefix)
- `useBudget` → `getCachedBudget(budgetId)`
- `useCategories` → `getCachedEntities("categories")`
- `use-spendings-summary`: no read-back (derived object; categories+txns grid renders from cached rows)

**Home offline render:** `DB_VERSION` bumped 2→3, new `active-budgets` store. `HomeOfflineCache` client island: writes list on online visit, reads IDB when server list is empty. `page.tsx` swapped `HomeCardsGrid` → `HomeOfflineCache` (online path unchanged).

## Test Results

66/66 tests green across:

- `test/components/offline-status-badge.test.tsx` (10)
- `test/offline-cache.test.ts` (24)
- `test/offline-write-path.test.tsx` (12)
- `test/offline-readback.test.tsx` (5)
- `test/home-offline-cache.test.tsx` (5)
- `test/sw-offline.test.ts` (10, unchanged — no regression)

## Deviations from Plan

**1. [Rule 1 - Bug] eslint-disable comments on unknown rule**

- Found during: Tasks 3 + 4
- Issue: `// eslint-disable-line react-hooks/exhaustive-deps` caused `eslint --max-warnings=0` failure because `react-hooks/exhaustive-deps` is not registered in this project's ESLint config
- Fix: Removed the disable comments (the rule isn't enforced here anyway); same comments existed in `use-budget-data.ts` and also removed there
- Files: bdp-tabs.tsx, spendings-grid-client.tsx, wallets-sectioned-list.tsx, use-budget-data.ts
- Commits: ea844e2, 3b4976c

**2. [Plan discretion] WalletsSectionedList query destructuring**

- Changed `const { data: wallets = initial } = useWallets(...)` to `const walletsQuery = useWallets(...); const wallets = walletsQuery.data ?? initial` to access `isSuccess` for the write effect — semantically identical

**3. [Plan discretion] use-spendings-summary: no read-back added**

- Summary is a derived object not stored in IDB. Plan noted "Claude's discretion — pick the smaller reliable path". Cached categories + transactions render the grid offline. No summary fallback needed.

**4. [Plan discretion] HomeOfflineCache renders HomeCardsGrid directly**

- BudgetCard is an async server component but HomeCardsGrid renders it inside Suspense boundaries. When rendered by a client island from cached data, React renders synchronously from props (no async fetch). No boundary issue found; kept simpler path.

## Known Stubs

None. All data paths wired.

## Threat Flags

None. IDB cache is per-browser per-tenant, wiped on logout via `wipeBudgetCache`. The new `active-budgets` store follows the same pattern. No new network endpoints or auth paths introduced.

## Self-Check

- home-offline-cache.tsx: FOUND
- offline-readback.test.tsx: FOUND
- offline-cache.ts exports getCachedEntities/getCachedTransactions/cacheActiveBudgets/getCachedActiveBudgets/bumpGlobalSyncMeta: FOUND
- Commits 205867c, 7a2a9c8, 9a61f43, ea844e2, 3703a61, 3b4976c, 578c7cc: all on tasks-redesign branch
- 66 tests passing: VERIFIED (at executor handoff; later 64 after Task-5 test rewrite — see addendum)

## Orchestrator Addendum (post-executor gate verification)

The executor's run was green on Vitest but **two gates it did not run were red**; both fixed by the orchestrator on the same branch:

1. **`fix ef1eee6` — typecheck.** `cacheActiveBudgets(budgets: BudgetSummary[])` failed `tsc`: a typed interface is not assignable to a param with an index signature (`{ [key:string]: unknown }`). Narrowed the param to `ReadonlyArray<{ id: string }>`.

2. **`fix 5bc0a9c` — production `next build` (the important one).** SUMMARY decision #4 ("BudgetCard is server-only; HomeOfflineCache passes cached list into HomeCardsGrid (no BudgetCard boundary issue)") was **WRONG**. `home-offline-cache.tsx` is `"use client"` and importing `HomeCardsGrid → BudgetCard → budget-fetch.server` (`import "server-only"` + `next/headers`) pulled server-only code into the client bundle, so `next build` failed with `Failed to compile ... You're importing a component that needs "server-only"`. **Vitest passed because it mocks `HomeCardsGrid`; only the production build enforces the RSC boundary.**
   - **Fix (canonical RSC pattern):** the SERVER `HomeCardsGrid` is now passed as `children` to the client island (server components are legal as children of client components). `HomeOfflineCache` is a pure write-on-mount side-effect (`cacheActiveBudgets` + `__global__` bump) that renders `{children}`. The unreachable offline-empty read branch was dropped (`page.tsx` short-circuits to `HomeEmptyHero` when the list is empty, and the SW `nav-docs-v1` cache already serves the last-online HTML of `/` offline). `home-offline-cache.test.tsx` rewritten to the corrected contract (5 → 3 tests).

**Gate results after both fixes:**

- `bun run typecheck`: PASS (0 errors).
- `bun run lint` on the 11 changed source files: 0 problems. (Repo-wide `lint` is red ONLY on pre-existing `pill-task-slider.tsx:86`, a stale `react-hooks/exhaustive-deps` disable present at base — unrelated to this task.)
- `check:i18n`: `I18N_GATE_PASS`.
- `make ci-gate`: tenant-leak **51 pass / 0 fail** (security gate intact). Non-zero exit is a pre-existing coverage-threshold artifact on `tests/tenant-leak/fixtures/*`, unrelated to this frontend-only diff.
- Offline Vitest suite (6 files): **64 pass / 0 fail**.
- `docker compose build web` → **exit 0**; `make restart-web` → web healthy on the new image.
- **Served-bundle verification** (grep of running container `/app/apps/web/.next`): `("unplug",[["path"...` present (Unplug shipped), `lucide-cloud-off` = 0 (CloudOff gone), `active-budgets` ×12, `__global__` ×12, `budget-cache` ×4 — confirms fresh code, not a stale cache-hit image.

**Status:** code-complete + build-verified on `tasks-redesign`. **Device checkpoint pending** — offline behavior on a real iOS PWA is the only true verifier (Vitest can't enforce SW/server-only boundaries; the build break above proves the gap). Device protocol: first confirm the Settings build stamp shows the new build (Clear caches + unregister SW if not), then test the 4 fixes offline.

## Round 2 — device feedback (2026-06-15, screenshot)

User reported on-device: (1) wanted a different icon (crossed antenna); (2)+(3) offline reload STILL showed the bare "This page wasn't preloaded" offline-shell, not the cached budget list. Root cause: Round-1 populated IDB + added read-back hooks, but on a nav-cache MISS the SW serves the STATIC `offline-shell.html` — so the real route's React never boots and the read-back never runs. The offline-render path was never actually closed for the cold-reload-miss case.

Fixes (commits `d43ae5e`, `702a087`, `bdadd6f`):

- **Icon → crossed antenna** (`offline-status-badge.tsx`): `Unplug` → lucide `RadioTower` + a diagonal slash overlay (`bg-current`, scales, pulses with the icon). Matching crossed-antenna SVG in the offline-shell pill.
- **`offline-shell.html` renders the cached budget list** (the real fix for #2/#3): the static shell now reads the `active-budgets` IndexedDB store and renders the cached budgets as navigable cards (`/{locale}/budgets/{id}/wallets`), with EN/PL/UK copy and `esc()` HTML-escaping of user-controlled names (XSS guard). Falls back to the "wasn't preloaded" note only when the cache is empty. RSC-independent → works on ANY cache-miss route.

**Playwright offline testing (user-requested) — KEY FINDING:** `context.setOffline(true)` does NOT make the SW's own `fetch()` reject (verified: reload still served the real page). But `context.route('**/*', r => r.abort('internetdisconnected'))` DOES intercept the SW fetch → reproduces real-device offline exactly. Proven live end-to-end: reset SW (unregister + clear caches, reload twice for `controller`), IDB = 12 active-budgets, route-abort, navigate to an UNVISITED route → SW served the new offline-shell → `renderedBudgetList: true`, `cardCount: 12`, `firstName "Scroll Test 4"`, `stillShowsBareNote: false`. Screenshot captured. See [[project-offline-test-architecture]].

Tests: `test/offline-shell.test.ts` (NEW — executes the real inline shell script vs happy-dom + fake-indexeddb: renders list, keeps note when empty, escapes XSS); badge test updated for the crossed antenna; `sw-offline.test.ts` self-recovery assertion made quote-agnostic. **67/67 offline Vitest green.** Served bundle: `radio-tower` ×2, `unplug` = 0.

**Still device checkpoint pending** — confirm Settings build stamp is current (Clear caches + unregister SW), then offline-reload should show the budget list with the crossed-antenna pill.

## Round 3 — device feedback (commit `c6aecb0`)

User: (1) the bespoke offline list "isn't a good way to render — it shouldn't differ from the online page at all (header + content), just with cached data"; (2) replace the offline ICON with a narrow full-width RED BAR below the header saying the cache may be stale + reloaded X ago (adaptive cadence); (3) for an uncached route, render that route but show a "not visited / not cached" message in content.

Decisive finding (Playwright): a route VISITED online already renders its **real cached page** offline — the SW serves the cached document (real header + real BudgetCard grid with stats), identical to online. Only the data layer was ever the gap. So the right design is: lean on the real cached page + a staleness bar, and drop the bespoke list.

Shipped:

- **`OfflineStaleBar`** (`offline-stale-bar.tsx`) — narrow full-width red bar mounted below the header in the (app) layout; offline only; "You're offline — showing cached data, last synced {X}". Adaptive `staleTickDelay`: 1s <1min, 60s <1hr, 3600s beyond. Removed the in-header icon (`OfflineStatusBadge` + its 2 tests deleted). i18n `offline.staleBar.*` en/pl/uk.
- **`offline-shell.html`** rewritten (nav-cache MISS fallback only): real header + red bar + "This page isn't available offline" note + a "Go to home" link revealed when the cached home doc exists.
- Tests: `offline-stale-bar.test.tsx` (incl. staleTickDelay buckets + cache-age fallback), `offline-shell.test.ts` rewrite (not-cached note + conditional home link), wiring test updated. typecheck + check:i18n + lint clean; full offline Vitest green.

**Playwright live proof (setOffline + route-abort = full device emulation):** cached `/en` offline → real home + `hasSwitcher:true` + bar "synced 2 seconds ago"; uncached route offline → offline-shell note + "Go to home" → `/en` (cache hit). Screenshots captured. See [[project-offline-test-architecture]] for the both-knobs emulation recipe.

## Round 4 — device feedback (commit after `c6aecb0`)

User: (1) full app reload offline still showed the bare not-cached shell; (2) the red bar must be one line in all languages.

Root cause of (1): **PWA start_url is `/`** (public/manifest.json) — a 307→/<locale> redirect the SW can't cache (a redirected response can't satisfy a navigation). So a cold open always requests `/`, always misses → offline-shell, even when `/en` was cached; and the shell skipped its home link at `/`.

Shipped:

- **offline-shell cold-open recovery**: at a ROOT entry (no locale segment) it resolves the locale from the `budget-locale` cookie and `location.replace('/<locale>')` to the cached real home; localized uncached routes keep the note + "Go to home".
- **Nav-cache warming**: SW `message` handler (`WARM_ROUTES`) + `NavCacheWarmer` client (in the layout) proactively fetch+cache the home + current route (non-redirected 2xx) while online, so visited/soft-nav routes + home are reliably cached. Never caches `/` (redirect).
- **One-line bar**: shortened copy (en "Offline — cached data from {relativeTime}", pl/uk equivalents) + `whitespace-nowrap`/ellipsis on the OfflineStaleBar and the shell bar.

Playwright proof (setOffline + route-abort, fresh SW): cold-open `/` offline → redirects to `/en` → real home (`isRealHome:true`, `isOfflineShell:false`) + bar "Offline — cached data from 4 seconds ago", height 22px, `barOneLine:true`, `barTruncated:false`. Full offline Vitest **77/77 green**. Screenshot captured.
