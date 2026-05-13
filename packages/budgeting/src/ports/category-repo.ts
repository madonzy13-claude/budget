/**
 * category-repo.ts — CategoryRepo port interface
 * Implemented by DrizzleCategoryRepo in adapters/persistence.
 */
import type { Category } from "../domain/category";

export interface CategoryRepo {
  create(category: Category): Promise<void>;
  findById(tenantId: string, id: string): Promise<Category | null>;
  list(tenantId: string, includeArchived: boolean): Promise<Category[]>;
  /**
   * List categories scoped to a specific budget (budget_id = tenant_id invariant).
   * Used by spendings-summary composed read.
   */
  listForBudget(
    tenantId: string,
    budgetId: string,
    includeArchived: boolean,
  ): Promise<Category[]>;
  archive(
    tenantId: string,
    categoryId: string,
    actorUserId: string,
  ): Promise<void>;
  rename(
    tenantId: string,
    categoryId: string,
    newName: string,
    actorUserId: string,
  ): Promise<void>;
  /**
   * Reorder categories by rewriting sort_index = 1..N in one transaction.
   * orderedIds must contain exactly the active category IDs for the budget.
   */
  reorder(
    tenantId: string,
    budgetId: string,
    orderedIds: string[],
    actorUserId: string,
  ): Promise<void>;
}
