---
phase: 6
slug: settings-onboarding-share-ui
status: draft
nyquist_compliant: false
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

| Task ID                                    | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status     |
| ------------------------------------------ | ---- | ---- | ----------- | ---------- | --------------- | --------- | ----------------- | ----------- | ---------- |
| _Filled by planner from PLAN.md task list_ |      |      |             |            |                 |           |                   |             | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- _Filled by planner — stub test files for net-new endpoints + `onboarding_progress` table._

_If none: "Existing infrastructure covers all phase requirements."_

---

## Manual-Only Verifications

| Behavior            | Requirement | Why Manual | Test Instructions |
| ------------------- | ----------- | ---------- | ----------------- |
| _Filled by planner_ |             |            |                   |

_If none: "All phase behaviors have automated verification."_

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
