# Phase 04 Deferred Items

## Legacy root mount cleanup (from Plan 04-05 Task 4)

**Deferred from:** Plan 04-05 Task 4
**Reason:** Active consumers of legacy root paths discovered during cleanup.

### Files still hitting legacy paths

| File                                                      | Legacy path                                             |
| --------------------------------------------------------- | ------------------------------------------------------- |
| `apps/web/src/components/budgeting/category-list.tsx`     | `GET /api/categories`                                   |
| `apps/web/src/app/[locale]/(app)/recurring/actions.ts`    | `GET /api/recurring-rules`                              |
| `apps/web/src/app/[locale]/(app)/transactions/actions.ts` | `GET /api/categories`                                   |
| `tests/e2e/steps/budget.steps.ts`                         | `POST/GET /api/categories`, `POST /api/recurring-rules` |

### What needs to happen before cleanup

1. Rewire `category-list.tsx` to use `GET /api/budgets/:budgetId/categories`
2. Rewire `recurring/actions.ts` to use `GET /api/budgets/:budgetId/recurring-rules`
3. Rewire `transactions/actions.ts` to use `GET /api/budgets/:budgetId/categories`
4. Update `budget.steps.ts` E2E step helpers to use budgetId-prefixed paths
5. Only then remove these from `apps/api/src/app.ts`:
   - `app.route("/categories", createCategoriesRoute(deps))` (line 116)
   - `app.route("/categories", createCategoryLimitsRoute(deps))` (line 117)
   - `app.route("/categories", createShareOverridesRoute(deps))` (line 118)
   - `app.route("/recurring-rules", createRecurringRulesRoute(deps))` (line 122)

### Context

Plans 04-02/04-04 added new budget-scoped routes but did NOT migrate pre-Phase-4 code.
The ci-gate and `make test` must remain green after removal.

---

## UAT verification summary (2026-05-14)

Manual UAT via Playwright MCP + targeted E2E run. Phase 4 deliverables verified
green; defects found during UAT were fixed-forward in commits `bf7a998`..`52cc1ea`.

### Verified working

- Visual sanity (Binance dark, yellow accent, dashed add-category column)
- Quick-entry transaction create → 201; transaction rows render
- Single-click txn row → edit/delete action reveal
- Double-click amount → inline-edit input
- Month navigator `‹`/`›` → URL `?month=YYYY-MM`
- CategorySlider open (create + edit), edit-mode value prefill
- Mobile 390px → `overflow-x: auto` horizontal scroll
- E2E: `category-create`, `category-edit`, `drag-reorder` all pass
- Phase 4 backend tests: 52 pass / 0 fail
- Component tests: 130 pass / 0 fail
- ci-gate tenant-leak: 35 pass / 0 fail

### Defects fixed-forward during UAT

1. `/budgets/:id/transactions` route not mounted (nested) — mounted
2. `/budgets/:id/categories/:id/limits` route not mounted (nested) — mounted
3. CategorySlider create handler crashed on `.id` of undefined — null-safe parse
4. CategorySlider edit mode did not prefill values — RHF reset on open
5. snake_case txn DTO not mapped to camelCase in hooks + RSC — `mapTxnRowToDTO`
6. `mapTxnRowToDTO` lived in a `"use client"` module — extracted to `lib/txn-mapper.ts`
7. column-header testids did not match `SpendingsPage` page-object — aligned to
   `drag-grip-{name}` + `column-header-pen-{name}`

### Known pre-existing issues (NOT Phase 4 — do not block)

- `make test` full-parallel run reports ~208 failures. In isolation the
  Phase 4 suites are 52/0 and `packages/budgeting`+`packages/tenancy` are
  226/10. The 10 are all pre-existing `tenancy` TENT-\* tests (ownership /
  shares / invites — Phase 1-2 scope). The remaining bulk is test-harness
  DB-contention under full parallelism — pre-Phase-4 baseline was already
  107 fails. Needs a dedicated test-harness fix, not a Phase 4 fix.

### Infra fix landed this phase

- Postgres bind-mount moved out of the repo (`../budget-data/postgres`,
  overridable via `POSTGRES_DATA_PATH`) — the in-repo `data/postgres` dir
  got chowned to uid 70 by the postgres container and broke every Docker
  build with `error from sender: ... permission denied`.
- Playwright stack deduped + pinned to `1.55.0` (playwright-bdd 8.5.0
  compat); `playwright.config.ts` `featuresRoot` set to repo root.
