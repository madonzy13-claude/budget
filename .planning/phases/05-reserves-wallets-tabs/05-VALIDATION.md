---
phase: 5
slug: reserves-wallets-tabs
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-17
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Framework**          | bun:test (backend unit + integration) · Vitest 4 + happy-dom (frontend component) · Playwright + playwright-bdd (E2E Gherkin) |
| **Config file**        | `bunfig.toml` (backend, 80% domain coverage) · `apps/web/vitest.config.ts` · `tests/e2e/playwright.config.ts`                 |
| **Quick run command**  | `make test` (backend bun:test)                                                                                                |
| **Full suite command** | `make test && cd apps/web && bun run test && make test-e2e && make ci-gate`                                                   |
| **Estimated runtime**  | ~90 seconds quick / ~6 minutes full                                                                                           |

---

## Sampling Rate

- **After every task commit:** Run `make test` (backend) or `cd apps/web && bun run test` (frontend)
- **After every plan wave:** Run full suite + `make ci-gate` (tenant-leak gate)
- **Before `/gsd-verify-work`:** Full suite green + `make test-e2e` green
- **Max feedback latency:** ~90 seconds (quick) for inner loop; ~6 min for wave gate

---

## Per-Task Verification Map

> Populated by planner during PLAN.md generation. Each PLAN.md task row contributes one line referencing requirement IDs (RSRV-_ / WALT-_), the threat IDs from CONTEXT.md threat model, and the automated command from its `<acceptance_criteria>`.

| Task ID  | Plan | Wave | Requirement     | Threat Ref  | Secure Behavior                                                                                                                                            | Test Type                | Automated Command                                       | File Exists | Status     |
| -------- | ---- | ---- | --------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------- | ----------- | ---------- |
| 05-XX-YY | XX   | W    | RSRV-_ / WALT-_ | T-05-\* / — | Cross-tenant 404 on /reserves; reserve-currency 422 on RESERVE-type wallet mismatch; soft-archive filter in list queries; adjustments append-only RLS gate | integration / unit / e2e | `bun test apps/api/test/routes/reserves.test.ts` (etc.) | ❌ W0       | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `apps/api/test/routes/reserves.test.ts` — integration stubs for GET /budgets/:id/reserves (rows + totals shape, em-dash edge cases, cross-tenant 404, reserves_enabled=false → empty)
- [ ] `apps/api/test/routes/reserves-adjust.test.ts` — POST /budgets/:id/reserves/:categoryId/adjust (append-only, RLS, delta math, Excluded category rejected, audit columns)
- [ ] `apps/api/test/routes/wallet-patch.test.ts` — PATCH /wallets/:id (name/currency/amount/type partial), reserve-currency 422 for RESERVE-type w/ non-budget-currency
- [ ] `apps/api/test/routes/category-reserve-excluded.test.ts` — PATCH categories/:id/reserve-excluded toggle + filter behavior in VIEW
- [ ] `apps/web/test/components/inline-edit-cell.test.tsx` — Vitest unit for `<InlineEditCell>` click-edit + blur-save + optimistic + error states
- [ ] `apps/web/test/components/dashed-add-button.test.tsx` — Vitest unit for `<DashedAddButton>` keyboard activation + focus ring
- [ ] `apps/web/test/components/mismatch-chip.test.tsx` — variant rendering (overfunded / underfunded / reconciled) + i18n key resolution
- [ ] `tests/e2e/features/reserves-rebalance.feature` — Gherkin: user opens Reserves tab, edits reserve balance from 5000→4000, sees mismatch chip "+€1000 overfunded", reduces wallet, chip turns "Reconciled"
- [ ] `tests/e2e/features/reserves-exclude-category.feature` — Gherkin: drag category from Active → Excluded, verify hidden from totals, drag back, verify balance restored
- [ ] `tests/e2e/features/wallets-inline-edit.feature` — Gherkin: edit wallet name/currency/amount inline, blur saves with toast
- [ ] `tests/e2e/features/wallets-cross-section-drag.feature` — Gherkin: drag non-budget-currency wallet to Reserve section, see snap-back + toast
- [ ] Drizzle migration file `apps/api/drizzle/00XX_phase05_reserves_rebalance.sql` — manual SQL: CREATE TABLE category_reserve_adjustments + RLS + indexes; ALTER TABLE categories ADD reserve_excluded; ALTER TABLE budgets ADD reserves_enabled; DROP + recreate VIEW category_reserve_balance
- [ ] Tenant-leak fixture entry for `category_reserve_adjustments` in CI gate's covered-tables list

---

## Manual-Only Verifications

| Behavior                                                         | Requirement         | Why Manual                                                                                                                               | Test Instructions                                                                                                                                                                         |
| ---------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile sticky-bottom totals footer occlusion by virtual keyboard | D-PH5-R12           | UI-SPEC explicitly accepts this as known UX nit this phase (not blocking) — verify Playwright cannot reliably reproduce virtual keyboard | Open Reserves tab on iOS Safari 390×844; tap reserve balance cell to summon keyboard; confirm totals footer is hidden behind keyboard (expected); confirm chip remains visible after blur |
| Drag-and-drop haptic feedback on touch devices                   | D-PH5-W7, D-PH5-R10 | Playwright drag simulation doesn't trigger native haptics                                                                                | Test physical iOS + Android device: long-press wallet row → drag to another section → confirm haptic tap on drop                                                                          |
| Impeccable sweep (DESIGN.md adherence visual audit)              | D-PH5-E6            | Subjective visual review                                                                                                                 | Run after all tasks green; load `/budgets/:id/reserves` + `/budgets/:id/wallets` on dark theme; check yellow scarcity (none in tab content), spacing rhythm, no off-token colors          |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
