/**
 * adjust-category-reserve.ts — Application use case: append-only reserve adjustment.
 *
 * Guards:
 *   1. reserves_disabled → 422 "reserves_disabled"
 *   2. category not found (RLS cross-tenant returns null) → 404 "not_found"
 *   3. category.reserveExcluded = true → 422 "category_excluded" (T-05-05, D-PH5-R10)
 *      Excluded categories retain a FROZEN balance; manual adjustments are blocked
 *      to preserve the math invariant (adjustments to Excluded rows would leak into
 *      the balance without affecting totals, creating invisible money).
 *
 * Plan 05-03 / RSRV-01, RSRV-02.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { CategoryReserveAdjustmentsRepo } from "../ports/category-reserve-adjustments-repo";
import type { CategoriesRepo } from "../ports/categories-repo";

export interface AdjustCategoryReserveDeps {
  adjustmentsRepo: CategoryReserveAdjustmentsRepo;
  categoriesRepo: CategoriesRepo;
  /** Checks budgets.reserves_enabled for the given tenantId. */
  isReservesEnabled: (tenantId: string) => Promise<boolean>;
}

export interface AdjustCategoryReserveInput {
  tenantId: string;
  categoryId: string;
  /** Signed integer cents (negative = withdrawal). Must be non-zero (Zod validates). */
  deltaCents: number;
  note?: string;
  actorUserId: string;
}

export function adjustCategoryReserve(deps: AdjustCategoryReserveDeps) {
  return async (
    input: AdjustCategoryReserveInput,
  ): Promise<Result<{ id: string; occurredAt: string }, Error>> => {
    try {
      const enabled = await deps.isReservesEnabled(input.tenantId);
      if (!enabled) return err(new Error("reserves_disabled"));

      const cat = await deps.categoriesRepo.findById(
        input.tenantId,
        input.categoryId,
      );
      if (!cat) return err(new Error("not_found"));
      if (cat.reserveExcluded) return err(new Error("category_excluded"));

      const r = await deps.adjustmentsRepo.create({
        tenantId: input.tenantId,
        categoryId: input.categoryId,
        deltaCents: BigInt(input.deltaCents),
        note: input.note ?? null,
        actorUserId: input.actorUserId,
      });

      return ok({ id: r.id, occurredAt: r.occurredAt.toISOString() });
    } catch (e) {
      return err(e as Error);
    }
  };
}
