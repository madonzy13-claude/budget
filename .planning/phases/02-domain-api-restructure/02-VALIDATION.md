---
phase: 02
slug: domain-api-restructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-12
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| **Framework**          | bun:test (backend unit + integration) · Vitest 4 + happy-dom (frontend) · Playwright (E2E) |
| **Config file**        | `bunfig.toml` (coverage 80%), `playwright.config.ts`, `apps/web/vitest.config.ts`          |
| **Quick run command**  | `make test`                                                                                |
| **Full suite command** | `make test && make test-e2e && make ci-gate`                                               |
| **Estimated runtime**  | ~180 seconds (unit+integration), +~120s E2E, +~30s ci-gate                                 |

---

## Sampling Rate

- **After every task commit:** Run `make test` (scope to changed package if known via `bun test packages/<context>/`).
- **After every plan wave:** Run `make test && make ci-gate` (full backend + tenant-leak gate).
- **Before `/gsd-verify-work`:** Full suite must be green including `make test-e2e` for any UI-touching tasks.
- **Max feedback latency:** 180 seconds.

---

## Per-Task Verification Map

> Filled by gsd-planner during plan generation. Each task row binds Task ID → Requirement ID → Threat Ref → automated verify command. Planner emits rows; this skeleton documents the columns and conventions.

| Task ID  | Plan | Wave | Requirement      | Threat Ref                                            | Secure Behavior                                                                 | Test Type   | Automated Command                                                   | File Exists | Status     |
| -------- | ---- | ---- | ---------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------- | ----------- | ---------- |
| 02-01-01 | 01   | 0    | TXN-01..08       | —                                                     | RED tests fail (no impl yet)                                                    | wave-0 RED  | `bun test packages/budgeting/`                                      | ❌ W0       | ⬜ pending |
| 02-01-02 | 01   | 1    | TXN-01,TXN-02    | T-02-01 (FX boundary), T-02-02 (currency mismatch)    | tx create stores both original+converted; PATCH allows currency override        | integration | `bun test apps/api/test/routes/transactions.test.ts`                | ❌ W0       | ⬜ pending |
| 02-02-01 | 02   | 0    | RECR-01,02       | —                                                     | RED tests fail                                                                  | wave-0 RED  | `bun test packages/budgeting/test/recurring-engine.test.ts`         | ❌ W0       | ⬜ pending |
| 02-02-02 | 02   | 1    | RECR-01,02       | T-02-03 (double-materialize)                          | weekly rule due today produces exactly one pending-draft per run                | integration | `bun test apps/api/test/routes/recurring-rules.test.ts`             | ❌ W0       | ⬜ pending |
| 02-03-01 | 03   | 1    | RSCM-01,02       | T-02-04 (cushion-mode drift)                          | reserve view returns 0 for empty history; recomputes on category_limits change  | integration | `bun test packages/budgeting/test/reserve-view.test.ts`             | ❌ W0       | ⬜ pending |
| 02-04-01 | 04   | 1    | SHRD-01,02,03,05 | T-02-05 (token forgery), T-02-06 (revoked-link reuse) | share-link returns token URL with TTL; revoke nullifies; tenant-leak gate green | integration | `bun test apps/api/test/routes/share-links.test.ts && make ci-gate` | ❌ W0       | ⬜ pending |
| 02-05-01 | 05   | 1    | ENGR-01..04      | T-02-07 (boundary breach)                             | dep-cruiser blocks drizzle-orm/Hono/AI-SDK in domain; coverage ≥80%             | gate        | `bun run dep-check && bun test --coverage`                          | ❌ W0       | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

> Planner MAY split or add rows. Every Task ID emitted by the planner MUST appear here with an automated command OR a Wave 0 dependency.

---

## Wave 0 Requirements

- [ ] `apps/api/test/routes/transactions.test.ts` — RED tests for POST/PATCH transaction with FX + currency-override + removal of income/transfer routes
- [ ] `apps/api/test/routes/recurring-rules.test.ts` — RED tests for daily/weekly/monthly/yearly cadence + day-of-week / day-of-month selectors + materialization idempotency
- [ ] `packages/budgeting/test/recurring-engine.test.ts` — RED domain tests for cadence calculation + materializer
- [ ] `packages/budgeting/test/reserve-view.test.ts` — RED tests for per-category reserve balance + cushion-mode history (empty history → 0)
- [ ] `apps/api/test/routes/share-links.test.ts` — RED tests for create/revoke/accept share-link with Better Auth orgs plugin invite token + TTL
- [ ] `apps/api/test/routes/income-transfer-removed.test.ts` — RED tests asserting old POST /income, POST /transfer, /drafts/inbox return 404
- [ ] `.dependency-cruiser.cjs` rule extension — RED for any new domain → drizzle-orm/Hono import (if not already covered)
- [ ] `apps/api/test/fixtures/fx-provider.ts` — FX adapter test stub returning deterministic rate for fixed (currency, date) tuples

_All Wave 0 files MUST be created in a Wave 0 task before Wave 1 implementation begins._

---

## Manual-Only Verifications

| Behavior                         | Requirement | Why Manual                                                          | Test Instructions                                                                                                                        |
| -------------------------------- | ----------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Frankfurter live API health      | TXN-01,02   | External dependency — production-only sanity                        | Set FX_PROVIDER=frankfurter and call POST /budgets/{id}/transactions with USD→EUR on past date; verify rate within 0.5% of public source |
| pg-boss cron schedule wall-clock | RECR-01,02  | Job runs on real clock; CI cannot fast-forward without test harness | Set recurring rule with frequency=daily, wait until UTC midnight, verify exactly one pending-draft created                               |

_If `fx-provider` test stub fully covers boundary semantics, the Frankfurter manual check is informational only._

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
