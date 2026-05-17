/**
 * toggle-category-reserve-excluded.ts — Application use case: toggle reserve_excluded.
 *
 * NOTE on W-2 disambiguation:
 *   - The ROUTE layer (apps/api/src/routes/categories.ts) enforces the 403 guard:
 *     if URL `budgetId` !== caller's tenantId → 403 `tenant_mismatch` BEFORE calling
 *     this use case.
 *   - This use case only ever sees a valid tenant context. It relies on RLS via
 *     categoriesRepo.findById(tenantId, categoryId) returning null for cross-tenant
 *     categoryIds → returns err("not_found") → route maps to 404.
 *
 * Two distinct failure paths, two distinct codes — see W-2 disambiguation matrix.
 *
 * Plan 05-03 / RSRV-05, RSRV-06.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { CategoriesRepo } from "../ports/categories-repo";

export interface ToggleCategoryReserveExcludedDeps {
  repo: CategoriesRepo;
}

export interface ToggleCategoryReserveExcludedInput {
  tenantId: string;
  categoryId: string;
  excluded: boolean;
  actorUserId: string;
}

export function toggleCategoryReserveExcluded(
  deps: ToggleCategoryReserveExcludedDeps,
) {
  return async (
    input: ToggleCategoryReserveExcludedInput,
  ): Promise<
    Result<{ categoryId: string; reserveExcluded: boolean }, Error>
  > => {
    try {
      // RLS returns null when categoryId belongs to a different tenant → 404 at route.
      const cat = await deps.repo.findById(input.tenantId, input.categoryId);
      if (!cat) return err(new Error("not_found"));

      await deps.repo.setReserveExcluded(
        input.tenantId,
        input.categoryId,
        input.excluded,
        input.actorUserId,
      );

      return ok({
        categoryId: input.categoryId,
        reserveExcluded: input.excluded,
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
