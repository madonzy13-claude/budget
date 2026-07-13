/**
 * get-effective-limit.ts — Application use case: point-in-time limit lookup
 * D-04-b: returns the row valid at the given reportDate.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { CategoryLimitRepo } from "../ports/category-limit-repo";
import type { CategoryLimitDto } from "../contracts/api";

export interface GetEffectiveLimitDeps {
  limitRepo: CategoryLimitRepo;
}

export function getEffectiveLimit(deps: GetEffectiveLimitDeps) {
  return async (input: {
    tenantId: string;
    categoryId: string;
    reportDate?: string; // YYYY-MM-DD; defaults to today
  }): Promise<Result<CategoryLimitDto | null, Error>> => {
    const reportDate =
      input.reportDate ?? new Date().toISOString().substring(0, 10);

    try {
      const limit = await deps.limitRepo.getEffectiveLimit(
        input.tenantId,
        input.categoryId,
        reportDate,
      );

      if (!limit) return ok(null);

      return ok({
        id: limit.id,
        categoryId: limit.categoryId,
        normalAmount: limit.normalAmount,
        normalCurrency: limit.normalCurrency,
        cushionAmount: limit.cushionAmount,
        cushionCurrency: limit.cushionCurrency,
        needsAmount: limit.needsAmount,
        wantsAmount: limit.wantsAmount,
        effectiveFrom: limit.effectiveFrom,
        effectiveTo: limit.effectiveTo,
        createdAt: limit.createdAt.toISOString(),
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
