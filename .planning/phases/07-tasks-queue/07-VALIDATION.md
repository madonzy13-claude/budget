---
phase: 07
slug: tasks-queue
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-30
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `07-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property                 | Value                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| **Framework (backend)**  | bun:test                                                                                                 |
| **Framework (frontend)** | Vitest 4 + happy-dom                                                                                     |
| **Framework (E2E)**      | Playwright + playwright-bdd (Gherkin)                                                                    |
| **Config file**          | `bunfig.toml` (backend) · `apps/web/vitest.config.ts` (frontend) · `apps/web/playwright.config.ts` (E2E) |
| **Quick run command**    | `make test` (backend unit + integration)                                                                 |
| **Frontend quick run**   | `cd apps/web && bun run test`                                                                            |
| **Full suite command**   | `make test && cd apps/web && bun run test && make test-e2e`                                              |
| **Estimated runtime**    | backend ~45s · frontend ~30s · E2E ~3-5min                                                               |

---

## Sampling Rate

- **After every task commit:** Run `make test` (backend) or `cd apps/web && bun run test` (frontend), depending on file scope.
- **After every plan wave:** Run full backend + frontend suite (skip E2E unless wave touches user-flow).
- **Before `/gsd-verify-work`:** Full suite green including `make test-e2e` and `make ci-gate`.
- **Max feedback latency:** 60s after task-level commit (quick run); 5min after wave (full).

---

## Per-Task Verification Map

| Task ID  | Plan                                | Wave | Requirement                          | Threat Ref                                                   | Secure Behavior                                                                                                     | Test Type                 | Automated Command                                                    | File Exists                                | Status     |
| -------- | ----------------------------------- | ---- | ------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------- | ------------------------------------------ | ---------- |
| 07-01-\* | 01 (Migration)                      | 0    | TASK-01                              | —                                                            | Schema change preserves tenant isolation via existing RLS policy                                                    | Integration (migration)   | `make test`                                                          | ❌ Wave 0                                  | ⬜ pending |
| 07-02-\* | 02 (Reserve Topup Generator)        | 1    | TASK-02                              | T-07-RT-01 cross-tenant                                      | `tenantIds.includes(budgetId)` guard; RLS isolation                                                                 | Unit + Integration        | `bun test packages/budgeting/test/tasks/reserve-topup.test.ts`       | ❌ Wave 0                                  | ⬜ pending |
| 07-03-\* | 03 (Confirm Draft Generator)        | 1    | TASK-03                              | T-07-CD-01 idempotent resolve                                | Resolve hook is idempotent (no-op on already-resolved)                                                              | Unit + Integration        | `bun test packages/budgeting/test/tasks/confirm-draft.test.ts`       | ❌ Wave 0                                  | ⬜ pending |
| 07-04-\* | 04 (Cushion Math + Generator)       | 1    | D-PH7-16 (math) + TASK-02-style emit | T-07-FX-01 FX bound                                          | `computeRecurringFx` bound `0 < rate < 1e6`; bigint arithmetic                                                      | Unit (pure) + Integration | `bun test packages/budgeting/test/tasks/cushion-math.test.ts`        | ❌ Wave 0                                  | ⬜ pending |
| 07-05-\* | 05 (Resolve Adapter + Hooks)        | 2    | TASK-06                              | T-07-XT-02 cross-tenant resolve                              | Adapter `WHERE tenant_id = $tenantId` in UPDATE; RLS second layer                                                   | Unit + Integration        | `bun test packages/budgeting/test/tasks/resolve-idempotency.test.ts` | ❌ Wave 0                                  | ⬜ pending |
| 07-06-\* | 06 (Tasks Route Expansion)          | 2    | TASK-06, TASK-07                     | T-07-XT-01 cross-tenant tasks-cross-tenant.test.ts extension | Route guard; tenant-leak test gate                                                                                  | Integration + tenant-leak | `bun test apps/api/test/routes/tasks.test.ts && make ci-gate`        | ⚠️ partial (Phase 3 file exists; extend)   | ⬜ pending |
| 07-07-\* | 07 (Banner UI Expansion)            | 3    | TASK-07, TASK-08                     | T-07-XSS-01 payload XSS                                      | Renders only i18n message keys with ICU interpolation; payload fields used as message parameters, never as raw HTML | Component (Vitest+RTL)    | `cd apps/web && bun run test -- task-banner-row`                     | ❌ Wave 0 (new test cases)                 | ⬜ pending |
| 07-08-\* | 08 (Settings cushion_target_months) | 3    | D-PH7-32                             | —                                                            | Zod int 1-60 validation; PATCH route tenant guard                                                                   | Component (Vitest+RTL)    | `cd apps/web && bun run test -- cushion-section`                     | ⚠️ partial (file exists; new cases)        | ⬜ pending |
| 07-09-\* | 09 (Onboarding cushion months step) | 3    | D-PH7-33                             | —                                                            | Zod validation in onboarding wizard                                                                                 | Component (Vitest+RTL)    | `cd apps/web && bun run test -- onboarding`                          | ⚠️ partial (extend)                        | ⬜ pending |
| 07-10-\* | 10 (CategorySlider mirror)          | 3    | D-PH7-35                             | —                                                            | `form.setValue` mirrors; silent break on cushion edit                                                               | Component (Vitest+RTL)    | `cd apps/web && bun run test -- category-slider`                     | ✅ (file exists; new cases)                | ⬜ pending |
| 07-11-\* | 11 (Push notification deep-link)    | 3    | TASK-07 (action wiring)              | —                                                            | URL scheme `/tasks/{taskId}`; integrates Phase 6 web-push                                                           | Component + E2E smoke     | `cd apps/web && bun run test -- push-deeplink`                       | ❌ Wave 0                                  | ⬜ pending |
| 07-12-\* | 12 (E2E golden paths)               | 4    | TASK-02..08 end-to-end               | —                                                            | task appears → user acts → task disappears per kind                                                                 | E2E (playwright-bdd)      | `make test-e2e -- task-banner`                                       | ⚠️ partial (rewrite required per D-PH7-29) | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Minimum Test Cases per Kind (Nyquist Coverage)

### RESERVE_TOPUP

1. Emit when mismatch > 0 after wallet balance change
2. No emit when mismatch = 0
3. Dedup: second mismatch does not create second task (ON CONFLICT DO NOTHING)
4. Resolve when mismatch corrected by reserve adjustment
5. Hourly sweep emits when inline path was missed (FX drift simulation)
6. Direction field: TOPUP when wallets < reserves; WITHDRAW when wallets > reserves

### CONFIRM_DRAFT

1. Emit on fresh draft INSERT (recurring-engine handler)
2. No emit on conflict (draft already existed for that rule+date)
3. Resolve on `confirmRecurringDraft`
4. Resolve on `dismissDraft`
5. Resolve on `skipRecurringDraft`
6. Dedup: two rapid confirms do not throw (idempotent resolve)

### CUSHION_BELOW_TARGET

1. No emit when `cushion_enabled = false`
2. Emit when `cushion_enabled = true AND shortfall > 0`
3. No emit when shortfall = 0 (actual ≥ required)
4. Resolve when `cushion_enabled` toggled off
5. Resolve when shortfall eliminated by adding cushion wallet
6. FX rate variance: wallet in non-budget currency converts correctly
7. Empty cushion wallets: actual = 0, shortfall = full required amount
8. `cushion_target_months` change triggers recompute
9. Category cushion change triggers recompute

---

## Tenant-Leak Gate Extensions

New routes requiring tenant-leak tests (per `make ci-gate`):

- `POST /budgets/:id/tasks/:taskId/resolve` → extend `tests/tenant-leak/tasks-cross-tenant.test.ts`
- `GET /budgets/:id/cushion-summary` → add `tests/tenant-leak/cushion-summary-cross-tenant.test.ts`

Current gate count: 7 files. Phase 7 adds 1–2 → 8–9.

---

## Wave 0 Requirements

- [ ] `packages/budgeting/test/tasks/reserve-topup.test.ts` — REQ TASK-02
- [ ] `packages/budgeting/test/tasks/confirm-draft.test.ts` — REQ TASK-03
- [ ] `packages/budgeting/test/tasks/cushion-math.test.ts` — REQ D-PH7-16
- [ ] `packages/budgeting/test/tasks/resolve-idempotency.test.ts` — REQ TASK-06
- [ ] `tests/tenant-leak/cushion-summary-cross-tenant.test.ts` — new route tenant-leak
- [ ] Migration integration test for `cushion_target_months` column existence
- [ ] Rewrite `apps/web/e2e/features/task-banner.feature` — D-PH7-29 (existing file, full rewrite)
- [ ] Bun:test scaffold under `packages/budgeting/test/tasks/` (directory + per-kind test files)
- [ ] Vitest cases extension for `category-slider.test.tsx` (mirror behavior)

---

## Manual-Only Verifications

| Behavior                                                  | Requirement | Why Manual                                                                                        | Test Instructions                                                                            |
| --------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Push notification deep-link opens correct task on iOS PWA | TASK-07     | Web push tap behavior on installed PWA cannot be reliably automated cross-browser                 | Install PWA on iOS, trigger task generation, tap push, assert app opens to `/tasks/{taskId}` |
| Three-locale title rendering parity (EN / PL / UK)        | TASK-08     | Vitest tests assert keys exist; visual diff for diacritics + line-wrap behavior is human-judgment | Switch locale in Settings, observe banner per kind, screenshot                               |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s (quick) / < 5min (full)
- [ ] `nyquist_compliant: true` set in frontmatter (after planner aligns task IDs and Wave 0 deps)

**Approval:** pending
