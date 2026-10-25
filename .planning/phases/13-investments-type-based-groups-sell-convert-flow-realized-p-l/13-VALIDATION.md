---
phase: 13
slug: investments-type-based-groups-sell-convert-flow-realized-p-l
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-25
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                            |
| ---------------------- | -------------------------------------------------------------------------------- |
| **Framework**          | bun:test (backend) · Vitest 4 + happy-dom (web) · Playwright-bdd (E2E)           |
| **Config file**        | `bunfig.toml` · `apps/web/vitest.config.ts` · `apps/web/playwright.config.ts`    |
| **Quick run command**  | `bun test packages/investments/test/domain`                                      |
| **Full suite command** | `make test && (cd apps/web && bunx vitest run) && make test-e2e && make ci-gate` |
| **Estimated runtime**  | quick <5s · full ~15–25 min                                                      |

---

## Sampling Rate

- **After every task commit:** quick domain test + touched Vitest file (`cd apps/web && bunx vitest run <file>`)
- **After every plan wave:** `make test` + `cd apps/web && bunx vitest run`
- **Before `/gsd:verify-work`:** full suite green + `make ci-gate` + Playwright live drive (phone viewport, EN/PL/UK) against https://budget-dev.madonzy.com after rebuild
- **Max feedback latency:** 5s (domain), 120s (integration)

---

## Per-Task Verification Map

Filled by planner per task. Decision → test seed (from 13-RESEARCH.md §Validation Architecture):

| Decision   | Behavior                                                                           | Test Type                          | Automated Command                                                            | File Exists | Status     |
| ---------- | ---------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- | ----------- | ---------- |
| D-02/03    | amount split: 96k/55k keep 30k, recv 66k → cost 17,187.50, realized +28,187.50     | unit (tdd)                         | `bun test packages/investments/test/domain/sell-booking.test.ts`             | ❌ W0       | ⬜ pending |
| D-02       | BTC 0.4@25k now 60k sell 0.1 for 6k → qty 0.3, realized +3.5k, row +140%           | unit (tdd)                         | same                                                                         | ❌ W0       | ⬜ pending |
| D-03       | withdraw-via-edit 96k→80k: cost 45,833.33, realized 6,833.33, flow −16k, +75% kept | unit (tdd)                         | same                                                                         | ❌ W0       | ⬜ pending |
| D-16       | type-group % on lifetime cost (51k/95k fixture)                                    | unit (tdd)                         | `bun test packages/investments/test/domain/type-group.test.ts`               | ❌ W0       | ⬜ pending |
| D-14/15    | hidden empty type's realized counts in portfolio total                             | unit                               | same                                                                         | ❌ W0       | ⬜ pending |
| D-19/D-08  | contributions at date w/ per-date FX; convert legs flow 0                          | unit (tdd)                         | `bun test packages/investments/test/domain/contributions.test.ts`            | ❌ W0       | ⬜ pending |
| D-08       | hybrid Overview: pre-boundary snapshot cost, post history                          | unit                               | `bun test packages/budgeting/test/application/get-overview-wealth*.test.ts`  | extend      | ⬜ pending |
| D-18       | realized frozen at sale-date FX                                                    | use-case                           | `bun test packages/investments/test/application/sell-holding.test.ts`        | ❌ W0       | ⬜ pending |
| D-09/10/11 | mig 0087: Start rows == non-archived holdings; ui_type remap; CHECK                | integration (real PG)              | `infisical run -- bun test apps/api/test/migrations/`                        | ❌ W0       | ⬜ pending |
| D-01/04    | sell routes new/existing/out; atomic tx; transfer_id pair                          | integration                        | `infisical run -- bun test apps/api/test/routes/investments-history.test.ts` | ❌ W0       | ⬜ pending |
| D-06       | delete history entry (both legs)                                                   | integration                        | same                                                                         | ❌ W0       | ⬜ pending |
| tenant     | history rows invisible cross-tenant                                                | integration                        | `make ci-gate`                                                               | extend      | ⬜ pending |
| D-10/12/13 | type grouping, order, header, no cross-type drop                                   | Vitest                             | `cd apps/web && bunx vitest run test/investments`                            | rewrite     | ⬜ pending |
| D-05/15    | History section, header sub-line, Sell sheet steps                                 | Vitest                             | same                                                                         | ❌ W0       | ⬜ pending |
| All        | golden path sell/convert/withdraw/delete                                           | E2E Gherkin `@investments-history` | `make test-e2e`                                                              | ❌ W0       | ⬜ pending |
| Demo       | manifest classifies new table                                                      | bun:test                           | `bun test packages/platform/test/demo-preflight.test.ts`                     | extend      | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `packages/investments/test/domain/{sell-booking,contributions,type-group}.test.ts`
- [ ] `apps/api/test/routes/investments-history.test.ts` + migration 0087 test
- [ ] `apps/web/e2e/features/investments-history.feature` + `InvestmentsHistoryPo.ts` + steps (extend `InvestmentsPo.ts`)
- [ ] Replace custom-group tests (`investment-grouping.test.ts`, `investment-group-header.test.tsx`, group steps in `investments.steps.ts`)
- [ ] Smoke `make test` (Docker + Infisical up) before Wave 1

---

## Manual-Only Verifications

| Behavior                                                                                             | Requirement | Why Manual            | Test Instructions                                                         |
| ---------------------------------------------------------------------------------------------------- | ----------- | --------------------- | ------------------------------------------------------------------------- |
| Real-data backfill (BOSSA IKE, Exante, IB, Erste, "Tato …" deposits; 24 Oct broker→Erste conversion) | D-09        | user supplies history | user enters entries; confirm ~182k realized restored + contributions back |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
