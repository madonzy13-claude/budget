---
phase: 4
slug: spendings-grid
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-13
updated: 2026-05-13
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

> One row per task across all 5 plans. Each task's `<automated>` block maps here.
> Reference: see `04-RESEARCH.md` → `## Validation Architecture` for the test command per REQ-ID.

| Task ID    | Plan | Wave | Requirements                                                           | Test Type            | Automated Command                                                                                                                                                                                                                                                                                                                      | File Exists                                                                                                              | Status     |
| ---------- | ---- | ---- | ---------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 04-01-T1   | 01   | 0    | GRID-12, RECR-07, RECR-06                                              | shell-grep           | `cd /home/claude/budget && grep -q '"@dnd-kit/sortable"' apps/web/package.json && grep -q '"temporal-polyfill"' apps/web/package.json && [ ! -e apps/web/src/components/budgeting/transaction-search-bar.tsx ] && [ ! -e apps/web/src/components/budgeting/pending-drafts-inbox.tsx ] && echo OK`                                      | apps/web/package.json; deletions verified                                                                                | ⬜ pending |
| 04-01-T2   | 01   | 0    | GRID-12 (i18n), RECR-07                                                | shell-grep           | `cd /home/claude/budget && grep -q "export function AmountInput" apps/web/src/components/budgeting/fields/amount-input.tsx && grep -q "generateIdempotencyKey" apps/web/src/lib/idempotency.ts && (grep -q "Add expense" apps/web/messages/en/grid.json 2>/dev/null \|\| grep -q "Add expense" apps/web/messages/en.json) && echo OK`  | fields/\*.tsx, lib/idempotency.ts, messages/{en,pl,uk}/grid.json                                                         | ⬜ pending |
| 04-01-T3   | 01   | 0    | GRID-12 (e2e scaffold)                                                 | shell-grep           | `cd /home/claude/budget && [ -e tests/e2e/features/spendings/placeholder.feature ] && grep -q "@phase4" tests/e2e/features/spendings/placeholder.feature && grep -q "export class SpendingsPage" tests/e2e/pages/SpendingsPage.ts && grep -q "createBdd" tests/e2e/steps/spendings.steps.ts && echo OK`                                | tests/e2e/features/spendings/placeholder.feature, pages/SpendingsPage.ts, steps/spendings.steps.ts                       | ⬜ pending |
| 04-01-T4   | 01   | 0    | Wave 0 sign-off                                                        | checkpoint:human     | (human-verify — schema spike findings, deletes, ci-gate bump confirmed)                                                                                                                                                                                                                                                                | (no file)                                                                                                                | ⬜ pending |
| 04-02-T1.5 | 02   | 1    | RECR-03, RECR-04 (confirm endpoint)                                    | shell-grep+decision  | `cd /home/claude/budget && grep -rnE "(confirm.*draft\|draft.*confirm\|promote.*draft)" apps/api/src/routes/ packages/budgeting/src/application/ 2>/dev/null \| head -20 ; echo "Decision recorded"`                                                                                                                                   | (discovery only; outcomes recorded in plan summary)                                                                      | ⬜ pending |
| 04-02-T1   | 02   | 1    | GRID-09, GRID-15, RECR-06, RSCM-03, RSCM-04                            | bun:test unit        | `cd /home/claude/budget && bun test packages/budgeting/test/application/reorder-categories.test.ts packages/budgeting/test/application/dismiss-draft.test.ts packages/budgeting/test/application/get-spendings-summary.test.ts`                                                                                                        | packages/budgeting/src/application/{reorder-categories,dismiss-draft,confirm-draft,get-spendings-summary}.ts             | ⬜ pending |
| 04-02-T2   | 02   | 1    | GRID-04, GRID-09, GRID-15, RECR-03, RECR-04, RECR-06, RSCM-03, RSCM-04 | bun:test integration | `cd /home/claude/budget && DATABASE_URL_APP="${DATABASE_URL_APP}" bun test apps/api/test/routes/categories-sort-order.test.ts apps/api/test/routes/spendings-summary.test.ts apps/api/test/routes/recurring-drafts-dismiss.test.ts apps/api/test/routes/recurring-drafts-confirm.test.ts apps/api/test/routes/category-limits.test.ts` | apps/api/src/routes/{categories,recurring-rules,spendings-summary}.ts; test files                                        | ⬜ pending |
| 04-02-T3   | 02   | 1    | [BLOCKING] schema push + ci-gate                                       | drizzle+make         | `cd /home/claude/budget && bun run drizzle-kit push --strict 2>&1 \| tail -20 && make ci-gate 2>&1 \| tail -10 && make test 2>&1 \| tail -10`                                                                                                                                                                                          | (verification only)                                                                                                      | ⬜ pending |
| 04-03-T1   | 03   | 2    | GRID-05, GRID-06, GRID-10, RECR-03..06                                 | vitest unit          | `cd /home/claude/budget/apps/web && bun run test --run apps/web/test/lib/decimal.test.ts apps/web/test/hooks/use-month-param.test.tsx apps/web/test/hooks/use-transactions.test.tsx apps/web/test/hooks/use-drafts.test.tsx`                                                                                                           | apps/web/src/lib/{decimal,cents-format}.ts; hooks/use-\*.ts                                                              | ⬜ pending |
| 04-03-T2   | 03   | 2    | GRID-01..03, GRID-08, GRID-10, GRID-11, GRID-13, GRID-14, RECR-03..06  | vitest component     | `cd /home/claude/budget/apps/web && bun run test --run apps/web/test/components/spendings-grid/`                                                                                                                                                                                                                                       | apps/web/src/components/budgeting/spendings-grid/\*.tsx                                                                  | ⬜ pending |
| 04-04-T1   | 04   | 3    | GRID-04, GRID-07, GRID-08, RECR-05                                     | vitest component     | `cd /home/claude/budget/apps/web && bun run test --run apps/web/test/components/budgeting/transaction-slider.test.tsx apps/web/test/components/budgeting/category-slider.test.tsx`                                                                                                                                                     | apps/web/src/components/budgeting/{transaction,category}-slider.tsx                                                      | ⬜ pending |
| 04-04-T2   | 04   | 3    | GRID-01, GRID-02, GRID-09, GRID-13, RSCM-03                            | vitest component     | `cd /home/claude/budget/apps/web && bun run test --run apps/web/test/components/spendings-grid/category-column.test.tsx apps/web/test/components/spendings-grid/spendings-grid-client.test.tsx`                                                                                                                                        | apps/web/src/components/budgeting/spendings-grid/{category-column,spendings-grid-client}.tsx; app/.../spendings/page.tsx | ⬜ pending |
| 04-04-T3   | 04   | 3    | (deletion + typecheck)                                                 | shell+typecheck      | `cd /home/claude/budget && [ ! -e apps/web/src/components/budgeting/transaction-capture-form.tsx ] && [ ! -e apps/web/src/components/budgeting/transaction-capture-sheet.tsx ] && [ ! -e apps/web/src/components/budgeting/transaction-edit-form.tsx ] && cd apps/web && bun run typecheck 2>&1 \| tail -5 && echo OK`                 | (deletions only)                                                                                                         | ⬜ pending |
| 04-05-T1   | 05   | 4    | (E2E scaffold completion)                                              | shell-grep           | `cd /home/claude/budget && grep -c "Given\|When\|Then" tests/e2e/steps/spendings.steps.ts \| awk '$1 >= 25 {print "OK"; exit} {print "FAIL"; exit 1}'`                                                                                                                                                                                 | tests/e2e/steps/spendings.steps.ts, pages/SpendingsPage.ts                                                               | ⬜ pending |
| 04-05-T2   | 05   | 4    | All GRID-_ + RECR-_ + RSCM-03/04 (E2E)                                 | shell-count+e2e      | `cd /home/claude/budget && ls tests/e2e/features/spendings/*.feature \| wc -l \| awk '$1 >= 15 {print "OK"; exit} {print "FAIL"; exit 1}'` then `PLAYWRIGHT_BASE_URL="$(grep ^APP_URL .env.local \| cut -d= -f2)" make test-e2e -- spendings`                                                                                          | tests/e2e/features/spendings/\*.feature (15 files)                                                                       | ⬜ pending |
| 04-05-T3   | 05   | 4    | (all gates green)                                                      | make+typecheck       | `cd /home/claude/budget && make test 2>&1 \| tail -3 && make ci-gate 2>&1 \| tail -3 && cd apps/web && bun run test --run 2>&1 \| tail -3 && bun run typecheck 2>&1 \| tail -3`                                                                                                                                                        | (verification only)                                                                                                      | ⬜ pending |
| 04-05-T4   | 05   | 4    | (legacy mount cleanup)                                                 | shell-grep           | `cd /home/claude/budget && [ "$(grep -cE 'app\.route\(.\\/(categories\|recurring-rules\|spendings-summary).' apps/api/src/app.ts)" = "0" ] && [ "$(grep -cE 'app\.route\(.\\/budgets/:budgetId/(categories\|recurring-rules\|spendings-summary)' apps/api/src/app.ts)" = "3" ] && echo OK`                                             | apps/api/src/app.ts (legacy lines deleted)                                                                               | ⬜ pending |
| 04-05-T5   | 05   | 4    | UAT sign-off                                                           | checkpoint:human     | (human UAT — visual + interaction + reserve cascade + drafts)                                                                                                                                                                                                                                                                          | (no file)                                                                                                                | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

**Sampling continuity check:** No 3-consecutive automated-test gap. All tasks have either an `<automated>` command above OR are an explicit `checkpoint:human-*` task (04-01-T4, 04-05-T5) or a discovery step (04-02-T1.5).

---

## Wave 0 Requirements

Drawn from 04-RESEARCH.md "Wave 0 prerequisites":

- [ ] Install `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2` (MIT)
- [ ] Verify `temporal-polyfill` is installed; install if missing
- [ ] Schema spike: confirm `category_reserve_balance` VIEW shape (balance vs used-this-month)
- [ ] Schema spike: confirm `categories.icon` / `categories.color` columns exist
- [ ] Schema spike: confirm `expense_ledger.dismissed_at` column exists; additive migration if missing
- [ ] Schema spike: confirm `tenancy.budgets.timezone` column exists (NEW per Plan 04-02 budgetTz extension)
- [ ] Tenant-leak `ci-gate` bump from 6 → 9 (3 new routes: `PUT /categories/sort-order`, `GET /spendings-summary`, `POST /recurring-rules/drafts/:id/dismiss`) — +1 more if Plan 04-02 Task 1.5 CASE B ships a new confirm endpoint
- [ ] Stub `tests/e2e/features/spendings/placeholder.feature` with placeholder scenarios for GRID-01..15
- [ ] i18n catalog stubs in `apps/web/messages/{en,pl,uk}/grid.json` for 50+ keys from UI-SPEC

---

## Manual-Only Verifications

| Behavior                                                                  | Requirement            | Why Manual                              | Test Instructions                                                                                                           |
| ------------------------------------------------------------------------- | ---------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Visual confirmation of yellow accent scarcity (60/30/10 split)            | UI-SPEC color contract | Color perception not test-automatable   | Open Spendings tab; verify yellow appears ONLY on: Confirm button, dashed `+` column border, sticky pill, column-focus ring |
| Mobile horizontal scroll feel on iOS Safari (no jank during drag-reorder) | GRID-08                | iOS touch behavior requires real device | Open on iOS Safari, drag-reorder column, scroll grid horizontally, verify no conflict                                       |
| Slider swipe-down close on mobile                                         | D-PH4-E1..5            | Gesture timing requires real device     | Open TransactionSlider on mobile; swipe down from top; verify dismiss                                                       |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify command OR Wave 0 dependency OR explicit `checkpoint:human-*` type
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all 8 prerequisites above (includes the new tenancy.budgets.timezone spike)
- [x] No `--watch` mode flags in commands
- [x] Feedback latency < 30 seconds per scoped test
- [x] `nyquist_compliant: true` set in frontmatter (Per-Task Verification Map fully populated)
- [ ] `wave_0_complete: true` flipped (this happens during execute-phase Wave 0 sign-off — task 04-01-T4)

**Approval:** pending (awaiting execute-phase Wave 0 completion + user UAT at 04-05-T5)
</content>
</invoke>
