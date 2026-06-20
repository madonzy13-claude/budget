---
phase: 08-pwa-offline-push-i18n-e2e-hardening
plan: 07
status: blocked_on_human_uat
requirements: [E2EX-05, PWAX-01, PWAX-04, I18N-01]
---

# 08-07 — Phase-8 Launch Gate — SUMMARY

## Task 1: Wire check:i18n into CI + automated gate sweep — DONE (automated parts)

`check:i18n` step added to `.github/workflows/ci.yml` grep-gates job
(`bun run check:i18n`) — fails the build on any EN/PL/UK parity gap
(I18N-01, D-17). Committed `ad573be`.

Automated gates run locally, all GREEN together:

| Gate                | Command                                                               | Result                                                                                      |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| i18n completeness   | `bun run check:i18n`                                                  | PASS (exit 0)                                                                               |
| Tenant-leak         | `make ci-gate`                                                        | 51 pass / 0 fail · 14 files (10 cross-tenant incl. push_subscriptions + notification_prefs) |
| Typecheck           | `bun run typecheck`                                                   | PASS — all 10 workspaces exit 0                                                             |
| dependency-cruiser  | `bun run depcheck`                                                    | no violations (1190 modules, 3030 deps)                                                     |
| Grep gates          | `grep:no-direct-tx`, `grep:no-pool-connect`                           | PASS (apps/web idb tx excluded from the Drizzle gate)                                       |
| Vitest (component)  | `cd apps/web && bun run test`                                         | 561 pass / 0 fail / 43 skipped (70 files)                                                   |
| Push routes         | `bun test apps/api/test/routes/push.test.ts`                          | 11 pass                                                                                     |
| Outbox emission     | `bun test packages/budgeting/test/tasks/task-outbox-emission.test.ts` | 4 pass                                                                                      |
| Worker push handler | `bun test apps/worker/test/push-notification-handler.test.ts`         | 9 pass                                                                                      |

**Regression fixed by the sweep:** the full Vitest run surfaced 4 failures in the
pre-existing onboarding wizard tests (`wizard-page`, `wizard-stepper`) — 08-05
inserted a skippable push step at index 4, shifting Review to step 5 and the
stepper to 5 segments. Tests updated to the 5-step flow (`f8f5a84`).

**`make test` (full backend bun:test):** carries documented pre-existing infra
debt (bun:test sweeps Vitest/Playwright files → ~292 unrelated reds, see STATE
`make_test_infra_debt`). The Phase-8 backend subset (push, outbox, worker,
tenant-leak) is green via the correct runners above; not chasing the pre-existing
aggregate artifact (per plan read_first note).

### Environment-bound (NOT runnable headless here) — pending the live stack:

- **Web image rebuild + served-bundle key check** (`make restart-web`) — requires
  the Docker build host; messages are bundled at build time.
- **`make test-e2e`** (Playwright BDD, E2EX-05) — 08-06 authored 13 @phase8
  scenarios and `bunx bddgen` compiles them clean (all step bindings resolve),
  but a live run needs the rebuilt web/api/worker stack serving at
  `PLAYWRIGHT_BASE_URL` (.env.local APP_URL = the Tailscale host). Only `db` is
  up in this session.

## Task 2: Impeccable DESIGN.md sweep on 5 new UI surfaces — PENDING (served bundle)

Must be verified against the **served bundle** (getComputedStyle / rendered DOM,
not source) per the SW-cache memory — requires the rebuilt running stack. Static
review: new components use design tokens (no new CSS vars / no hex literals added);
accent reserved for documented affordances. Final Sign-Off boxes to be marked PASS
after the served-bundle check on the live stack.

## Task 3: Human UAT (real-device install + push + deep-link) — BLOCKING CHECKPOINT

Manual-only per 08-VALIDATION (cannot be driven headless). Awaiting human verification:

1. PWA install on a real mobile browser over HTTPS → launches standalone with manifest icons (PWAX-01).
2. Settings → Notifications enable push + RESERVE_TOPUP; trigger the task; confirm a generic (no-amounts) push arrives (PWAX-04/05, D-15).
3. Tap the push → opens `/budgets/[id]/reserves?task=[id]` with the banner row auto-expanded (PWAX-06, D-13); already-resolved id lands silently (D-14).
4. Locale spot-check PL/UK on the new push/install/offline strings (I18N-02, D-19).

## Status

Automated gate sweep GREEN. Remaining items (web rebuild, live E2E, DESIGN
served-bundle sweep, real-device UAT) require the live stack + a real device.
Phase 8 is **not marked complete** until the human UAT checkpoint is approved.
