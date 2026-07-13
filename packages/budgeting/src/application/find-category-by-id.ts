/**
 * find-category-by-id.ts — Application use case: find category by id
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { CategoryRepo } from "../ports/category-repo";
import type { CategoryDto } from "../contracts/api";

export interface FindCategoryByIdDeps {
  repo: CategoryRepo;
}

export function findCategoryById(deps: FindCategoryByIdDeps) {
  return async (input: {
    tenantId: string;
    categoryId: string;
  }): Promise<Result<CategoryDto | null, Error>> => {
    try {
      const cat = await deps.repo.findById(input.tenantId, input.categoryId);
      if (!cat) return ok(null);
      return ok({
        id: cat.id,
        name: cat.name,
        parentId: cat.parentId,
        archivedAt: cat.archivedAt?.toISOString() ?? null,
        createdAt: cat.createdAt.toISOString(),
        colorKey: cat.colorKey ?? null,
        cushionMode: cat.cushionMode ?? null,
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
