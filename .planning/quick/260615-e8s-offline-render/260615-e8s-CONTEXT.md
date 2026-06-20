# Quick Task 260615-e8s: Offline UX polish — 4 fixes - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Task Boundary

Four device-confirmed offline-UX fixes for the Budget PWA (apps/web), shipped in one pass on branch `tasks-redesign`. Robust-minimal offline architecture: offline = read-only-reliable. **Do NOT reintroduce** offline write-queue / replay / sync-issues (deliberately removed).

See `260615-e8s-INVESTIGATION.md` for the root-cause map — READ IT FIRST.
</domain>

<decisions>
## Implementation Decisions (LOCKED — do not revisit)

### Issue 1 — Tooltip won't close on tap

- Swap the offline indicator's Radix **Tooltip → Popover** (`apps/web/src/components/ui/popover.tsx` already exists) so a touch/tap fully owns open/close. Eliminates the controlled-`open` + `onClick` toggle racing with Radix Tooltip hover/focus/pointer reopen.
- Component: `apps/web/src/components/common/offline-status-badge.tsx`.

### Issue 4 — Replace icon

- Replace `CloudOff` with lucide **`Unplug`** (user-chosen). Keep invariants: pulse, zero-header-height (no layout shift), sr-only/hidden when online.

### Issue 2 + 3 — Offline does NOT render cached pages instantly + cache-age "unknown"

- Treated as ONE root cause: the offline data layer is **dead code**. `cacheBudgetSnapshot()` (only IDB + sync-meta writer) is called only from `useBudgetData`, which is never mounted; and there is no read-back path (`getCachedBudget` has zero consumers).
- **Scope: EVERYTHING including home `/`.** Offline reload of any visited route (home + budget detail tabs) must paint instantly from the last-online cached HTML (nav-doc cache) AND hydrate data from IDB; cache-age must show a real relative time.
- Wire (per investigation fix surface):
  1. Mount the existing snapshot writer into the real client islands (budget detail: `spendings-grid-client.tsx` / `bdp-tabs.tsx`) + a home client island so IDB stores + sync-meta (incl. `__global__`) get populated.
  2. Add a read-back path: feed `getCachedBudget` / new reader fns into per-entity hooks' `initialData`/`placeholderData`/`queryFn` fallback (`use-wallets.ts`, `use-transactions.ts`, `use-budget-data.ts`, `use-spendings-summary.ts`) + reader fns in `offline-cache.ts`.
  3. Home `/` is RSC `force-dynamic` with no client island — cache the active-budgets list in IDB (tiny new store) + a small client island (or equivalent) so it renders offline.
  4. Ensure the SW nav-doc cache reliably captures every visited route's document so offline reload serves real last-online HTML, not `offline-shell.html`.

### Claude's Discretion

- Exact island boundaries / store shape, whether to use RQ persister vs initialData, and the precise nav-doc reliability fix — planner picks the minimal reliable approach consistent with the investigation.
  </decisions>

<constraints>
## Preserve / Gates
- Online write happy path unchanged.
- PWA precache + SW `skipWaiting`/`clientsClaim` + the auto-reload island (`sw-update-reloader.tsx`) intact.
- i18n EN/PL/UK — `check:i18n` clean (existing `offline.indicator.*` keys already present in en/pl/uk).
- `tsc` + eslint + dependency-cruiser clean. `make ci-gate` green.
- Verify offline behavior with **Vitest** (offline is Vitest-verified, not E2E — Playwright setOffline+SW unreliable).
- Drizzle types stay in adapters; no domain leakage (N/A here, frontend only).
</constraints>

<specifics>
## Specific References
- Investigation: `.planning/quick/260615-e8s-offline-render/260615-e8s-INVESTIGATION.md` (authoritative current-state map; file:line evidence).
- Memory: offline = read-only-reliable; iOS `navigator.onLine` lies when `true`, reliable when `false`; iOS PWA serves STALE SW cache until Clear-caches+unregister (verify via Settings build stamp on device).
</specifics>
