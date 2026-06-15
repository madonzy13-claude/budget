---
quick_id: 260615-bse
subsystem: web / offline-ux
tags: [offline, pwa, i18n, tdd, vitest, indicator, dialog]
requires:
  - "@/lib/offline-cache getSyncMeta (cache-age source)"
  - "@/components/ui/tooltip (Radix controlled)"
  - "@/components/ui/alert-dialog (shared host pattern)"
  - "use-create-transaction OfflineWriteError + Promise.race timeout"
provides:
  - "Globe + pulse + cache-age tooltip offline indicator (hover desktop / tap mobile)"
  - "Popup-before-insert offline add (no add-then-remove flicker)"
  - "useCreateTransaction onOfflineError callback (lying-true case → same dialog)"
affects:
  - apps/web/src/components/common/offline-status-badge.tsx
  - apps/web/src/components/budgeting/top-nav.tsx
  - apps/web/src/components/budgeting/spendings-grid/quick-entry-input.tsx
  - apps/web/src/components/budgeting/spendings-grid/category-column.tsx
  - apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx
  - apps/web/src/hooks/use-create-transaction.ts
tech-stack:
  patterns:
    - "Radix Tooltip controlled open state for tap-to-open (Radix has no native tap)"
    - "Single shared AlertDialog hosted in grid-client, threaded via onOfflineAttempt"
    - "Both offline paths (pre-insert short-circuit + lying-true rollback) converge on one dialog"
key-files:
  created:
    - apps/web/test/components/offline-status-badge.test.tsx
    - apps/web/test/i18n/offline-ux-keys.test.ts
  modified:
    - apps/web/src/components/common/offline-status-badge.tsx
    - apps/web/src/components/budgeting/top-nav.tsx
    - apps/web/src/components/budgeting/spendings-grid/quick-entry-input.tsx
    - apps/web/src/components/budgeting/spendings-grid/category-column.tsx
    - apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx
    - apps/web/src/hooks/use-create-transaction.ts
    - apps/web/messages/en.json
    - apps/web/messages/pl.json
    - apps/web/messages/uk.json
    - apps/web/test/offline-status-badge.test.tsx
    - apps/web/test/components/spendings-grid/quick-entry-input.test.tsx
    - apps/web/test/components/spendings-grid/spendings-grid-client.test.tsx
    - apps/web/test/components/spendings-grid/category-column.test.tsx
decisions:
  - "Dropped the 'Offline' text label — icon-only pulsing globe (plan allowed)"
  - "Replaced the obsolete dot+label root-level badge test with redesign layout-invariant test"
  - "onOfflineAttempt is a REQUIRED prop on QuickEntryInput/CategoryColumn (one dialog always wired)"
metrics:
  duration: ~13m
  completed: 2026-06-15
---

# Quick 260615-bse: Globe Indicator + Popup-Before-Insert Summary

Offline UX polish 2: replaced the wifi-off offline pill with a pulsing lucide Globe carrying a cache-age tooltip (hover desktop / tap mobile), and made offline quick-entry adds pop a dialog BEFORE any insert so there is no add-then-remove flicker — with the rare iOS lying-true case rolling back and surfacing the same dialog instead of a toast.

## Task 1 — Globe + pulse + cache-age tooltip indicator (commit e9765a0)

- `offline-status-badge.tsx` rewritten to accept `{ budgetId: string | null }`. Online → unchanged sr-only span (zero footprint, no layout shift). Offline → h-6 inline-flex envelope wrapping a lucide `Globe` with `animate-pulse` in `--destructive`.
- Cache age reuses the staleness-marker pattern: `useFormatter().relativeTime` over `getSyncMeta(budgetId).lastSyncedAt`, ticked every 30s while offline. Null budgetId / missing sync-meta → `indicator.tooltipUnknown`.
- CONTROLLED Radix Tooltip (`open`/`onOpenChange`): desktop opens via Radix hover/focus; mobile via an explicit `onClick` toggle on the trigger button (Radix has no native tap-to-open — documented in the file header).
- `top-nav.tsx` passes `budgetId={activeBudgetId}`.
- i18n: added `offline.indicator.{tooltip,tooltipUnknown,ariaLabel}` + `grid.offlineDialog.{title,body,ok}` to en/pl/uk (native PL/UK, ICU `{relativeTime}` preserved).

## Task 2 — Popup-before-insert + lying-case dialog (commit f711448)

- `quick-entry-input.tsx`: new required `onOfflineAttempt` prop. In `submit()`, after `setValue("")` and BEFORE `mutate()`: `if (navigator.onLine === false) { onOfflineAttempt(); return; }` — no mutate → no `onMutate` → no optimistic row → no flicker. Online path unchanged.
- `use-create-transaction.ts`: extended to `useCreateTransaction(budgetId, month, opts?: { onOfflineError })`. On `OfflineWriteError` (timeout / dead link, onLine lied true), the optimistic row rolls back as before and `opts.onOfflineError()` fires; the offline toast is kept ONLY when no callback is wired (back-compat for offline-write-path tests). Genuine 4xx keeps `write.failed` toast.
- QuickEntryInput passes `onOfflineAttempt` as the hook's `onOfflineError`, so both offline paths open the SAME dialog.
- `category-column.tsx` forwards `onOfflineAttempt` to QuickEntryInput; `spendings-grid-client.tsx` hosts ONE shared `AlertDialog` (`data-testid="offline-add-dialog"`, title/body/OK from `grid.offlineDialog.*`) and passes `onOfflineAttempt={() => setOfflineDialogOpen(true)}` to every column.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Obsolete root-level badge test conflicted with the redesign**

- **Found during:** Task 1 (GREEN).
- **Issue:** A pre-existing `apps/web/test/offline-status-badge.test.tsx` (not in the plan's file list) tested the OLD design: dot+label pill, mandatory "Offline" text, no-props mount, and a next-intl mock with no `useFormatter`. The redesign (icon-only globe, required `budgetId`, `useFormatter`) broke its render.
- **Fix:** Rewrote that test to pin the still-valid layout invariants (sr-only online, inline h-6, no banner, no layout shift) against the new globe element; behavior coverage lives in the plan's new `test/components/offline-status-badge.test.tsx`.
- **Files modified:** apps/web/test/offline-status-badge.test.tsx
- **Commit:** e9765a0

**2. [Rule 3 - Blocking] CategoryColumn test missing the new required prop**

- **Found during:** Task 2 (GREEN).
- **Issue:** `onOfflineAttempt` is required on CategoryColumnProps/QuickEntryInputProps; the existing `category-column.test.tsx` renders CategoryColumn directly and would fail tsc.
- **Fix:** Added `onOfflineAttempt={vi.fn()}` to that test's default props.
- **Files modified:** apps/web/test/components/spendings-grid/category-column.test.tsx
- **Commit:** f711448

## Verification

- `cd apps/web && bun run typecheck` — green.
- `bun run test -- offline-status-badge quick-entry-input use-create-transaction spendings-grid-client offline-ux-keys offline-write-path` — 71 passed (7 files). New RED tests (offline pre-insert, tap-to-open, cache-age tooltip, 6 i18n keys x3 locales) green; existing online/offline-write-path tests unchanged.
- `bunx eslint` on all changed source files — clean.
- `bun run check:i18n` (root) — `I18N_GATE_PASS`.
- Docker: rebuilt `budget-web` (fresh image `489cef5d6afe`, not a cache no-op), `make restart-web`, web `Up (healthy)` on the new image.
- Served bundle (per docker_build_cache_stale memory):
  - `offline-globe` testid + `className:"h-4 w-4 shrink-0 animate-pulse"` → (app) layout chunk.
  - lucide Globe SVG path (`M2 12h20` + globe arc) → static chunk 4915.
  - "showing data from" tooltip copy + "add while offline" dialog title → server chunk 368.
  - `offline-add-dialog` → spendings page chunk.

## Known Stubs

None.

## Checkpoint (pending — user's device)

Automated gates all green and the served bundle is verified. Remaining: DEVICE confirm on https://budget-dev.madonzy.com per the plan's checkpoint (pulsing globe offline / nothing online; tooltip on hover AND tap; offline add = dialog with zero inserted row; online add unchanged). Awaiting "approved" or a description of anything off.

## Self-Check: PASSED

All created files exist on disk; both task commits (e9765a0, f711448) present in git history.
