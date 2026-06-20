# Deferred Items — Phase 08

Out-of-scope discoveries logged during execution. Not fixed inline (scope boundary).

## 1. onboarding-wizard.feature stale vs phase-8 Push step (found 2026-06-12, quick-260612-g7v R5 subset sweep)

- **Scenario:** `Onboarding Wizard — 4-step deferred-create flow (ONBD-01..09) › Fresh user walks all four steps and lands on spendings tab` (@phase6)
- **Failure:** consistent on chromium + mobile (all 4 attempts). `Then I see the review step` times out waiting for `getByRole('button', { name: /create budget/i })`.
- **Root cause (from error-context snapshot):** the wizard now has a 5th step — "Push" ("Enable push notifications", phase-8 push work). Stepper shows `Type/Basics/Features completed, Push active, Review pending`; the test walks only 4 steps so it sits on the Push step, never reaching Review.
- **Fix needed:** update `tests/e2e/features/onboarding/onboarding-wizard.feature` + `tests/e2e/steps/onboarding.steps.ts` to walk the Push step (Skip for now / Skip) before asserting the Review step. Rename "4-step" references.
- **Not related to:** SHELL-R15 grid geometry changes (diff scoped to `[data-grid-tail-spacer]` CSS, grid-only `--grid-max-h`, vpdbg overlay — wizard has none of these).

## 2. fresh-user sign-up fixture flake under long live-tunnel runs (found same sweep)

- **Symptom:** `freshUser.ts:91` — after submit, URL stays on `/en/sign-up` instead of `/sign-in?verify=pending` (10s timeout). Hit once hard (mobile-scroll @phase4 on chromium, both attempts) and is the likely cause of most of the 13 flaky-passed-on-retry scenarios in the 16.8m run against https://budget-dev.madonzy.com.
- **Suspects:** sign-up rate limiting / email-send latency on dev API after ~60 sequential sign-ups through the cloudflare tunnel.
- **Fix needed:** investigate API-side sign-up latency under bursts; consider fixture retry-on-submit or longer timeout for live-tunnel runs.
