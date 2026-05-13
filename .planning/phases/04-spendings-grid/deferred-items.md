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
