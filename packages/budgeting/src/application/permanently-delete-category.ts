/**
 * permanently-delete-category.ts — Application use case: hard-delete a category.
 *
 * Irreversible: removes the category AND all its data (transactions, drafts,
 * limits, reserve adjustments, share overrides, recurring rules, projections).
 * The UI only offers this for an already-archived ("keep history") category,
 * behind an explicit confirm. Guards on existence (cross-tenant → not_found).
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { CategoryRepo } from "../ports/category-repo";

export interface PermanentlyDeleteCategoryDeps {
  repo: CategoryRepo;
}

export function permanentlyDeleteCategory(deps: PermanentlyDeleteCategoryDeps) {
  return async (input: {
    tenantId: string;
    categoryId: string;
    actorUserId: string;
  }): Promise<Result<void, Error>> => {
    const category = await deps.repo.findById(input.tenantId, input.categoryId);
    if (!category) return err(new Error("not_found"));
    try {
      await deps.repo.hardDelete(
        input.tenantId,
        input.categoryId,
        input.actorUserId,
      );
    } catch (e) {
      return err(e as Error);
    }
    return ok(undefined);
  };
}
