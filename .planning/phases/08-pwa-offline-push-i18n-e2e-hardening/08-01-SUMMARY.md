---
phase: 08-pwa-offline-push-i18n-e2e-hardening
plan: "01"
subsystem: platform/push + web/i18n + web/e2e
tags: [wave-0, foundation, push-schema, i18n, page-objects, scaffolding]
dependency_graph:
  requires: []
  provides:
    - idb package (apps/web)
    - web-push package (packages/platform)
    - push_subscriptions + notification_prefs tables (shared_kernel schema)
    - VAPID helper (packages/platform/src/push/vapid.ts)
    - i18n completeness gate (scripts/check-i18n-completeness.ts)
    - Phase 8 message keys in EN/PL/UK (pwa.*, settings.push.*, onboarding.push.*, offline.*, sync.*, serverDown.*)
    - SpendingsPo, OnboardingPo, ShareLinkPo page objects
    - Nyquist test scaffolds for 08-02, 08-03, 08-05
  affects:
    - apps/web (messages bundled — rebuild needed)
    - tests/tenant-leak (ci-gate now covers 10 cross-tenant files)
    - all downstream Phase 8 plans depend on these artifacts
tech_stack:
  added:
    - idb@8.0.3 (apps/web)
    - web-push@3.6.7 (packages/platform)
    - "@types/web-push" dev (packages/platform)
  patterns:
    - sharedKernel.table + pgPolicy RLS (push schema)
    - flatKeys() completeness gate script pattern (RESEARCH Pattern 5)
    - Page Object pattern (constructor(Page), getByTestId locators)
    - Nyquist sentinel scaffold (expect("SCAFFOLD").toBe("IMPLEMENTED"))
key_files:
  created:
    - packages/platform/src/push/schema.ts
    - packages/platform/src/push/vapid.ts
    - packages/platform/src/push/index.ts
    - apps/migrator/drizzle/0032_phase08_push.sql
    - tests/tenant-leak/push-subscriptions-cross-tenant.test.ts
    - tests/tenant-leak/notification-prefs-cross-tenant.test.ts
    - scripts/check-i18n-completeness.ts
    - apps/web/e2e/page-objects/SpendingsPo.ts
    - apps/web/e2e/page-objects/OnboardingPo.ts
    - apps/web/e2e/page-objects/ShareLinkPo.ts
    - apps/web/test/offline-cache.test.ts
    - apps/web/test/offline-queue.test.ts
    - apps/api/test/routes/push.test.ts
    - apps/worker/test/push-notification-handler.test.ts
  modified:
    - packages/platform/src/index.ts (push barrel wired)
    - packages/platform/package.json (web-push added)
    - apps/web/package.json (idb added)
    - apps/migrator/drizzle/meta/_journal.json (0032 registered)
    - apps/migrator/post-migration.sql (GRANT + FORCE RLS)
    - tests/tenant-leak/USER-DATA-TABLES.txt (push_subscriptions + notification_prefs added)
    - apps/web/messages/en.json (Phase 8 keys + no_workspaces → no_budgets_selected)
    - apps/web/messages/pl.json (parity + machine-translated Phase 8 keys)
    - apps/web/messages/uk.json (parity + machine-translated Phase 8 keys)
    - package.json (check:i18n script added)
decisions:
  - "Hand-authored migration 0032 (drizzle-kit BigInt serialization bug precedent from phases 1/5/6)"
  - "VAPID private key reads only from env in vapid.ts — never imported by apps/web (T-08-01-02)"
  - "_machineTranslated metadata marker skipped by flatKeys() — avoids false stale-key failures for D-19 markers"
  - "no_workspaces renamed to no_budgets_selected in all 3 catalogs (I18N-02 cleanup)"
metrics:
  duration_minutes: 17
  tasks_completed: 4
  tasks_total: 4
  files_created: 14
  files_modified: 10
  completed_date: "2026-06-10"
---

# Phase 8 Plan 01: Wave 0 Foundation — Push Schema, i18n Gate, Page Objects Summary

**One-liner:** idb + web-push installed; push tables migrated with RLS; i18n completeness gate passes across 3 locales with all Phase 8 keys; 3 Page Objects + 4 Nyquist scaffolds in place for downstream Phase 8 plans.

---

## What Was Built

### Task 1: Install idb + web-push; define push schema barrel

- `idb@8.0.3` added to `apps/web`; `web-push@3.6.7` + `@types/web-push` added to `packages/platform`
- `packages/platform/src/push/schema.ts`: two `sharedKernel.table` definitions — `pushSubscriptions` and `notificationPrefs` — each with `pgPolicy` tenant-isolation RLS (permissive, ANY `app.tenant_ids` predicate, copying idempotency pattern verbatim)
- `packages/platform/src/push/vapid.ts`: thin wrapper calling `webPush.setVapidDetails(...)` from env; re-exports `webPush.sendNotification`. VAPID private key reads only from server env (T-08-01-02)
- `packages/platform/src/push/index.ts`: barrel re-exports schema + vapid; wired into platform main index

### Task 2: Migration 0032 + tenant-leak gate extended to 10 files

- Hand-authored `apps/migrator/drizzle/0032_phase08_push.sql`: CREATE TABLE, ENABLE + FORCE ROW LEVEL SECURITY, tenant-isolation policies, UNIQUE indexes, GRANT to app + worker roles on both tables
- Migration registered in `_journal.json` as entry `0032_phase08_push`
- `make migrate` applied; `make ci-gate` green at 10 cross-tenant files (was 8)
- Two new cross-tenant tests: `push-subscriptions-cross-tenant.test.ts` + `notification-prefs-cross-tenant.test.ts`
- Both table names added to `USER-DATA-TABLES.txt`

### Task 3: i18n completeness gate + all Phase 8 keys in EN/PL/UK

- `scripts/check-i18n-completeness.ts`: recursive `flatKeys()` flattener, EN↔PL↔UK parity check (both directions), stale namespace gate (`workspaces.*`/`accounts.*`). Skips `_machineTranslated` D-19 markers. `process.exit(1)` on any gap.
- `"check:i18n": "bun scripts/check-i18n-completeness.ts"` added to root `package.json`
- All Phase 8 keys added to `en.json`: `pwa.install.*` (12 keys), `settings.push.*` (12 keys including per-kind RESERVE_TOPUP/CONFIRM_DRAFT/CUSHION_BELOW_TARGET), `onboarding.push.*` (4 keys), `offline.*` (6 keys), `sync.*` (10 keys including ICU plural badge + 4 reason codes), `serverDown.*` (6 keys)
- Same keys in `pl.json` + `uk.json` with machine translations; `_machineTranslated: true` sibling per namespace block per D-19
- `no_workspaces` → `no_budgets_selected` in all 3 catalogs (I18N-02)
- Gate: `bun scripts/check-i18n-completeness.ts` → `I18N_GATE_PASS`

### Task 4: 3 Page Objects + 4 Nyquist test scaffolds

**Page Objects:**

- `SpendingsPo`: `quickEntryInput()`, `quickEntrySubmit()`, `transactionRow(id)`, `pendingSyncMarker(id)`, `syncIssuesList()`, `offlineStatusBadge()`
- `OnboardingPo`: `stepTitle()`, `pushStepSwitch()` (testid `onboarding-push-switch`), `skipButton()`
- `ShareLinkPo`: `joinCard()`, `joinConfirmButton()`, `errorState()` — recipient join page side

**Nyquist scaffolds (each fails with `expect("SCAFFOLD").toBe("IMPLEMENTED")`):**

- `apps/web/test/offline-cache.test.ts` — PWAX-02, implemented in 08-03
- `apps/web/test/offline-queue.test.ts` — PWAX-03, implemented in 08-03
- `apps/api/test/routes/push.test.ts` — PWAX-04, implemented in 08-02
- `apps/worker/test/push-notification-handler.test.ts` — PWAX-05, implemented in 08-05

---

## Commits

| Hash      | Message                                                                |
| --------- | ---------------------------------------------------------------------- |
| `a2a7763` | feat(08-01): install idb+web-push; define push schema, vapid, barrel   |
| `aea8dc2` | feat(08-01): migration 0032 push tables + tenant-leak gate to 10 files |
| `a311089` | feat(08-01): i18n completeness gate + all Phase 8 keys in EN/PL/UK     |
| `c69971c` | feat(08-01): scaffold 3 Page Objects + 4 Nyquist test stubs            |

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Duplicate top-level JSON keys for settings/onboarding in PL/UK**

- **Found during:** Task 3
- **Issue:** Initial approach added new top-level `settings` and `onboarding` objects to pl.json/uk.json, but those namespaces already existed — JSON parsers silently use last key, causing first block to be discarded
- **Fix:** Inserted `push` sub-keys directly into the existing `settings` and `onboarding` objects at the correct nesting depth
- **Files modified:** `apps/web/messages/pl.json`, `apps/web/messages/uk.json`

**2. [Rule 1 - Bug] `_machineTranslated` marker keys failing the completeness gate**

- **Found during:** Task 3 verification
- **Issue:** `flatKeys()` treated `_machineTranslated: true` as a leaf i18n key, causing PL/UK→EN stale-key failures (8 false positives)
- **Fix:** Added `METADATA_KEYS = new Set(["_machineTranslated"])` exclusion in `flatKeys()` — D-19 markers are metadata, not translatable strings
- **Files modified:** `scripts/check-i18n-completeness.ts`

---

## Known Stubs

None. All files created contain either real implementation or intentional scaffold sentinels with owning-plan annotations.

---

## Threat Flags

No new threat surface beyond what is documented in the plan's threat model (T-08-01-01, T-08-01-02, T-08-01-03). The push schema RLS and VAPID env isolation mitigations are in place.

---

## Self-Check: PASSED

- `scripts/check-i18n-completeness.ts` exists and exits 0
- `grep -q "check:i18n" package.json` → match
- `grep -q "CUSHION_BELOW_TARGET" apps/web/messages/en.json pl.json uk.json` → all match
- `grep -rc no_workspaces apps/web/messages/` → 0 in all 3 files
- `grep -q "quick-entry-input" SpendingsPo.ts` → match
- `grep -q "onboarding-push-switch" OnboardingPo.ts` → match
- All 4 scaffold files contain `SCAFFOLD: implemented in plan 08-`
- All 4 task commits confirmed: a2a7763, aea8dc2, a311089, c69971c
