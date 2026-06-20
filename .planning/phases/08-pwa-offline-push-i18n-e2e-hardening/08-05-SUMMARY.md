---
phase: 08-pwa-offline-push-i18n-e2e-hardening
plan: "05"
subsystem: push-notifications, pwa-install, offline-sync
tags: [push, pwa, install-banner, deep-link, offline, settings, onboarding]
dependency_graph:
  requires: [08-01, 08-02, 08-03]
  provides: [push-delivery, install-banner, deep-link-consumer, pending-marker]
  affects:
    [
      worker,
      web/settings,
      web/onboarding,
      web/layout,
      web/profile-menu,
      web/transaction-row,
    ]
tech_stack:
  added: [web-push, pwa-install-store singleton, lucide Clock/Download]
  patterns:
    [
      optimistic+rollback+toast,
      beforeinstallprompt capture,
      offline IDB queue lookup,
    ]
key_files:
  created:
    - apps/worker/src/handlers/push-notification-handler.ts
    - apps/web/sw.ts (notificationclick handler added)
    - apps/web/src/components/settings/push-prefs-section.tsx
    - apps/web/src/components/onboarding/steps/step-push.tsx
    - apps/web/src/components/common/install-banner.tsx
    - apps/web/src/lib/pwa-install-store.ts
    - apps/web/test/push-prefs-section.test.tsx
    - apps/web/test/install-banner.test.tsx
    - apps/web/test/task-deep-link.test.tsx
  modified:
    - apps/worker/src/worker.ts
    - apps/web/src/app/budgets/[id]/[tab]/page.tsx
    - apps/web/src/components/tasks/task-banner.tsx (via PillTaskSlider focusTaskId)
    - apps/web/src/components/settings/settings-accordion.tsx
    - apps/web/src/components/onboarding/wizard-page.tsx
    - apps/web/src/components/onboarding/wizard-layout.tsx
    - apps/web/src/components/onboarding/wizard-stepper.tsx
    - apps/web/src/components/auth/profile-menu.tsx
    - apps/web/src/components/budgeting/spendings-grid/transaction-row.tsx
    - apps/web/src/app/[locale]/(app)/layout.tsx
    - apps/web/messages/en.json (stepper.push key)
    - apps/web/messages/pl.json
    - apps/web/messages/uk.json
decisions:
  - "Plan file says apps/web/src/components/grid/spendings-row.tsx; actual file is transaction-row.tsx — pending marker added there instead"
  - "Onboarding push step inserted as step 4, Review shifts to step 5; WizardLayout/Stepper/Page all updated for 5-step flow"
  - "pwa-install-store.ts uses singleton module-level state (not React context) so banner and profile menu share the captured deferred prompt without a Provider"
  - "applicationServerKey passed as .buffer (ArrayBuffer) to PushManager.subscribe to satisfy strict TS lib types"
  - "Install entry always shown in profile menu when not standalone (not only when prompt captured) — browser decides availability; notAvailable toast surfaces when no prompt"
metrics:
  duration: "18 minutes (Tasks 3+4)"
  completed_date: "2026-06-10"
  task_count: 4
  file_count: 20
---

# Phase 08 Plan 05: Push Delivery End-to-End + Install UX Summary

> **⚠️ PARTIAL SUPERSEDE (2026-06-16/17).** Push delivery, NOTIFICATION_TYPES
> registry, SW deep-link, Settings/onboarding push controls, and the PWA install
> banner are **still current**. But the **per-row offline pending marker** (Task 4,
> added to `transaction-row.tsx`) was **removed** — offline WRITE is now an honest
> POST + rollback-toast (no queue, so no pending state to mark). The `provides:
pending-marker` and the marker mentions in Task 4 are stale. See **08-CONTEXT.md**
> banner + memory `project_offline_architecture`.

**One-liner:** Push worker handler with extensible NOTIFICATION_TYPES registry + SW deep-link + Settings/onboarding push controls + PWA install banner with deferred-prompt sharing + per-row offline pending marker.

## Tasks Completed

| Task | Name                                                                      | Commit           | Status |
| ---- | ------------------------------------------------------------------------- | ---------------- | ------ |
| 1    | Push worker handler + SW notificationclick                                | 9d8a233, eca5cb8 | Done   |
| 2    | Deep-link consumer — BDP tab page + TaskBanner focusTaskId                | 97a0b24          | Done   |
| 3    | PushPrefsSection (Settings) + onboarding push step                        | eb1e34a          | Done   |
| 4    | InstallBanner + profile-menu Install entry + spendings-row pending marker | aa200a8          | Done   |

## What Was Built

### Task 1: Push Worker + SW

- `registerPushNotificationHandler(deps)` subscribes to `eventBus.on("task.created")`.
- `NOTIFICATION_TYPES` registry maps RESERVE_TOPUP/CONFIRM_DRAFT/CUSHION_BELOW_TARGET → `{title, body, tab}` in EN/PL/UK.
- Generic payloads (D-15: no financial amounts in notification body).
- 410/404 from push endpoint → `pushRepo.delete(endpoint, userId)` (stale sub cleanup).
- Unknown kind → silent return (no throw).
- SW `notificationclick`: `matchAll` existing windows → focus matching URL or `openWindow(url)`.

### Task 2: Deep-Link Consumer

- BDP tab page reads `searchParams.task` and passes as `focusTaskId` to the task banner component.
- Banner with `focusTaskId` in pending list → auto-expands that row on mount.
- `focusTaskId` not in pending list → renders normally, no toast, no redirect (D-14 silent-land).
- `data-testid="task-banner-{id}"` + `data-expanded` attributes for test observability.

### Task 3: PushPrefsSection + Onboarding Push Step

- `push-prefs-section.tsx` ("use client"): master Switch with `requestPermission → PushManager.subscribe → POST /push/subscribe`; denied → snap OFF + permissionDenied toast.
- Per-kind Switch rows (RESERVE_TOPUP, CONFIRM_DRAFT, CUSHION_BELOW_TARGET): visible only when master ON; each calls `api.push.preferences.$patch` with optimistic update + rollback + saved toast.
- `testids`: `push-master-switch`, `push-kind-{KIND}`.
- Mounted as new "Notifications" AccordionItem in `settings-accordion.tsx`.
- `step-push.tsx`: skippable onboarding push step with `onboarding-push-switch` testid + "Skip for now" button; wizard extended from 4 → 5 steps.

### Task 4: InstallBanner + Profile Entry + Pending Marker

- `pwa-install-store.ts`: singleton module-level store for `BeforeInstallPromptEvent`; `setDeferredPrompt / getDeferredPrompt / subscribeToDeferredPrompt`.
- `install-banner.tsx`: captures `beforeinstallprompt`, renders yellow-tint ribbon with Install/dismiss/Learn-more Dialog (3 benefits); hides when standalone or dismissed; `localStorage pwa-install-dismissed=1` on dismiss.
- Mounted above `<header>` in `(app)/layout.tsx`.
- Profile menu "Install app" entry: always visible when not standalone; calls `getDeferredPrompt().prompt()` or toasts `pwa.install.notAvailable`.
- `transaction-row.tsx`: `idempotencyKey` prop + async IDB lookup via `getOfflineQueue()`; shows Clock + "Pending" span when key found; `data-testid="txn-pending-{id}"` + `aria-label="Pending sync"`.

## Test Results

| Suite                             | Tests             | Result            |
| --------------------------------- | ----------------- | ----------------- |
| push-notification-handler.test.ts | bun:test (worker) | Green (Tasks 1-2) |
| task-deep-link.test.tsx           | 2/2               | Green             |
| push-prefs-section.test.tsx       | 5/5               | Green             |
| install-banner.test.tsx           | 5/5               | Green             |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Path mismatch for spendings-row**

- **Found during:** Task 4
- **Issue:** Plan referenced `apps/web/src/components/grid/spendings-row.tsx`; actual file is `apps/web/src/components/budgeting/spendings-grid/transaction-row.tsx`
- **Fix:** Added `idempotencyKey` prop + pending marker to the actual transaction-row.tsx
- **Files modified:** `transaction-row.tsx`

**2. [Rule 2 - Missing functionality] WizardLayout/Stepper type signatures**

- **Found during:** Task 3
- **Issue:** WizardLayout had `currentStep: 0|1|2|3|4` and `onStepJump: (step: 1|2|3|4)`; adding step 5 caused TS2322
- **Fix:** Extended all signatures to include `5`; updated last-step detection (`isLastStep = currentStep === 5`); added `push` stepper label to EN/PL/UK i18n

**3. [Rule 1 - Bug] applicationServerKey Uint8Array type mismatch**

- **Found during:** Task 3 typecheck
- **Issue:** `PushManager.subscribe({ applicationServerKey: Uint8Array })` fails strict TS; requires `BufferSource` (ArrayBuffer)
- **Fix:** Pass `.buffer as ArrayBuffer`

## Known Stubs

None — all wired to real APIs.

## Threat Flags

None beyond those already in the plan's threat register (T-08-05-01 through T-08-05-05).

## Self-Check: PASSED

- `push-prefs-section.tsx` exists: FOUND
- `install-banner.tsx` exists: FOUND
- `pwa-install-store.ts` exists: FOUND
- `step-push.tsx` exists: FOUND
- Commits 9d8a233, eca5cb8, 97a0b24, eb1e34a, aa200a8: FOUND
- `grep -q "push-master-switch" apps/web/src/components/settings/push-prefs-section.tsx`: PASS
- `grep -q "beforeinstallprompt" apps/web/src/components/common/install-banner.tsx`: PASS
- `grep -q "txn-pending-" apps/web/src/components/budgeting/spendings-grid/transaction-row.tsx`: PASS
- `grep -q "onboarding-push-switch" apps/web/src/components/onboarding/steps/step-push.tsx`: PASS
