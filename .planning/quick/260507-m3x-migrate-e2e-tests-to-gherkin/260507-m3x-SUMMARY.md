---
phase: 260507-m3x
plan: 01
subsystem: e2e-testing
tags: [playwright-bdd, gherkin, page-objects, fixtures, e2e]
tech-stack:
  added: [playwright-bdd@8.5.0]
  patterns: [Gherkin BDD, Page Object Model, per-scenario fixture, Scenario Outline]
key-files:
  created:
    - playwright.config.ts (rewritten)
    - tests/e2e/pages/labels.ts
    - tests/e2e/pages/SignUpPage.ts
    - tests/e2e/pages/SignInPage.ts
    - tests/e2e/pages/OnboardingPage.ts
    - tests/e2e/pages/AppShellPage.ts
    - tests/e2e/fixtures/freshUser.ts
    - tests/e2e/fixtures/mailpit.ts
    - tests/e2e/fixtures/index.ts
    - tests/e2e/steps/auth.steps.ts
    - tests/e2e/steps/navigation.steps.ts
    - tests/e2e/steps/currency.steps.ts
    - tests/e2e/features/auth/sign-up.feature
    - tests/e2e/features/auth/sign-up-form.feature
    - tests/e2e/features/auth/signin-errors.feature
    - tests/e2e/features/auth/sign-out.feature
    - tests/e2e/features/auth/auth-guards.feature
    - tests/e2e/features/auth/duplicate-signup.feature
    - tests/e2e/features/auth/email-verification.feature
    - tests/e2e/features/auth/verify-required.feature
    - tests/e2e/features/currency/currency-picker-i18n.feature
    - tests/e2e/README.md
  deleted:
    - tests/e2e/auth/sign-up.spec.ts
    - tests/e2e/auth/signin-errors.spec.ts
    - tests/e2e/auth/sign-out.spec.ts
    - tests/e2e/auth/duplicate-signup.spec.ts
    - tests/e2e/auth/email-verification.spec.ts
    - tests/e2e/auth/auth-guards.spec.ts
    - tests/e2e/auth/verify-required.spec.ts
    - tests/e2e/currency/currency-picker-i18n.spec.ts
    - tests/e2e/helpers/auth.ts
  modified:
    - Makefile
    - package.json
    - bun.lock
    - .gitignore
decisions:
  - Escaped slashes in Cucumber step phrases containing URL paths (e.g. "/api/auth/sign-in/email") — rewrote as "sign-in email endpoint" to avoid Cucumber alternation parse error
  - ScenarioCtx typed as interface with known fields plus escape-hatch casts for lastApiStatus/lastApiBody/lastMailpitMessage
  - freshUser fixture locale defaults to "en"; non-en authenticated scenarios use "Given a fresh verified user in" step which calls createFreshUser() directly
  - "expect" imported from "@playwright/test" not "playwright-bdd" (playwright-bdd 8.x does not re-export expect)
metrics:
  duration: ~35 minutes
  completed: 2026-05-07
  tasks: 6
  files_added: 23
  files_deleted: 9
---

# Phase 260507-m3x Plan 01: Migrate E2E Tests to Gherkin Summary

One-liner: playwright-bdd@8.5.0 toolchain wired with 9 feature files, 4 page objects, per-scenario freshUser fixture, and locale labels centralized in one file; all 32 scenarios green.

## Tasks Completed

| Task | Name                                           | Commit    | Files                                                              |
| ---- | ---------------------------------------------- | --------- | ------------------------------------------------------------------ |
| 1    | Wire playwright-bdd toolchain                  | `43a4144` | playwright.config.ts, Makefile, package.json, bun.lock, .gitignore |
| 2    | Page objects, locale labels, freshUser fixture | `52a5015` | 8 files under tests/e2e/pages/ and tests/e2e/fixtures/             |
| 3    | Auth batch 1 features + step definitions       | `b8636e4` | 5 .feature files + auth.steps.ts + navigation.steps.ts             |
| 4    | Auth batch 2 features                          | `7ca4629` | duplicate-signup, email-verification, verify-required              |
| 5    | Currency feature, README, full suite green     | `c9735d5` | currency-picker-i18n.feature, currency.steps.ts, README.md         |
| 6    | Delete legacy specs + helper, re-verify        | `5310b80` | 9 files deleted                                                    |

## Final Test Count

```
32 passed (35.8s)
```

All 32 scenarios from the baseline parity table pass. Breakdown:

| Feature file                          | Runs   |
| ------------------------------------- | ------ |
| auth/sign-up.feature                  | 1      |
| auth/sign-up-form.feature             | 5      |
| auth/signin-errors.feature            | 3      |
| auth/sign-out.feature                 | 4      |
| auth/duplicate-signup.feature         | 2      |
| auth/email-verification.feature       | 4      |
| auth/auth-guards.feature              | 5      |
| auth/verify-required.feature          | 5      |
| currency/currency-picker-i18n.feature | 3      |
| **Total**                             | **32** |

## PLAYWRIGHT_BASE_URL Confirmation

Makefile `PLAYWRIGHT_BASE_URL_RESOLVED` logic is unchanged — reads `APP_URL` from `.env.local` first, then `.env`, then falls back to `http://localhost:3000`. Both `test-e2e` and `test-e2e-ui` targets run `bunx bddgen` then `bunx playwright test` with `PLAYWRIGHT_BASE_URL=$(PLAYWRIGHT_BASE_URL_RESOLVED)`. Verified against `http://claude-code.tail4b2401.ts.net:3000` throughout.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cucumber expression parse error for step phrases containing URL paths**

- **Found during:** Task 3 first bddgen run
- **Issue:** Step phrase `I post to /api/auth/sign-in/email with the original email and password {string}` caused `Alternative may not be empty` — Cucumber expressions treat `/` as alternation separator
- **Fix:** Renamed step to `I post to the sign-in email endpoint with the original email and password {string}`; updated matching feature text. Same fix applied to `GET /api/auth/get-session returns null` → `the get-session API returns null`
- **Files modified:** auth.steps.ts, sign-out.feature, duplicate-signup.feature

**2. [Rule 1 - Bug] playwright-bdd 8.x does not export `expect`**

- **Found during:** Task 2 typecheck
- **Issue:** `import { test as base, expect } from "playwright-bdd"` gave `Module 'playwright-bdd' has no exported member 'expect'`
- **Fix:** Import `expect` from `@playwright/test` instead; freshUser.ts updated
- **Files modified:** tests/e2e/fixtures/freshUser.ts

## Pre-existing Flakiness

None observed. All 32 scenarios passed on first run both before and after legacy deletion. No retries triggered.

## Files Added/Deleted

- Files added: 23 (9 feature files, 4 page objects, 3 step files, 3 fixture files, README, playwright.config.ts rewrite)
- Files deleted: 9 (7 auth spec files, 1 currency spec file, 1 helpers/auth.ts)
- Net new files: +14

## Known Stubs

None. All page objects wire to real UI selectors; all assertions use actual locale labels from labels.ts.

## Self-Check: PASSED

- All 9 feature files exist under tests/e2e/features/
- All 4 page objects exist under tests/e2e/pages/
- All 3 step files exist under tests/e2e/steps/
- All fixture files exist under tests/e2e/fixtures/
- tests/e2e/README.md exists (134 lines)
- 6 commits exist: 43a4144, 52a5015, b8636e4, 7ca4629, c9735d5, 5310b80
- No legacy .spec.ts files remain
- No references to tests/e2e/helpers/auth in any .ts file
- 32 scenarios pass
