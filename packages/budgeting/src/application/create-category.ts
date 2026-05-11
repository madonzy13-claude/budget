/**
 * create-category.ts — Application use case: create a new category
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { CategoryRepo } from "../ports/category-repo";
import { Category } from "../domain/category";
import type { CreateCategoryInput, CategoryDto } from "../contracts/api";

export interface CreateCategoryDeps {
  repo: CategoryRepo;
}

export interface CreateCategoryFullInput extends CreateCategoryInput {
  tenantId: string;
  actorUserId: string;
}

export function createCategory(deps: CreateCategoryDeps) {
  return async (
    input: CreateCategoryFullInput,
  ): Promise<Result<CategoryDto, Error>> => {
    // If parentId provided, validate it's a root category (one-level rule)
    if (input.parentId) {
      const parent = await deps.repo.findById(input.tenantId, input.parentId);
      if (!parent) {
        return err(new Error(`Parent category ${input.parentId} not found`));
      }
      const tempChild = new Category(
        "check",
        input.tenantId,
        input.name,
        input.parentId,
        null,
        new Date(),
        input.actorUserId,
      );
      const canBe = tempChild.canBeChild(parent);
      if (canBe.isErr()) return err(canBe.error);
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const category = new Category(
      id,
      input.tenantId,
      input.name,
      input.parentId ?? null,
      null,
      now,
      input.actorUserId,
    );

    try {
      await deps.repo.create(category);
    } catch (e) {
      return err(e as Error);
    }

    return ok({
      id: category.id,
      name: category.name,
      parentId: category.parentId,
      archivedAt: null,
      createdAt: now.toISOString(),
    });
  };
}
