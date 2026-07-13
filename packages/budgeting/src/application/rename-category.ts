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
    // 260613-v1p / mig 0059: optional recolor and cushion-mode change in the same
    // PATCH. undefined → leave untouched; null → clear; a value → set. The route
    // passes through exactly what zod parsed (presence-aware per key).
    colorKey?: string | null;
    cushionMode?: string | null;
  }): Promise<Result<CategoryDto, Error>> => {
    const category = await deps.repo.findById(input.tenantId, input.categoryId);
    if (!category) {
      return err(new Error(`Category ${input.categoryId} not found`));
    }

    const result = category.rename(input.name);
    if (result.isErr()) return err(result.error);

    // Only touch a field when it was explicitly provided (presence-aware), so a
    // rename-only PATCH never wipes an existing color or cushion mode.
    const recolor = input.colorKey !== undefined;
    const remode = input.cushionMode !== undefined;
    if (recolor) category.recolor(input.colorKey ?? null);
    if (remode) category.setCushionMode(input.cushionMode ?? null);

    try {
      await deps.repo.rename(
        input.tenantId,
        input.categoryId,
        input.name,
        input.actorUserId,
        recolor || remode
          ? {
              ...(recolor ? { colorKey: input.colorKey ?? null } : {}),
              ...(remode ? { cushionMode: input.cushionMode ?? null } : {}),
            }
          : undefined,
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
      colorKey: category.colorKey,
      cushionMode: category.cushionMode,
    });
  };
}
