/**
 * category-repo.ts — CategoryRepo port interface
 * Implemented by DrizzleCategoryRepo in adapters/persistence.
 */
import type { Category } from "../domain/category";

export interface CategoryRepo {
  create(category: Category): Promise<void>;
  findById(tenantId: string, id: string): Promise<Category | null>;
  /** asOfMonth (YYYY-MM-01) scopes month-removed categories; defaults to the
   *  current month. */
  list(
    tenantId: string,
    includeArchived: boolean,
    asOfMonth?: string,
  ): Promise<Category[]>;
  /**
   * List categories scoped to a specific budget (budget_id = tenant_id invariant).
   * Used by spendings-summary composed read. asOfMonth scopes month-removed
   * categories so they stay visible in the months they had activity.
   */
  listForBudget(
    tenantId: string,
    budgetId: string,
    includeArchived: boolean,
    asOfMonth?: string,
  ): Promise<Category[]>;
  /**
   * Archive a category. Default (or hideAll) hides it in every month; passing
   * archivedFrom (a month start) keeps history — visible before that month.
   */
  archive(
    tenantId: string,
    categoryId: string,
    actorUserId: string,
    opts?: { archivedFrom?: string | null; hideAll?: boolean },
  ): Promise<void>;
  /**
   * Rename a category, optionally recoloring it in the same write (260613-v1p).
   * Pass opts.colorKey to set/clear the color; omit opts to leave color untouched.
   */
  rename(
    tenantId: string,
    categoryId: string,
    newName: string,
    actorUserId: string,
    opts?: { colorKey: string | null },
  ): Promise<void>;
  /**
   * Unarchive a category. Clears archived_from and archived_at (set both NULL),
   * restoring the category to active status. Does NOT resurrect deleted
   * recurring_rules or drafts — archive removed them intentionally.
   */
  unarchive(
    tenantId: string,
    categoryId: string,
    actorUserId: string,
  ): Promise<void>;
  /**
   * PERMANENTLY delete a category and all its data (transactions, drafts,
   * limits, reserve adjustments, share overrides, recurring rules, projections)
   * in one transaction. Destructive + irreversible — only offered for already
   * archived ("keep history") categories via an explicit confirm.
   */
  hardDelete(
    tenantId: string,
    categoryId: string,
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
