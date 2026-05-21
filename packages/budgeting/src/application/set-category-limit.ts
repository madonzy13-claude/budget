/**
 * set-category-limit.ts — Application use case: set effective-dated limit
 * D-04-c: effectiveFrom defaults to first day of current month.
 * SCD-2: closes previous open row, inserts new one.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { CategoryLimitRepo } from "../ports/category-limit-repo";
import type { SetLimitInput as RepoInput } from "../ports/category-limit-repo";
import type { CategoryLimitDto, SetCategoryLimitInput } from "../contracts/api";

export interface SetCategoryLimitDeps {
  limitRepo: CategoryLimitRepo;
}

export interface SetCategoryLimitFullInput extends Omit<
  SetCategoryLimitInput,
  "normalCurrency" | "cushionAmount" | "cushionCurrency"
> {
  tenantId: string;
  categoryId: string;
  actorUserId: string;
  // Route layer resolves these from the active workspace before calling.
  normalCurrency: string;
  cushionAmount: string;
  cushionCurrency: string;
}

function firstDayOfCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export function setCategoryLimit(deps: SetCategoryLimitDeps) {
  return async (
    input: SetCategoryLimitFullInput,
  ): Promise<Result<CategoryLimitDto, Error>> => {
    const effectiveFrom = input.effectiveFrom ?? firstDayOfCurrentMonth();

    const repoInput: RepoInput = {
      tenantId: input.tenantId,
      categoryId: input.categoryId,
      normalAmount: input.normalAmount,
      normalCurrency: input.normalCurrency,
      cushionAmount: input.cushionAmount,
      cushionCurrency: input.cushionCurrency,
      effectiveFrom,
      actorUserId: input.actorUserId,
    };

    try {
      await deps.limitRepo.setLimit(repoInput);
    } catch (e) {
      return err(e as Error);
    }

    // Return the now-effective limit
    const current = await deps.limitRepo.getEffectiveLimit(
      input.tenantId,
      input.categoryId,
      effectiveFrom,
    );

    if (!current) {
      return err(new Error("Limit set but could not be retrieved"));
    }

    return ok({
      id: current.id,
      categoryId: current.categoryId,
      normalAmount: current.normalAmount,
      normalCurrency: current.normalCurrency,
      cushionAmount: current.cushionAmount,
      cushionCurrency: current.cushionCurrency,
      effectiveFrom: current.effectiveFrom,
      effectiveTo: current.effectiveTo,
      createdAt: current.createdAt.toISOString(),
    });
  };
}
