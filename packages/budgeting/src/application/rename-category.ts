/**
 * rename-category.ts — Application use case: rename a category
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { CategoryRepo } from "../ports/category-repo";
import type { CategoryDto } from "../contracts/api";

export interface RenameCategoryDeps {
  repo: CategoryRepo;
}

export function renameCategory(deps: RenameCategoryDeps) {
  return async (input: {
    tenantId: string;
    categoryId: string;
    name: string;
    actorUserId: string;
  }): Promise<Result<CategoryDto, Error>> => {
    const category = await deps.repo.findById(input.tenantId, input.categoryId);
    if (!category) {
      return err(new Error(`Category ${input.categoryId} not found`));
    }

    const result = category.rename(input.name);
    if (result.isErr()) return err(result.error);

    try {
      await deps.repo.rename(
        input.tenantId,
        input.categoryId,
        input.name,
        input.actorUserId,
      );
    } catch (e) {
      return err(e as Error);
    }

    return ok({
      id: category.id,
      name: category.name,
      parentId: category.parentId,
      archivedAt: category.archivedAt?.toISOString() ?? null,
      createdAt: category.createdAt.toISOString(),
    });
  };
}
