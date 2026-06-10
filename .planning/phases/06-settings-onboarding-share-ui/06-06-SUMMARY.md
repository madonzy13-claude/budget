---
phase: 06-settings-onboarding-share-ui
plan: "06"
subsystem: apps/web — onboarding wizard UI + signup seed
tags:
  [
    onboarding-wizard,
    wizard-stepper,
    budget-new,
    onboarding-guard,
    signup-seed,
    onbd-01,
    onbd-02,
    onbd-03,
    onbd-04,
    onbd-05,
    onbd-06,
    onbd-08,
    onbd-09,
  ]
dependency_graph:
  requires:
    - plan/06-01 (onboarding_progress table + accordion/switch primitives)
    - plan/06-04 (GET/PUT /onboarding/progress backend)
    - plan/06-05 (en.json share/settings namespaces — appended, not overwritten)
  provides:
    - 5-step onboarding wizard at /budgets/new (name → currency → type → categories → review)
    - incomplete-onboarding layout guard in (app)/layout.tsx
    - /onboarding legacy route retired
    - onboarding_progress row seeded at signup (ONBD-01)
  affects:
    - plan/06-08 (E2E onboarding-wizard.feature can exercise full wizard)
tech_stack:
  added: []
  patterns:
    - "WizardPage: client step-state machine, PUT /onboarding/progress on step advance (resumable)"
    - "WizardStepper: numbered progress indicator, yellow-accent active step"
    - "Layout guard: incomplete onboarding_progress → redirect into wizard"
    - "Signup hook: seed onboarding_progress row in Better Auth adapter (better-auth.ts)"
key_files:
  created:
    - apps/web/src/components/onboarding/wizard-page.tsx
    - apps/web/src/components/onboarding/wizard-layout.tsx
    - apps/web/src/components/onboarding/wizard-stepper.tsx
    - apps/web/src/components/onboarding/steps/step-name.tsx
    - apps/web/src/components/onboarding/steps/step-currency.tsx
    - apps/web/src/components/onboarding/steps/step-type.tsx
    - apps/web/src/components/onboarding/steps/step-categories.tsx
    - apps/web/src/components/onboarding/steps/step-review.tsx
    - packages/identity/test/onboarding-progress-seed.test.ts
  modified:
    - apps/web/src/app/[locale]/(app)/budgets/new/page.tsx
    - apps/web/src/app/[locale]/(app)/layout.tsx
    - apps/web/src/app/[locale]/(app)/onboarding/page.tsx
    - apps/web/messages/en.json
    - packages/identity/src/adapters/persistence/better-auth.ts
    - apps/web/test/onboarding/wizard-page.test.tsx
    - apps/web/test/onboarding/wizard-stepper.test.tsx
decisions:
  - "en.json onboarding keys appended after 06-05's settings/share namespaces — no overwrite"
  - "/onboarding legacy route retired (v1.0 workspace-based impl) — wizard lives at /budgets/new"
  - "onboarding_progress seeded at signup so the layout guard has a row to read from first login"
metrics:
  duration: "~11 min"
  completed: "2026-05-22"
  tasks_completed: 3
  files_created: 9
  files_modified: 7
finalized_by: orchestrator
finalized_note: "Executor completed and committed all 3 tasks (b84acee, 2016efa, ad9a60b) but was interrupted before writing SUMMARY/STATE/ROADMAP. Orchestrator wrote this SUMMARY and re-ran the plan's tests to confirm GREEN."
---

# Phase 6 Plan 06: Onboarding Wizard UI Summary

**One-liner:** 5-step onboarding wizard at `/budgets/new` (name → currency → type → categories → review) with resumable `onboarding_progress` persistence, an incomplete-onboarding layout guard, the legacy `/onboarding` route retired, and an `onboarding_progress` row seeded at signup; 14 tests GREEN.

## Tasks Completed

| #   | Task                                                              | Commit  | Key Files                                                                                                                  |
| --- | ----------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | 5-step onboarding wizard at /budgets/new + en.json keys           | b84acee | wizard-page.tsx, wizard-layout.tsx, wizard-stepper.tsx, steps/step-{name,currency,type,categories,review}.tsx, en.json, budgets/new/page.tsx, wizard-page.test.tsx, wizard-stepper.test.tsx |
| 2   | Incomplete-onboarding layout guard + retire /onboarding route     | 2016efa | (app)/layout.tsx, (app)/onboarding/page.tsx                                                                                |
| 3   | Seed onboarding_progress row at signup (ONBD-01)                  | ad9a60b | identity/adapters/persistence/better-auth.ts, identity/test/onboarding-progress-seed.test.ts                                |

## Verification Results

- `cd apps/web && bun run test -- onboarding/` — 12 pass, 0 fail (2 files: wizard-page, wizard-stepper)
- `bun test packages/identity/test/onboarding-progress-seed.test.ts` — 2 pass, 0 fail
- Pre-commit hooks (lint + typecheck) passed on all 3 commits
- `apps/web/public/sw.js` — unmodified (no build artifact churn committed)

## Deviations from Plan

None recorded by the executor before interruption. All 3 plan tasks committed and tested GREEN.

## Known Stubs

None — wizard wired to real `/onboarding/progress` backend (06-04) and signup seed in the Better Auth adapter.

## Self-Check

- [x] wizard-page.tsx — FOUND
- [x] wizard-layout.tsx — FOUND
- [x] wizard-stepper.tsx — FOUND
- [x] steps/step-name.tsx, step-currency.tsx, step-type.tsx, step-categories.tsx, step-review.tsx — FOUND
- [x] (app)/layout.tsx onboarding guard — FOUND
- [x] (app)/onboarding/page.tsx retired — FOUND
- [x] better-auth.ts signup seed — FOUND
- [x] en.json onboarding keys (06-05 keys preserved) — FOUND
- [x] onboarding component tests — 12/12 GREEN
- [x] identity seed test — 2/2 GREEN
- [x] Commits b84acee, 2016efa, ad9a60b — FOUND

## Self-Check: PASSED
