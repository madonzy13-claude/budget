---
phase: 4
slug: spendings-grid
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-13
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| **Framework**          | Vitest 4 + happy-dom (frontend) · bun:test (backend) · Playwright + playwright-bdd (E2E) |
| **Config file**        | `apps/web/vitest.config.ts`, `bunfig.toml`, `tests/e2e/playwright.config.ts`             |
| **Quick run command**  | `cd apps/web && bun run test` (frontend) / `make test` (backend)                         |
| **Full suite command** | `make test && make ci-gate && make test-e2e`                                             |
| **Estimated runtime**  | ~120 seconds full suite                                                                  |

---

## Sampling Rate

- **After every task commit:** Run scoped test (`bun test path/to/file.test.ts` or `vitest run path`)
- **After every plan wave:** Run `make test && cd apps/web && bun run test`
- **Before `/gsd-verify-work`:** Full suite must be green (`make test && make ci-gate && make test-e2e`)
- **Max feedback latency:** 30 seconds per scoped test

---

## Per-Task Verification Map

> Populated by gsd-planner during plan generation. Each task `<automated>` block maps here.
> Reference: see `04-RESEARCH.md` → `## Validation Architecture` for the test command per REQ-ID.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status     |
| ------- | ---- | ---- | ----------- | --------- | ----------------- | ----------- | ---------- |
| TBD     | TBD  | TBD  | TBD         | TBD       | TBD               | TBD         | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

Drawn from 04-RESEARCH.md "Wave 0 prerequisites":

- [ ] Install `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2` (MIT)
- [ ] Verify `temporal-polyfill` is installed; install if missing
- [ ] Schema spike: confirm `category_reserve_balance` VIEW shape (balance vs used-this-month)
- [ ] Schema spike: confirm `categories.icon` / `categories.color` columns exist
- [ ] Schema spike: confirm `expense_ledger.dismissed_at` column exists; additive migration if missing
- [ ] Tenant-leak `ci-gate` bump from 6 → 9 (3 new routes: `PUT /categories/sort-order`, `GET /spendings-summary`, `POST /recurring-rules/drafts/:id/dismiss`)
- [ ] Stub `tests/e2e/features/spendings-grid.feature` with placeholder scenarios for GRID-01..15
- [ ] i18n catalog stubs in `apps/web/messages/{en,pl,uk}.json` for 50+ keys from UI-SPEC

---

## Manual-Only Verifications

| Behavior                                                                  | Requirement            | Why Manual                              | Test Instructions                                                                                                           |
| ------------------------------------------------------------------------- | ---------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Visual confirmation of yellow accent scarcity (60/30/10 split)            | UI-SPEC color contract | Color perception not test-automatable   | Open Spendings tab; verify yellow appears ONLY on: Confirm button, dashed `+` column border, sticky pill, column-focus ring |
| Mobile horizontal scroll feel on iOS Safari (no jank during drag-reorder) | GRID-08                | iOS touch behavior requires real device | Open on iOS Safari, drag-reorder column, scroll grid horizontally, verify no conflict                                       |
| Slider swipe-down close on mobile                                         | D-PH4-E1..5            | Gesture timing requires real device     | Open TransactionSlider on mobile; swipe down from top; verify dismiss                                                       |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify command OR Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all 7 prerequisites above
- [ ] No `--watch` mode flags in commands
- [ ] Feedback latency < 30 seconds per scoped test
- [ ] `nyquist_compliant: true` set in frontmatter after gsd-planner populates Per-Task Verification Map

**Approval:** pending
