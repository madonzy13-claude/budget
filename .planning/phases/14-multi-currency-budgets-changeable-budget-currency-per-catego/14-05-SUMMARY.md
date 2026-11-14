---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 05
subsystem: budgeting
tags: [categories, currency, limits, transactions]
key-files:
  created:
    - packages/budgeting/test/application/create-category-currency.test.ts
    - packages/budgeting/test/application/create-transaction-category-currency.test.ts
  modified:
    - packages/budgeting/src/domain/category.ts
    - packages/budgeting/src/application/{create,list,find-by-id,rename,archive,unarchive}-category.ts
    - packages/budgeting/src/contracts/api.ts
    - packages/budgeting/src/adapters/persistence/category-repo.ts
    - packages/budgeting/src/adapters/persistence/categories-repo.ts
    - packages/budgeting/src/ports/categories-repo.ts
    - packages/budgeting/src/ports/transaction-repo.ts
    - packages/budgeting/src/adapters/persistence/transaction-repo.ts
    - packages/budgeting/src/application/create-transaction.ts
    - packages/budgeting/src/adapters/persistence/budget-template-repo.ts
    - apps/api/src/routes/category-limits.ts
    - apps/api/test/routes/categories.test.ts
requirements-completed: [D-04, D-05, D-06]
---

# 14-05 Summary: category currency end-to-end (backend)

- `Category.currency` (plain field; null before save). Repo INSERT passes it (NULL → 0104 trigger fills the budget currency) and `RETURNING currency` back onto the entity; every category SELECT returns it. `CategoryDto.currency` emitted by create/list/find/rename/archive/unarchive. Reserves `CategoryRow.currency` too (plan 11 reads it).
- `createCategorySchema.currency = z.enum(FIAT_CURRENCIES).optional()` → JPY / lowercase → 422. Not on the update schema (D-07 is its own route).
- create-transaction: `currencyOriginal ?? transactionRepo.categoryCurrency(tenant, category) ?? budgetCurrency` (new optional port method, tenant-scoped SQL in the adapter).
- category-limits route: missing currency → the category's (via findCategoryById; 404 when not in tenant). `grep "default_currency\|workspaceRepo" apps/api/src/routes/category-limits.ts` → no matches.
- Template apply: every written limit takes `(SELECT currency FROM categories WHERE id = item.categoryId)`.

## Verification
- RED (7acfc48c): 8 new cases failed (currency undefined, 201 for JPY, limit "USD", tx "PLN"); 20 pre-existing passed.
- GREEN: categories + category-limits + both application tests → 37 pass / 0 fail. tsc budgeting/api/web clean, eslint clean.
- Regression: budget-templates, transactions, transactions-bulk, ledger, reserves → all pass alone. `reserves.test.ts > POST adjust sets reserve to target` fails ONLY when run in one process with budget-templates + transactions — identical failure on the baseline worktree (e59691ac), so pre-existing cross-file pollution, not this plan.

## Deviations
- D-06 test changes the budget currency as postgres (migrator cannot see budgets under FORCE RLS).
- Category currency lookup lives on `TransactionRepo.categoryCurrency?` (optional) so both createTransaction wirings get it with no new deps.

## Self-Check: PASSED
