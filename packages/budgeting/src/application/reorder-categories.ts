/**
 * reorder-categories.ts — Reorder categories by rewriting sort_index = 1..N.
 * GRID-09, D-PH4-D2: PUT /budgets/:budgetId/categories/sort-order
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { CategoryRepo } from "../ports/category-repo";

export interface ReorderCategoriesDeps {
  repo: CategoryRepo;
}

export interface ReorderCategoriesInput {
  tenantId: string;
  budgetId: string;
  orderedIds: string[];
  actorUserId: string;
}

export function reorderCategories(deps: ReorderCategoriesDeps) {
  return async (
    input: ReorderCategoriesInput,
  ): Promise<Result<void, Error>> => {
    try {
      if (input.orderedIds.length === 0) {
        return err(new Error("orderedIds_empty"));
      }
      if (new Set(input.orderedIds).size !== input.orderedIds.length) {
        return err(new Error("duplicate_ids"));
      }
      await deps.repo.reorder(
        input.tenantId,
        input.budgetId,
        input.orderedIds,
        input.actorUserId,
      );
      return ok(undefined);
    } catch (e) {
      return err(e as Error);
    }
  };
}
