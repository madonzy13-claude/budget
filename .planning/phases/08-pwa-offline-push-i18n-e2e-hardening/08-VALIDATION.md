---
phase: 08
slug: pwa-offline-push-i18n-e2e-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-10
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                         |
| ---------------------- | ----------------------------------------------------------------------------- |
| **Framework**          | bun:test (backend) · Vitest 4 + happy-dom (frontend) · Playwright BDD (E2E)   |
| **Config file**        | `bunfig.toml` · `apps/web/vitest.config.ts` · `apps/web/playwright.config.ts` |
| **Quick run command**  | `make test` (bun:test backend unit + integration)                             |
| **Full suite command** | `make test && cd apps/web && bun run test && make test-e2e`                   |
| **Estimated runtime**  | ~120–900 seconds (E2E golden walk dominates)                                  |

---

## Sampling Rate

- **After every task commit:** Run `make test` (or scoped `bun test <file>` for the touched context)
- **After every plan wave:** Run full suite for the track (Vitest for FE, Playwright for E2E flows)
- **Before `/gsd-verify-work`:** Full suite must be green + `make ci-gate` 8/8
- **Max feedback latency:** 120 seconds (quick command)

---

## Per-Task Verification Map

> Populated by the planner. Each task maps to an automated command or a Wave 0 dependency.
> Tracks: (A) Offline/IndexedDB · (B) Push/VAPID · (C) i18n · (D) E2E audit-and-fill.

| Task ID  | Plan | Wave | Requirement       | Threat Ref  | Secure Behavior                     | Test Type          | Automated Command | File Exists | Status     |
| -------- | ---- | ---- | ----------------- | ----------- | ----------------------------------- | ------------------ | ----------------- | ----------- | ---------- |
| 08-XX-XX | XX   | N    | PWAX-/I18N-/E2EX- | T-08-XX / — | {expected secure behavior or "N/A"} | unit/component/e2e | `{command}`       | ✅ / ❌ W0  | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_
_Planner: replace the placeholder row above with one row per task across all plans._

---

## Wave 0 Requirements

- [ ] `idb` (8.0.3) + `web-push` (3.6.7) installed — confirmed missing by research
- [ ] IndexedDB cache schema Zod contract shared with server contracts (cache-version field)
- [ ] VAPID keypair generated + env wiring (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`)
- [ ] Test fixtures: offline/online network-condition helpers for Playwright; push-subscription test double
- [ ] E2E: 3 missing Page Objects scaffolded (SpendingsPo, OnboardingPo, ShareLinkPo)

_If a track needs no new infra, mark "Existing infrastructure covers all phase requirements."_

---

## Manual-Only Verifications

| Behavior                                  | Requirement | Why Manual                                                 | Test Instructions                                                            |
| ----------------------------------------- | ----------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| PWA installability on real mobile browser | PWAX-01     | beforeinstallprompt + OS install UI not driveable headless | Install from Chrome/Safari mobile; confirm standalone launch, manifest icons |
| Real web-push delivery to device          | PWAX-04     | OS push service (FCM/APNs) not reachable in CI             | Subscribe on device; trigger RESERVE_TOPUP; confirm banner + deep-link       |
| PL/UK translation quality                 | I18N-02     | LLM-translated keys need human review                      | User self-reviews flagged keys in message catalogs                           |

_Automated layers (SW registration, idempotent replay, registry fire, namespace completeness, deep-link routing) are covered by component/integration/E2E tests; only the above three need a human._

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (idb, web-push, VAPID env, Page Objects)
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
