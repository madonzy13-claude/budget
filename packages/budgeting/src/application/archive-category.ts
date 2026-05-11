/**
 * archive-category.ts — Application use case: archive a category
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { CategoryRepo } from "../ports/category-repo";
import type { CategoryDto } from "../contracts/api";

export interface ArchiveCategoryDeps {
  repo: CategoryRepo;
}

export function archiveCategory(deps: ArchiveCategoryDeps) {
  return async (input: {
    tenantId: string;
    categoryId: string;
    actorUserId: string;
  }): Promise<Result<CategoryDto, Error>> => {
    const category = await deps.repo.findById(input.tenantId, input.categoryId);
    if (!category) {
      return err(new Error(`Category ${input.categoryId} not found`));
    }

    const result = category.archive();
    if (result.isErr()) return err(result.error);

    try {
      await deps.repo.archive(
        input.tenantId,
        input.categoryId,
        input.actorUserId,
      );
    } catch (e) {
      return err(e as Error);
    }

    return ok({
      id: category.id,
      name: category.name,
      parentId: category.parentId,
      archivedAt: category.archivedAt!.toISOString(),
      createdAt: category.createdAt.toISOString(),
    });
  };
}
