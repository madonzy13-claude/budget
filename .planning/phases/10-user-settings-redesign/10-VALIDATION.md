---
phase: 10
slug: user-settings-redesign
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-26
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from
> 10-RESEARCH.md "## Validation Architecture". TDD-first per CLAUDE.md.

---

## Test Infrastructure

| Property               | Value                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Framework**          | bun:test (backend unit+integration) · Vitest 4 + RTL + happy-dom (component) · Playwright + playwright-bdd (E2E) |
| **Config file**        | `bunfig.toml` · `apps/web/playwright.config.ts` (source of truth)                                                |
| **Quick run command**  | `cd apps/web && bun run test` (component)                                                                        |
| **Full suite command** | `make test && make test-e2e` (+ `make ci-gate`)                                                                  |
| **Estimated runtime**  | component ~30s · `make test` minutes · E2E full multi-viewport longer                                            |

---

## Sampling Rate

- **After every task commit:** Run the layer touched (`bun run test` for FE, `make test` for API/identity).
- **After every plan wave:** Run `make test` + affected E2E `--grep`.
- **Before `/gsd-verify-work`:** `make test` + `make test-e2e` + `make ci-gate` all green.
- **Max feedback latency:** ~30s (component quick loop).

---

## Per-Requirement Verification Map

> Per-task rows (`10-PP-TT`) are enumerated by each PLAN's tasks; this is the requirement-level
> contract every plan must satisfy.

| Requirement                              | Plan(s) | Test Type                        | Automated Command                                                           | Concrete assertion                                                                                                                       | Status     |
| ---------------------------------------- | ------- | -------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Provider removal                         | 01      | integration + grep + ci-gate     | `make test` · `make ci-gate` · `grep -r preferredLlmProvider packages apps` | provider-prefs tests gone; grep → 0 hits; ci-gate green; migration drops both columns                                                    | ⬜ pending |
| Settings pill shell                      | 02      | component + E2E                  | `cd apps/web && bun run test` · `make test-e2e --grep @settings`            | 2 pills render, pushState carousel, no per-nav RSC, `loading.tsx` present                                                                | ⬜ pending |
| General (locale+currency restyle)        | 03      | component + E2E                  | `bun run test` · E2E                                                        | `PUT /settings/locale` + `/display-currency` still 200; locale change reloads `[locale]`                                                 | ⬜ pending |
| Profile name edit                        | 04      | integration + E2E                | `make test` · E2E change-name                                               | `updateUser({name})` → plain `name` updated                                                                                              | ⬜ pending |
| Profile email change + re-verify         | 04      | **integration (critical)** + E2E | `make test`                                                                 | email updated, `email_verified=false`, **`email_hash` recomputed** (`findByEmail(new)` resolves, old fails); correct template→address    | ⬜ pending |
| Email-gated password change              | 05      | integration + E2E                | `make test` · E2E                                                           | logged-in button fires `reset-password` email to self; `/reset-password?token` sets new pw                                               | ⬜ pending |
| Sessions list + revoke + sign-out-others | 05      | component + E2E                  | `bun run test` · E2E                                                        | revoke removes row; `revokeOtherSessions` leaves only current                                                                            | ⬜ pending |
| Account deletion / GDPR                  | 06      | **integration (critical)** + E2E | `make test`                                                                 | PRIVATE-owner delete purges budget+tenant data+`user_keys`+memberships+invitations+user; SHARED-with-members **blocks**; user signed out | ⬜ pending |
| Forgot/reset pages + sign-in link        | 07      | E2E (Gherkin)                    | `make test-e2e --grep @forgot-password`                                     | forgot golden + expired-token; sign-in "Forgot?" → `/forgot-password`; EN/PL/UK                                                          | ⬜ pending |
| Cross-cutting i18n                       | all     | build + grep                     | `make restart-web` (build) · grep keys                                      | every new key in en/pl/uk; `settings.providers.*` removed                                                                                | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements (bun:test, Vitest, playwright-bdd all installed).
- New test FILES needed (written test-first per TDD): `apps/api/test/routes/settings.test.ts` (extend for
  name/email/delete), identity integration tests for email_hash recompute + delete cascade, component tests
  for each section + the pill shell, E2E `.feature` files for the seven flows.

---

## Manual-Only Verifications

| Behavior                                            | Requirement | Why Manual                  | Test Instructions                                                                                   |
| --------------------------------------------------- | ----------- | --------------------------- | --------------------------------------------------------------------------------------------------- |
| Real inbound email rendering (change-email / reset) | email flows | Resend delivery is external | Final UAT: trigger flow against budget-dev.madonzy.com, confirm email arrives + link works EN/PL/UK |

_Automated tests assert the SEND call + template/vars + token consume; actual inbox delivery is the only manual leg._

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
