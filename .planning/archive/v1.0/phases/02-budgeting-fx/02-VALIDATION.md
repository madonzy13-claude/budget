---
phase: 2
slug: budgeting-fx
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-09
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `02-RESEARCH.md` § Validation Architecture and Phase 1 testing patterns.

---

## Test Infrastructure

| Property                    | Value                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| **Framework (backend)**     | bun:test (unit + integration); testcontainers postgres:17-alpine                                    |
| **Framework (frontend)**    | Vitest 4 + RTL + happy-dom                                                                          |
| **Framework (E2E)**         | Playwright + playwright-bdd (`.feature` files + Page Objects)                                       |
| **Config files**            | `bunfig.toml` (80% domain threshold); `apps/web/vitest.config.ts`; `tests/e2e/playwright.config.ts` |
| **Quick run command**       | `make test` (bun:test only — backend unit + integration)                                            |
| **Full suite command**      | `make test && cd apps/web && bun run test && make test-e2e`                                         |
| **Estimated quick runtime** | ~25 s (single package focus)                                                                        |
| **Estimated full runtime**  | ~6 min (incl. E2E)                                                                                  |

---

## Sampling Rate

- **After every task commit:** `bun test packages/budgeting/test/<focused-spec>.test.ts` (≤ 5 s) — keeps the just-edited surface honest.
- **After every plan wave:** `make test` — full backend unit + integration; verifies cross-task contracts (idempotency replay, ledger immutability, FX stale fallback).
- **After waves touching `apps/web/`:** `cd apps/web && bun run test` — Vitest component tests.
- **After waves touching transactions / accounts / categories UI:** `make test-e2e -- --grep '@phase2'` — Gherkin scenarios tagged for this phase.
- **Before `/gsd-verify-work`:** Full suite must be green (backend + Vitest + Playwright).
- **Max feedback latency:** 30 s for quick run; 6 min for full suite.

---

## Per-Task Verification Map

> Skeleton — actual `Task ID` cells are filled by `gsd-planner` (each plan task receives `<automated>` cell). Format below shows expected coverage per requirement. Plan-checker enforces no 3 consecutive tasks without `<automated>`.

| Req ID           | Behavior under test                                                                                                                                                                 | Test Type                        | File / Suite                                                                                              | Threat Ref                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------- |
| ACCT-01..04      | Account CRUD, archive, dual-currency display, balance adjust audit                                                                                                                  | integration + Vitest             | `packages/budgeting/test/accounts/*`; `apps/web/test/components/accounts/*`                               | T-2-cross-tenant-leak     |
| BDGT-01..03      | Category CRUD, one-level grouping, archive                                                                                                                                          | integration                      | `packages/budgeting/test/categories/*`                                                                    | —                         |
| BDGT-04..06      | Effective-dated limits — point-in-time lookup, mid-month edit applies forward only, past-month immutable                                                                            | integration + property           | `packages/budgeting/test/category-limits/effective-dated.test.ts`                                         | —                         |
| BDGT-07          | Budget template apply on new month copies current effective limits                                                                                                                  | integration                      | `packages/budgeting/test/budget-templates/*`                                                              | —                         |
| BDGT-08          | Contribution shares — per-category overrides, sum-to-100 enforced at commit, member join/leave blocks workspace                                                                     | integration + DB constraint test | `packages/budgeting/test/shares/*`; `packages/budgeting/test/db-constraints/*`                            | T-2-sum-100-bypass        |
| MONY-03..06      | Money value object boundary, FX rate stored on ledger row, fx_rate_stale fallback                                                                                                   | unit + integration               | `packages/shared-kernel/test/money/*`; `packages/budgeting/test/ledger/fx.test.ts`                        | T-2-currency-confusion    |
| EXPN-01..03      | Capture expense/income/transfer in any currency on any date; ledger row stores `(amount_orig, currency_orig, amount_default, currency_default, fx_rate, fx_rate_date, fx_provider)` | integration + E2E                | `packages/budgeting/test/transactions/capture.test.ts`; `tests/e2e/features/transactions/capture.feature` | T-2-negative-amount       |
| EXPN-06, EXPN-08 | Edit-via-correction-row, original immutable at SQL level                                                                                                                            | DB integration + property        | `packages/budgeting/test/ledger/correction-immutability.test.ts`                                          | T-2-correction-tamper     |
| EXPN-09          | Recurring engine — pending-by-default; confirm/edit-confirm/skip semantics                                                                                                          | integration + E2E                | `packages/budgeting/test/recurring/*`; `tests/e2e/features/recurring/*.feature`                           | T-2-worker-tenant-context |
| EXPN-10          | Search/filter/FTS, indexed equality filters, cursor pagination                                                                                                                      | integration                      | `packages/budgeting/test/search/*`                                                                        | —                         |
| EXPN-11          | Bulk re-categorize via correction-rows, audit history preserved                                                                                                                     | integration                      | `packages/budgeting/test/transactions/bulk.test.ts`                                                       | T-2-audit-skip            |
| EXPN-12          | Transfer two-leg with same `transfer_group_id`, FX per leg                                                                                                                          | integration                      | `packages/budgeting/test/transactions/transfer.test.ts`                                                   | T-2-currency-confusion    |
| EXPN-13          | Deposit FX-preview, default-currency change preview                                                                                                                                 | integration + Vitest             | `packages/budgeting/test/shares/deposit-preview.test.ts`; component test                                  | —                         |
| ENGR-09          | `Idempotency-Key` middleware: 24h TTL, body-hash mismatch → 422, replay returns cached `(status,body)`                                                                              | integration                      | `apps/api/test/middleware/idempotency.test.ts`                                                            | T-2-replay-attack         |
| ENGR-14          | Projections updated in same tx as ledger writes; reconciliation cron + replay-from-ledger CLI rebuild correctly                                                                     | integration                      | `packages/budgeting/test/projections/*`; `apps/worker/test/jobs/budgeting-reconciliation.test.ts`         | —                         |

---

## Wave 0 Requirements (Foundations Plan 00)

- [ ] `packages/budgeting/test/conftest.test.ts` — shared fixtures: tenant + user fixtures, `withTenantTx` test helper, FX-rate fixture seeder, time-freeze helper.
- [ ] `packages/budgeting/test/db-constraints/` — directory + first failing test asserting RLS active and REVOKE UPDATE/DELETE on `expense_ledger`.
- [ ] `packages/budgeting/package.json` — bun:test wired; `vitest`/`@vitest/ui` reserved if frontend tests live elsewhere.
- [ ] `temporal-polyfill` installed (currently missing per RESEARCH.md § Environment Availability).
- [ ] `tests/e2e/features/transactions/`, `tests/e2e/features/recurring/`, `tests/e2e/features/budgets/` — directory skeletons + tag `@phase2` on every feature.
- [ ] `apps/api/test/middleware/idempotency.test.ts` — failing skeleton (red) for ENGR-09 covering: cache hit replay, body-hash mismatch → 422, TTL expiry, scope = `(tenant_id, user_id, route, key)`.

---

## Manual-Only Verifications

| Behavior                                                                                     | Requirement | Why Manual                                                                                                                                     | Test Instructions                                                                                                                              |
| -------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| FX freshness badge readability under different locales (en/pl/uk)                            | D-03        | next-intl relative-time output is locale-bound; visual readability requires human review                                                       | Open `/transactions` in each locale; verify badge string is non-empty, accurate, and visually consistent in dark theme                         |
| PWA offline-then-reconnect retry actually replays the same `Idempotency-Key` from disk queue | ENGR-09     | Service-worker queue behavior is hard to assert deterministically in CI; Playwright can simulate, but real-device confirmation closes the loop | DevTools → Application → Service Workers → Offline. Submit transaction. Reconnect. Verify single ledger row + matching `Idempotency-Key` in DB |
| Budget template apply UX correctness ("apply this template to May 2026")                     | BDGT-07     | Affordance + confirmation copy needs human eye; integration test only verifies the resulting rows                                              | E2E covers happy path; manual review the dialog, "warn-overwrite" edge case                                                                    |

_All other phase behaviors have automated verification._

---

## Property-Based Invariants (selective)

| Invariant                                                                                                                                                   | Surface                                                                  | Tooling                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| For any FX-stale ledger row R, `R.fx_rate_date <= R.transaction_date` AND `R.fx_rate_stale=true ⇔ R.fx_rate_date < R.transaction_date`                      | `packages/budgeting/test/ledger/fx.property.test.ts`                     | bun:test + `fast-check`                                                   |
| Sum of `category_share_overrides.percent` per workspace = 100 at every commit                                                                               | `packages/budgeting/test/shares/sum-100.property.test.ts`                | DEFERRABLE constraint trigger; property test triggers via random reorders |
| For every `corrects_id` chain there is exactly one tail (no row is corrected twice)                                                                         | `packages/budgeting/test/ledger/correction-chain.property.test.ts`       | fast-check + DB constraint                                                |
| Effective-dated limit lookup: for any `(category_id, date D)`, exactly one row matches `effective_from <= D AND (effective_to IS NULL OR effective_to > D)` | `packages/budgeting/test/category-limits/point-in-time.property.test.ts` | partial-unique-on-open-row index + property test                          |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30 s (quick run)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
