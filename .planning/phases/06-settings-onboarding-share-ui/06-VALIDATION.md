---
phase: 6
slug: settings-onboarding-share-ui
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-22
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                         |
| ---------------------- | ----------------------------------------------------------------------------- |
| **Framework**          | bun:test (backend) · Vitest 4 + happy-dom (frontend) · Playwright-BDD (E2E)   |
| **Config file**        | `bunfig.toml` · `apps/web/vitest.config.ts` · `apps/web/playwright.config.ts` |
| **Quick run command**  | `make test`                                                                   |
| **Full suite command** | `make test && make ci-gate && cd apps/web && bun run test`                    |
| **Estimated runtime**  | ~120 seconds                                                                  |

---

## Sampling Rate

- **After every task commit:** Run `make test`
- **After every plan wave:** Run full suite
- **Before `/gsd-verify-work`:** Full suite + `make test-e2e` must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID  | Plan  | Wave | Requirement                      | Threat Ref       | Secure Behavior                                             | Test Type                | Automated Command                                                                                 | File Exists             | Status     |
| -------- | ----- | ---- | -------------------------------- | ---------------- | ----------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------- | ----------------------- | ---------- |
| 06-01-T1 | 06-01 | 1    | ONBD-07, SETT-08                 | T-06-01-01       | USER-SCOPED RLS policy on onboarding_progress               | schema/grep              | `grep onboardingProgress …/onboarding-progress-schema.ts`                                         | created                 | ⬜ pending |
| 06-01-T2 | 06-01 | 1    | ONBD-07                          | T-06-01-01/02    | FORCE RLS + tenant-leak gate recognises onboarding_progress | security                 | `make migrate && make ci-gate`                                                                    | n/a                     | ⬜ pending |
| 06-01-T3 | 06-01 | 1    | SETT-02/05/07/08, ONBD-07        | —                | RED integration scaffolds for net-new endpoints             | integration (scaffold)   | `test -f apps/api/test/routes/{budget-identity,budget-members,budget-archive,onboarding}.test.ts` | created                 | ⬜ pending |
| 06-01-T4 | 06-01 | 1    | SETT-01/08, ONBD-02..07, SHRD-04 | —                | Route-ordering regression + Vitest/E2E Wave 0 stubs         | regression + scaffold    | route-ordering test + 5 Vitest stubs + 3 `.feature` stubs exist; `bunx bddgen` exits 0            | created                 | ⬜ pending |
| 06-02-T1 | 06-02 | 2    | SETT-02, SETT-03                 | T-06-02-04       | Parameterised SQL; unified cushion write path               | unit (tenancy)           | `cd packages/tenancy && bun test`                                                                 | exists                  | ⬜ pending |
| 06-02-T2 | 06-02 | 2    | SETT-02, SETT-03                 | T-06-02-01/02/03 | Currency-lock 409; tenant gate 404; cushion single path     | integration              | `cd apps/api && bun test test/routes/budget-identity.test.ts`                                     | Wave 0 (06-01-T3)       | ⬜ pending |
| 06-03-T1 | 06-03 | 2    | SETT-05, SETT-07                 | T-06-03-01/02/03 | Owner-only revoke; last-owner guard; tenant gate            | integration              | `cd apps/api && bun test test/routes/budget-members.test.ts`                                      | Wave 0 (06-01-T3)       | ⬜ pending |
| 06-03-T2 | 06-03 | 2    | SETT-06, SETT-07                 | T-06-03-02       | Share-link + last-owner-leave regression; route ordering    | integration (regression) | `cd apps/api && bun test test/routes/budget-members.test.ts test/routes/share-links.test.ts`      | Wave 0 (06-01-T3/T4)    | ⬜ pending |
| 06-04-T1 | 06-04 | 3    | ONBD-07                          | T-06-04-03/04    | onboarding progress scoped to session user; RLS GUC tx      | integration              | `cd apps/api && bun test test/routes/onboarding.test.ts`                                          | Wave 0 (06-01-T3)       | ⬜ pending |
| 06-04-T2 | 06-04 | 3    | SETT-08                          | T-06-04-01/02/05 | Owner gate; server typed-name re-validate; archive filter   | integration              | `cd apps/api && bun test test/routes/budget-archive.test.ts`                                      | Wave 0 (06-01-T3)       | ⬜ pending |
| 06-05-T1 | 06-05 | 4    | SETT-01/02/03/04/09              | T-06-05-03       | Members hidden on PRIVATE; recurring uses budget-scoped API | component + integration  | `cd apps/web && bun run test -- settings/settings-accordion` ; `make test`                        | Wave 0 (06-01-T4)       | ⬜ pending |
| 06-05-T2 | 06-05 | 4    | SETT-05/06/07/08                 | T-06-05-01/02/04 | Owner-only controls; copy-failure toast; ephemeral URL      | component                | `cd apps/web && bun run test -- settings/danger-zone-section`                                     | Wave 0 (06-01-T4)       | ⬜ pending |
| 06-06-T1 | 06-06 | 4    | ONBD-02..06, ONBD-08/09          | T-06-06-02       | Forged `?step` cannot fabricate state                       | component                | `cd apps/web && bun run test -- onboarding/`                                                      | Wave 0 (06-01-T4)       | ⬜ pending |
| 06-06-T2 | 06-06 | 4    | ONBD-01, ONBD-08                 | T-06-06-03       | No-row early exit; only completed_at===null redirects       | build + grep             | `cd apps/web && bun run build` ; no-row guard grep                                                | exists                  | ⬜ pending |
| 06-06-T3 | 06-06 | 4    | ONBD-01                          | T-06-06-05       | Idempotent best-effort onboarding_progress seed at signup   | unit (identity)          | `cd packages/identity && bun test`                                                                | exists                  | ⬜ pending |
| 06-07-T1 | 06-07 | 5    | SHRD-04                          | T-06-07-05       | Public allowlist exempts only /budgets/join/\*              | build + grep             | `grep PUBLIC_BUDGET_PATHS apps/web/src/middleware.ts` ; `bun run build`                           | exists                  | ⬜ pending |
| 06-07-T2 | 06-07 | 5    | SHRD-04                          | T-06-07-02/03/04 | Public RSC leaks only budgetName; accept auth-gated         | component                | `cd apps/web && bun run test -- share/join-page-card`                                             | Wave 0 (06-01-T4)       | ⬜ pending |
| 06-08-T1 | 06-08 | 6    | (all — i18n parity)              | T-06-08-01       | en/pl/uk key parity fails closed on drift                   | parity check             | i18n parity node check (see plan)                                                                 | exists                  | ⬜ pending |
| 06-08-T2 | 06-08 | 6    | SETT-_, ONBD-_, SHRD-04          | —                | E2E covers golden path + error cases for all 3 flows        | E2E (playwright-bdd)     | `cd apps/web && bunx bddgen`                                                                      | Wave 0 stubs (06-01-T4) | ⬜ pending |
| 06-08-T3 | 06-08 | 6    | SETT-_, ONBD-_, SHRD-04          | T-06-08-02/03    | Full gate green with Docker; ci-gate 5/5                    | full gate                | `make test && make ci-gate && make test-e2e`                                                      | n/a                     | ⬜ pending |
| 06-08-T4 | 06-08 | 6    | (all)                            | —                | Human UAT of all 3 surfaces incl. PL/UK                     | checkpoint:human-verify  | manual — see plan                                                                                 | n/a                     | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

All Wave 0 scaffolds are created in **Plan 06-01 (Wave 1)** — there is no separate Wave 0
plan. Scaffolds are authored RED/skipped; downstream plans turn them GREEN. Each
reference below maps to a covering Plan 06-01 task.

| Wave 0 Artifact                                           | Covering Task | Type                  | Turned GREEN by         |
| --------------------------------------------------------- | ------------- | --------------------- | ----------------------- |
| `apps/api/test/routes/budget-identity.test.ts`            | 06-01-T3      | integration scaffold  | Plan 06-02 (SETT-02/03) |
| `apps/api/test/routes/budget-members.test.ts`             | 06-01-T3      | integration scaffold  | Plan 06-03 (SETT-05/07) |
| `apps/api/test/routes/budget-archive.test.ts`             | 06-01-T3      | integration scaffold  | Plan 06-04 (SETT-08)    |
| `apps/api/test/routes/onboarding.test.ts`                 | 06-01-T3      | integration scaffold  | Plan 06-04 (ONBD-07)    |
| `apps/api/test/routes/budget-route-ordering.test.ts`      | 06-01-T4      | regression scaffold   | Plans 06-03 / 06-04     |
| `apps/web/test/settings/settings-accordion.test.tsx`      | 06-01-T4      | Vitest component stub | Plan 06-05 Task 1       |
| `apps/web/test/settings/danger-zone-section.test.tsx`     | 06-01-T4      | Vitest component stub | Plan 06-05 Task 2       |
| `apps/web/test/onboarding/wizard-stepper.test.tsx`        | 06-01-T4      | Vitest component stub | Plan 06-06 Task 1       |
| `apps/web/test/onboarding/wizard-page.test.tsx`           | 06-01-T4      | Vitest component stub | Plan 06-06 Task 1       |
| `apps/web/test/share/join-page-card.test.tsx`             | 06-01-T4      | Vitest component stub | Plan 06-07 Task 2       |
| `tests/e2e/features/settings/budget-settings.feature`     | 06-01-T4      | E2E `.feature` stub   | Plan 06-08 Task 2       |
| `tests/e2e/features/onboarding/onboarding-wizard.feature` | 06-01-T4      | E2E `.feature` stub   | Plan 06-08 Task 2       |
| `tests/e2e/features/share/join.feature`                   | 06-01-T4      | E2E `.feature` stub   | Plan 06-08 Task 2       |
| `tenancy.onboarding_progress` table + migration           | 06-01-T1/T2   | schema/migration      | Plan 06-04 (consumes)   |

`wave_0_complete` stays `false` until execution confirms every scaffold file above
exists and the 06-01 tasks complete. The E2E `.feature` stubs ship `@skip-wip` so
`bddgen` compiles them without failing CI before Plan 06-08 implements them.

---

## Manual-Only Verifications

| Behavior                                 | Requirement    | Why Manual                                         | Test Instructions                                              |
| ---------------------------------------- | -------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| DESIGN.md yellow-accent discipline sweep | SETT/ONBD/SHRD | Visual judgement against the accent-reserved list  | Plan 06-08 Task 3 Step 3 — check the 5 allowed yellow elements |
| Full UAT of the 3 surfaces incl. PL/UK   | all            | End-to-end human confirmation of the integrated UX | Plan 06-08 Task 4 — the checkpoint:human-verify steps          |

Everything else has automated verification (integration, component, E2E, security gate).

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (every scaffold has a covering 06-01 task)
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready — `wave_0_complete` flips to true during execution once Plan 06-01 completes.
</content>
</invoke>
