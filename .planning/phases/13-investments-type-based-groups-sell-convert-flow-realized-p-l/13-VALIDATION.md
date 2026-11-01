---
phase: 13
slug: investments-type-based-groups-sell-convert-flow-realized-p-l
status: validated
nyquist_compliant: true
wave_0_complete: true
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

| Decision      | Plan     | Behavior                                                                      | Test Type                                              | Automated Command                                                                                                                                                                          | File Exists | Status     |
| ------------- | -------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ---------- |
| D-02/03       | 13-01    | amount split 96k/55k keep 30k, recv 66k → cost 17,187.50, realized +28,187.50 | unit (tdd)                                             | `bun test packages/investments/test/domain/sell-booking.test.ts`                                                                                                                           | ✅          | ✅ green   |
| D-02          | 13-01    | BTC 0.4@25k now 60k sell 0.1 for 6k → qty 0.3, realized +3.5k                 | unit (tdd)                                             | same                                                                                                                                                                                       | ✅          | ✅ green   |
| D-03          | 13-01    | withdraw-via-edit 96k→80k: cost 45,833.33, realized 6,833.33                  | unit (tdd)                                             | same                                                                                                                                                                                       | ✅          | ✅ green   |
| D-20          | 13-01    | deposit 10,000→10,500, take 4,000 → principal = cost 6,500, realized +500     | unit (tdd)                                             | same                                                                                                                                                                                       | ✅          | ✅ green   |
| D-06          | 13-01    | reverseEntry: own-delta undo, later changes survive, re-enter no double count | unit (tdd)                                             | same                                                                                                                                                                                       | ✅          | ✅ green   |
| D-19/D-08     | 13-02    | contributions at date w/ per-date FX; convert legs flow 0; missing FX → null  | unit (tdd)                                             | `bun test packages/investments/test/domain/contributions.test.ts`                                                                                                                          | ✅          | ✅ green   |
| D-08          | 13-02    | hybrid Overview: pre-boundary snapshot cost, post history, null-rate fallback | unit                                                   | `bun test packages/budgeting/test/overview/get-overview-wealth.test.ts`                                                                                                                    | ✅ extended | ✅ green   |
| D-09/10/11    | 13-03    | mig 0087: Start rows == eligible holdings; ui_type remap; CHECK; new columns  | integration (real PG)                                  | `infisical run --env=dev -- bun test apps/api/test/schema/investment-history-0087.test.ts`                                                                                                 | ✅          | ✅ green   |
| tenant        | 13-03    | history rows invisible cross-tenant                                           | integration                                            | `infisical run --env=dev -- bun test tests/tenant-leak/investment-history-cross-tenant.test.ts` (+ `make ci-gate`)                                                                         | ✅          | ✅ green   |
| Demo          | 13-03    | manifest classifies new table + columns                                       | bun:test                                               | `bun test packages/platform/test/demo-preflight.test.ts`                                                                                                                                   | ✅ extended | ✅ green   |
| D-13..16      | 13-04    | type blocks, header math 51k/95k, hidden realized in total                    | Vitest                                                 | `cd apps/web && bunx vitest run test/investments/investment-type-groups.test.ts test/investments/investment-type-header.test.tsx`                                                          | ✅          | ✅ green   |
| D-10/11       | 13-05/06 | stocks schema + legacy normalization; stocks search                           | unit + integration                                     | `bun test packages/investments/test/contracts` · `infisical run --env=dev -- bun test packages/investments/test/adapters/instrument-repo.test.ts apps/api/test/routes/investments.test.ts` | ✅          | ✅ green   |
| D-18/D-20     | 13-07    | realized frozen at sale-date FX; deposit partial booking                      | use-case                                               | `bun test packages/investments/test/application/sell-holding.test.ts`                                                                                                                      | ✅          | ✅ green   |
| D-01/04       | 13-07    | sell routes new/existing/out; atomic tx; transfer_id pair                     | integration                                            | `infisical run --env=dev -- bun test apps/api/test/routes/investments-history.test.ts`                                                                                                     | ✅          | ✅ green   |
| D-06          | 13-08    | delete = full undo (both legs, qty/cost back), PATCH use_adjust guard         | unit + integration                                     | `bun test packages/investments/test/application/reverse-history-entry.test.ts packages/investments/test/application/adjust-holding.test.ts` · investments-history.test.ts                  | ✅          | ✅ green   |
| D-12          | 13-10    | cross-type drop no-op, block order persists                                   | Vitest                                                 | `cd apps/web && bunx vitest run test/investments/investments-section-dnd.test.tsx`                                                                                                         | ✅          | ✅ green   |
| D-05/15/17/20 | 13-11/13 | Sell sheet steps, History section, What happened                              | Vitest                                                 | `cd apps/web && bunx vitest run test/investments/sell-sheet.test.tsx test/investments/history-section.test.tsx test/investments/holding-sheet.test.tsx`                                    | ✅          | ✅ green   |
| All           | 13-14    | every sell/edit/history path incl. undo + re-enter, deposit partial           | E2E Gherkin `@investments-sell` `@investments-history` | `cd apps/web && PLAYWRIGHT_BASE_URL=https://budget-dev.madonzy.com bunx playwright test --grep "@investments-sell\|@investments-history"`                                                  | ✅          | ✅ green   |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [x] `packages/investments/test/domain/{sell-booking,contributions}.test.ts` + `apps/web/test/investments/investment-type-groups.test.ts`
- [x] `apps/api/test/routes/investments-history.test.ts` + `apps/api/test/schema/investment-history-0087.test.ts`
- [x] `apps/web/e2e/features/{investments-sell,investments-history}.feature` + `InvestmentsHistoryPo.ts` + steps (extend `InvestmentsPo.ts`)
- [x] Replace custom-group tests (`investment-grouping.test.ts`, `investment-group-header.test.tsx`, group steps in `investments.steps.ts`)
- [x] Smoke `make test` (Docker + Infisical up) before Wave 1

---

## Manual-Only Verifications

| Behavior                                                                                             | Requirement | Why Manual            | Test Instructions                                                         |
| ---------------------------------------------------------------------------------------------------- | ----------- | --------------------- | ------------------------------------------------------------------------- |
| Real-data backfill (BOSSA IKE, Exante, IB, Erste, "Tato …" deposits; 24 Oct broker→Erste conversion) | D-09        | user supplies history | user enters entries; confirm ~182k realized restored + contributions back |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** automated gates green 2026-10-26 (human real-data acceptance pending, 13-14 Task 4)

## Gate run (2026-10-26, rebuilt stack, budget-dev)

| Gate | Command | Result |
| ---- | ------- | ------ |
| Lint | `bun run lint` | ✅ exit 0 |
| Typecheck | `bun run typecheck` (all workspaces) | ✅ exit 0 |
| Audit | `bun audit --audit-level=high` | ✅ exit 0 |
| Phase suites (real PG) | `infisical run -- bun test packages/investments apps/api/test/routes/investments*.test.ts apps/api/test/schema/investment-history-0087.test.ts tests/tenant-leak/investment-history-cross-tenant.test.ts packages/platform/test/demo-preflight.test.ts` | ✅ 254 pass / 0 fail |
| Overview + investments (no DB env) | `bun test packages/investments packages/budgeting/test/overview` | 361 pass / 4 fail — 3 `getOverviewPlanned` (pre-existing, date-dependent, see deferred-items.md) + instrument-repo needs DB env (green with it) |
| Web | `cd apps/web && bunx vitest run` | ✅ 2686 pass / 0 fail |
| Tenant leak | `make ci-gate` | ✅ 76 pass / 0 fail (exit 1 = known coverage-threshold artifact); stack restarted after |
| make test | `make test` | 1998 pass / 6 fail (baseline ~292): 3 planned (pre-existing), demoGuard `/auth/change-password` + push-suppression demo (fail identically at pre-phase commit 4cc772d7), 1 unnamed 23505 unique-key seed collision while E2E ran concurrently (demo-copy passes in isolation) |
| E2E (phase tags) | `PLAYWRIGHT_BASE_URL=https://budget-dev.madonzy.com bunx playwright test --grep "@investments-history\|@investments-wallet\|@investments-sell"` | ✅ 62 pass / 0 fail (chromium + mobile; incl. EN/PL/UK phone layout) |
| Full E2E | `PLAYWRIGHT_BASE_URL=https://budget-dev.madonzy.com make test-e2e` | 435 passed / 45 flaky / 1 failed (1.0h, run concurrently with `make test`); the 1 failure passed on `--last-failed` rerun → load flake, not a phase regression |

