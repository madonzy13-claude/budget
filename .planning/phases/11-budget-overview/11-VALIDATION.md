---
phase: 11
slug: budget-overview
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-28
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| **Framework**          | bun:test (backend) · Vitest 4 + happy-dom + RTL (apps/web) · Playwright-BDD (E2E)          |
| **Config file**        | `bunfig.toml` (80% domain) · `apps/web/vitest.config.ts` · `apps/web/playwright.config.ts` |
| **Quick run command**  | `make test` (changed pkg) / `cd apps/web && bun run test` (FE)                             |
| **Full suite command** | `make test && make ci-gate && make test-e2e`                                               |
| **Estimated runtime**  | ~90s unit/integration · ~120s ci-gate · E2E variable                                       |

---

## Sampling Rate

- **After every task commit:** Run the changed package's `make test` (or `cd apps/web && bun run test` for FE).
- **After every plan wave:** Run `make test` + `make ci-gate` (tenant-leak must include the new RLS table).
- **Before `/gsd-verify-work`:** `make test && make ci-gate && make test-e2e` all green.
- **Max feedback latency:** ~90 seconds.

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement               | Threat Ref | Secure Behavior                       | Test Type              | Automated Command              | File Exists | Status     |
| -------- | ---- | ---- | ------------------------- | ---------- | ------------------------------------- | ---------------------- | ------------------------------ | ----------- | ---------- |
| 11-01-\* | 01   | 1    | SC8 / D-04                | T-11-01    | new table tenant-isolated (RLS+FORCE) | migration+ci-gate      | `make migrate && make ci-gate` | ❌ W0       | ⬜ pending |
| 11-02-\* | 02   | 1    | SC9 / D-19                | —          | N/A                                   | component              | `cd apps/web && bun run test`  | ❌ W0       | ⬜ pending |
| 11-03-\* | 03   | 1    | SC2 / D-07,08,09,11       | T-11-05    | default_ccy, membership+RLS           | tdd unit + integration | `make test`                    | ✅          | ⬜ pending |
| 11-04-\* | 04   | 1    | SC4 / D-12,13,14,20       | T-11-03,04 | range Zod-validated                   | tdd unit + integration | `make test`                    | ✅          | ⬜ pending |
| 11-05-\* | 05   | 1    | SC5,SC6 / D-06,10         | T-11-04    | archived-in-history correct           | tdd unit + integration | `make test`                    | ✅          | ⬜ pending |
| 11-06-\* | 06   | 2    | SC7 / D-04,15,16,17,18,20 | T-11-03    | live-point + bucket math              | tdd unit + integration | `make test`                    | ✅          | ⬜ pending |
| 11-07-\* | 07   | 2    | SC8 / D-04                | T-11-02    | per-budget GUC, idempotent            | integration            | `make test`                    | ✅          | ⬜ pending |
| 11-08-\* | 08   | 2    | SC1,SC2                   | T-11-05    | no h-scroll 375px                     | component + E2E        | `cd apps/web && bun run test`  | ✅          | ⬜ pending |
| 11-09-\* | 09   | 3    | SC3,SC4,SC5,SC7           | —          | N/A                                   | component + E2E        | `cd apps/web && bun run test`  | ✅          | ⬜ pending |
| 11-10-\* | 10   | 4    | SC9                       | —          | N/A                                   | i18n + E2E             | `make test-e2e`                | ❌ W0       | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `recharts@3.9.0` added to `apps/web/package.json` (11-02 first task — no chart wrapper compiles without it).
- [ ] `budgeting.budget_wealth_snapshots` table applied to live dev DB (11-01 [BLOCKING] migrate — wealth series/cron untestable without it).
- [ ] `apps/web/e2e/features/overview.feature` + step/page-object scaffold (11-08 stubs golden scenario; 11-10 completes suite).
- [ ] `packages/budgeting/test/overview/` + `apps/api/test/routes/overview-*.test.ts` test files (created in RED phase of 11-03..06).

_Otherwise existing bun:test / Vitest / Playwright-BDD infrastructure covers all phase requirements._

---

## Manual-Only Verifications

| Behavior                           | Requirement | Why Manual                                              | Test Instructions                                                                                                     |
| ---------------------------------- | ----------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 3h cron actually fires on schedule | SC8         | wall-clock cron; E2E can't wait 3h                      | Invoke the handler directly in an integration test (covered); confirm `boss.schedule` registered via worker boot log. |
| Pie hover (desktop) reveal         | SC7/D-18    | hover is pointer-device; mobile tap path is E2E-covered | Manual desktop hover check in `/gsd-verify-work`; tap path automated.                                                 |

_All other phase behaviors have automated verification._

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (recharts, snapshot table, E2E feature)
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
