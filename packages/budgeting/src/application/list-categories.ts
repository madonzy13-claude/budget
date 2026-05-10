/**
 * list-categories.ts — Application use case: list categories
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { CategoryRepo } from "../ports/category-repo";
import type { CategoryDto } from "../contracts/api";

export interface ListCategoriesDeps {
  repo: CategoryRepo;
}

export function listCategories(deps: ListCategoriesDeps) {
  return async (input: {
    tenantId: string;
    includeArchived: boolean;
  }): Promise<Result<CategoryDto[], Error>> => {
    try {
      const cats = await deps.repo.list(input.tenantId, input.includeArchived);
      return ok(
        cats.map((c) => ({
          id: c.id,
          name: c.name,
          parentId: c.parentId,
          scope: c.scope,
          archivedAt: c.archivedAt?.toISOString() ?? null,
          createdAt: c.createdAt.toISOString(),
        })),
      );
    } catch (e) {
      return err(e as Error);
    }
  };
}
