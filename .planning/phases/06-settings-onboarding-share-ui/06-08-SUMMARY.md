---
phase: 06-settings-onboarding-share-ui
plan: "08"
subsystem: i18n (pl/uk) + E2E (playwright-bdd)
tags:
  [
    i18n,
    pl-translations,
    uk-translations,
    e2e,
    playwright-bdd,
    page-objects,
    phase-closeout,
  ]
dependency_graph:
  requires:
    - plan/06-05 (settings + share en.json keys)
    - plan/06-06 (onboarding en.json keys)
    - plan/06-07 (share/join en.json keys)
  provides:
    - PL + UK translations for settings/onboarding/share namespaces
    - playwright-bdd E2E coverage for Settings, Onboarding wizard, Share-link join
  affects:
    - phase verification (E2E features exercise all Phase 6 user flows)
tech_stack:
  added: []
  patterns:
    - "playwright-bdd .feature + Page Object + step defs (fresh-user-per-scenario)"
    - "i18n parity: settings/onboarding/share keys mirrored across en/pl/uk"
key_files:
  created:
    - tests/e2e/pages/BudgetSettingsPage.ts
    - tests/e2e/pages/JoinPage.ts
    - tests/e2e/steps/budget-settings.steps.ts
    - tests/e2e/steps/join.steps.ts
    - tests/e2e/steps/onboarding.steps.ts
  modified:
    - apps/web/messages/pl.json
    - apps/web/messages/uk.json
    - tests/e2e/features/settings/budget-settings.feature
    - tests/e2e/features/onboarding/onboarding-wizard.feature
    - tests/e2e/features/share/join.feature
    - tests/e2e/pages/OnboardingPage.ts
decisions:
  - "Task 1 scoped to settings/onboarding/share namespaces (Phase 6's keys). 58 pre-existing `bdp.*` keys untranslated in pl/uk are Phase 3/5 debt — out of Phase 6 scope, not introduced here."
  - "Task 3 full gate: `make test` cannot exit 0 — the branch carries 292 pre-existing unit failures from a test-runner-scoping bug (bun:test runs Playwright + DOM component files). Baseline at pre-Phase-6 commit 57fa4ca = 292 fail / 14 err; Phase-6 HEAD = 320 fail / 15 err. The +28 delta is Phase 6's own component tests run by the wrong runner — they pass under Vitest. Phase 6 introduced zero real unit regressions."
metrics:
  duration: "~36 min (executor) + orchestrator finalization"
  completed: "2026-05-22"
  tasks_completed: 3
  tasks_pending: 1
  files_created: 5
  files_modified: 6
finalized_by: orchestrator
finalized_note: "Executor committed Task 1 (8097841) and Task 2 (6fd8da5, d0c3435), then was interrupted during Task 3's gate run. Orchestrator completed Task 3 verification, characterized the pre-existing test-infra debt against a baseline, and wrote this SUMMARY. Task 4 (human UAT) is a blocking checkpoint awaiting the user."
---

# Phase 6 Plan 08: i18n + E2E Close-out Summary

**One-liner:** PL + UK translations delivered for every Phase 6 string (settings/onboarding/share), playwright-bdd E2E features + Page Objects + step defs added for all three flows; Phase 6 component tests 27/27 GREEN under Vitest and tenant-leak gate 37/37 GREEN. Task 4 human UAT is a pending blocking checkpoint.

## Tasks Completed

| #   | Task                                                        | Commit            | Notes                                                                    |
| --- | ----------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------ |
| 1   | PL + UK translations — settings/onboarding/share namespaces | 8097841           | +116 lines each to pl.json/uk.json; 0 Phase-6 keys missing parity        |
| 2   | playwright-bdd E2E — settings, onboarding wizard, join      | 6fd8da5, d0c3435  | 3 .feature files + BudgetSettingsPage/JoinPage/OnboardingPage + 3 steps  |
| 3   | Full gate run + characterization                            | (no code change)  | See Verification Results — gates run, pre-existing debt characterized    |
| 4   | Human UAT — Settings, Onboarding, Share-link join           | PENDING           | checkpoint:human-verify, blocking — awaiting user                        |

## Verification Results

- `cd apps/web && bun run test -- settings/ onboarding/ share/` (Vitest) — **27/27 pass** (5 files)
- `cd apps/web && bun run test -- onboarding/` (Vitest) — **12/12 pass**
- `bun test packages/identity/test/onboarding-progress-seed.test.ts` — **2/2 pass**
- `make ci-gate` (tenant-leak) — **37/37 pass** (npm wrapper exits 1 on compose-db teardown — known harness quirk, not a test failure)
- i18n parity — settings/onboarding/share keys mirrored across en/pl/uk; 0 Phase-6 keys missing
- `make test` — 320 fail / 15 err. **Pre-existing debt:** baseline at 57fa4ca (pre-Phase-6) = 292 fail / 14 err. Root cause: `make test` (bun:test) sweeps Playwright E2E files (`test.describe() not expected here`) and Vitest DOM component files (`document is not defined`); `Temporal` resolves `undefined` for some files. The +28 Phase-6 delta is Phase 6's component tests run by bun:test instead of Vitest — they pass under Vitest. **No real Phase 6 unit regression.**

## Deviations from Plan

### Known Debt (not introduced by Phase 6)

**1. `make test` gate cannot exit 0 — pre-existing test-runner-scoping bug**

- Task 3 requires `make test` exit 0. The branch carries 292 pre-existing unit failures unrelated to Phase 6 (verified against baseline 57fa4ca).
- Root cause: bun:test test glob includes frontend Vitest files and Playwright E2E files that it cannot execute.
- Recommendation: file a separate remediation task to scope the `make test` glob to backend-only. Out of scope for `/gsd-execute-phase 6`.

**2. 58 `bdp.*` i18n keys untranslated in pl/uk**

- Pre-existing Phase 3/5 reserves keys never translated. Phase 6 Task 1 scoped to its own namespaces. Out of Phase 6 scope.

## Pending Checkpoint

**Task 4 — Human UAT (checkpoint:human-verify, blocking)** is not yet done. It requires a human to exercise, against a running stack: Settings (5-section accordion), Onboarding wizard (5 steps), and Share-link join. Surfaced to the user by the orchestrator.

## Self-Check

- [x] pl.json + uk.json — settings/onboarding/share translated, parity verified
- [x] tests/e2e/features/{settings,onboarding,share}/*.feature — FOUND
- [x] tests/e2e/pages/{BudgetSettingsPage,JoinPage,OnboardingPage}.ts — FOUND
- [x] tests/e2e/steps/{budget-settings,onboarding,join}.steps.ts — FOUND
- [x] Phase 6 component tests (Vitest) — 27/27 GREEN
- [x] tenant-leak ci-gate — 37/37 GREEN
- [x] Commits 8097841, 6fd8da5, d0c3435 — FOUND
- [ ] Task 4 human UAT — PENDING (blocking checkpoint)

## Self-Check: PASSED (Tasks 1-3; Task 4 awaiting human verification)
