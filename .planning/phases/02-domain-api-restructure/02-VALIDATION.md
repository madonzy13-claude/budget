---
phase: 02
slug: domain-api-restructure
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-12
updated: 2026-05-12
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

> Every task emitted by the planner appears here with an automated command OR a Wave 0 dependency. Updated per checker B4 to fix file paths and add coverage rows for 02-01 Task 3 and 02-04 Task 1.

| Task ID   | Plan | Wave | Requirement                                                                     | Threat Ref                                                                                    | Secure Behavior                                                                                               | Test Type   | Automated Command                                                                                                                                                                                                                                                                                                                           | File Exists | Status     |
| --------- | ---- | ---- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| 02-01-01  | 01   | 0    | TXN-01..08                                                                      | —                                                                                             | RED tests fail (no impl yet)                                                                                  | wave-0 RED  | `bun test apps/api/test/routes/transactions.test.ts`                                                                                                                                                                                                                                                                                        | ❌ W0       | ⬜ pending |
| 02-01-02a | 01   | 1    | TXN-01,TXN-02,TXN-07,TXN-08,RECR-01,RECR-02,RSCM-01,RSCM-02,SHRD-01..03,SHRD-05 | T-02-09 (column-level GRANT), T-02-04 (cushion drift), T-02-05 (token entropy)                | Consolidated migration 0013 + post-migration.sql lockstep for ALL Phase 2 DB-shape changes                    | integration | `grep -q "CREATE TABLE IF NOT EXISTS tenancy.budget_share_links" drizzle/0013_phase02_domain_restructure.sql && grep -q "CREATE OR REPLACE VIEW budgeting.category_reserve_balance" drizzle/0013_phase02_domain_restructure.sql && grep -q "GRANT UPDATE (note, date, category_id, amount_original_cents" apps/migrator/post-migration.sql` | ❌ W0       | ⬜ pending |
| 02-01-02b | 01   | 1    | TXN-01,TXN-02,TXN-07,TXN-08                                                     | T-02-01 (FX boundary), T-02-02 (currency mismatch)                                            | Domain entity + port + adapter rewritten; balance-adjustments schema deleted; transaction-domain tests green  | integration | `bun test packages/budgeting/test/transaction-domain.test.ts`                                                                                                                                                                                                                                                                               | ❌ W0       | ⬜ pending |
| 02-01-03  | 01   | 2    | TXN-03,TXN-04,TXN-05,TXN-06,TXN-08                                              | T-02-01, T-02-02                                                                              | Six-route transactions resource + recurring-drafts.ts route file DELETED (sole owner per B5)                  | integration | `bun test apps/api/test/routes/transactions.test.ts apps/api/test/routes/income-transfer-removed.test.ts && test ! -f apps/api/src/routes/recurring-drafts.ts`                                                                                                                                                                              | ❌ W0       | ⬜ pending |
| 02-02-01  | 02   | 0    | RECR-01,02                                                                      | —                                                                                             | RED tests fail                                                                                                | wave-0 RED  | `bun test packages/budgeting/test/domain/cadence.test.ts packages/budgeting/test/recurring-engine-catchup.test.ts apps/api/test/routes/recurring-rules.test.ts`                                                                                                                                                                             | ❌ W0       | ⬜ pending |
| 02-02-02a | 02   | 1    | RECR-01                                                                         | T-02-CADENCE-INJECTION                                                                        | Cadence domain extended to DAILY/YEARLY; schema TS mirrors 02-01 migration; recurring_drafts TS files deleted | integration | `bun test packages/budgeting/test/domain/cadence.test.ts && test ! -f packages/budgeting/src/adapters/persistence/recurring-drafts-schema.ts`                                                                                                                                                                                               | ❌ W0       | ⬜ pending |
| 02-02-02b | 02   | 1    | RECR-02                                                                         | T-02-03 (double-materialize)                                                                  | Worker catch-up loop inserts to expense_ledger with ON CONFLICT idempotency; route Zod discriminated union    | integration | `bun test packages/budgeting/test/recurring-engine-catchup.test.ts apps/api/test/routes/recurring-rules.test.ts`                                                                                                                                                                                                                            | ❌ W0       | ⬜ pending |
| 02-03-01  | 03   | 0    | RSCM-01,02                                                                      | —                                                                                             | RED scenarios fail (no repo)                                                                                  | wave-0 RED  | `bun test packages/budgeting/test/reserve-balance-repo.test.ts`                                                                                                                                                                                                                                                                             | ❌ W0       | ⬜ pending |
| 02-03-02  | 03   | 1    | RSCM-01,02                                                                      | T-02-04 (cushion-mode drift), T-02-RESERVE-OVERFLOW                                           | reserve view returns 0 for empty history; 5 D-PH2-11 scenarios green; GET /reserves route                     | integration | `bun test packages/budgeting/test/reserve-balance-repo.test.ts apps/api/test/routes/reserves.test.ts`                                                                                                                                                                                                                                       | ❌ W0       | ⬜ pending |
| 02-04-01  | 04   | 0    | SHRD-01,02,03,05                                                                | —                                                                                             | RED tests fail (no routes)                                                                                    | wave-0 RED  | `bun test apps/api/test/routes/share-links.test.ts`                                                                                                                                                                                                                                                                                         | ❌ W0       | ⬜ pending |
| 02-04-02  | 04   | 1    | SHRD-01,02,03,05                                                                | T-02-05 (token forgery), T-02-06 (revoked-link reuse), T-02-08 (cross-tenant), T-02-NON-OWNER | share-link returns token URL with TTL; revoke nullifies; tenant-leak gate green                               | integration | `bun test apps/api/test/routes/share-links.test.ts && make ci-gate`                                                                                                                                                                                                                                                                         | ❌ W0       | ⬜ pending |
| 02-05-01  | 05   | 0    | ENGR-01..04                                                                     | —                                                                                             | RED audit tests fail (migration not yet applied)                                                              | wave-0 RED  | `bun test apps/api/test/schema/v11-shape.test.ts apps/api/test/routes/route-coverage-audit.test.ts apps/api/test/architecture/dep-cruiser-domain-isolation.test.ts`                                                                                                                                                                         | ❌ W0       | ⬜ pending |
| 02-05-02  | 05   | 1    | ENGR-01..04                                                                     | T-02-07 (boundary breach), T-02-SILENT-DB-DRIFT, T-02-ORPHAN-ROUTE, T-02-COVERAGE-REGRESSION  | dep-cruiser blocks drizzle-orm/Hono/AI-SDK in domain; coverage ≥80%; db:push 0 drift; ci-gate 7/7             | gate        | `bun run db:push && bun test --coverage && make ci-gate && bun test apps/api/test/schema/v11-shape.test.ts`                                                                                                                                                                                                                                 | ❌ W0       | ⬜ pending |
| 02-05-03  | 05   | 1    | ENGR-01..04                                                                     | —                                                                                             | Human checkpoint — confirm all gates green                                                                    | checkpoint  | manual                                                                                                                                                                                                                                                                                                                                      | N/A         | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

> Planner MAY split or add rows. Every Task ID emitted by the planner MUST appear here with an automated command OR a Wave 0 dependency.

---

## Wave 0 Requirements

- [ ] `apps/api/test/routes/transactions.test.ts` — RED tests for POST/PATCH transaction with FX + currency-override (02-01 Task 1)
- [ ] `apps/api/test/routes/income-transfer-removed.test.ts` — RED tests asserting old POST /income, POST /transfer, /history, /correct, /recurring-drafts return 404 (02-01 Task 1)
- [ ] `packages/budgeting/test/transaction-domain.test.ts` — RED domain tests for Transaction entity v1.1 shape (02-01 Task 1)
- [ ] `apps/api/test/fixtures/fx-provider.ts` — FX adapter test stub returning deterministic rate for fixed (currency, date) tuples (02-01 Task 1)
- [ ] `packages/budgeting/test/domain/cadence.test.ts` — RED tests for DAILY + YEARLY + leap-clamp (02-02 Task 1)
- [ ] `packages/budgeting/test/recurring-engine-catchup.test.ts` — RED tests for 3-week catchup + idempotency + DAILY + YEARLY (02-02 Task 1)
- [ ] `apps/api/test/routes/recurring-rules.test.ts` — RED tests for DAILY/YEARLY Zod validation (02-02 Task 1)
- [ ] `packages/budgeting/test/reserve-balance-repo.test.ts` — RED tests for per-category reserve balance + cushion-mode history (5 D-PH2-11 scenarios) (02-03 Task 1)
- [ ] `apps/api/test/routes/share-links.test.ts` — RED tests for create/revoke/accept share-link with Better Auth orgs plugin token + TTL + cross-tenant probe (02-04 Task 1)
- [ ] `apps/api/test/schema/v11-shape.test.ts` (extended) — RED Phase 2 column/table/view assertions (02-05 Task 1)
- [ ] `apps/api/test/routes/route-coverage-audit.test.ts` — orphan-route sentinel (02-05 Task 1)
- [ ] `apps/api/test/architecture/dep-cruiser-domain-isolation.test.ts` — dep-cruiser sentinel (02-05 Task 1)

_All Wave 0 files MUST be created in their respective Wave 0 task before Wave 1 implementation begins._

---

## Manual-Only Verifications

| Behavior                         | Requirement | Why Manual                                                          | Test Instructions                                                                                                                        |
| -------------------------------- | ----------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Frankfurter live API health      | TXN-01,02   | External dependency — production-only sanity                        | Set FX_PROVIDER=frankfurter and call POST /budgets/{id}/transactions with USD→EUR on past date; verify rate within 0.5% of public source |
| pg-boss cron schedule wall-clock | RECR-01,02  | Job runs on real clock; CI cannot fast-forward without test harness | Set recurring rule with frequency=daily, wait until UTC midnight, verify exactly one pending-draft created                               |

_If `fx-provider` test stub fully covers boundary semantics, the Frankfurter manual check is informational only._

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (B4 fix: paths corrected, rows added for 02-01 Task 3 and 02-04 Task 1)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (revision 1)
