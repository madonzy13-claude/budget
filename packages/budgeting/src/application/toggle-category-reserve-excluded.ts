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
 * UAT-PH5-T3-54 (architecture pivot):
 *   When excluding a category, its stored `reserve_actual_cents` is released to
 *   the free pool and refilled into underfunded siblings (sort_index ASC).
 *   Overflow stays as wallet surplus (banner notifies).
 *   Re-including is a no-op for actual (user must manually re-fund).
 *
 * Plan 05-03 / RSRV-05, RSRV-06.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { CategoriesRepo } from "../ports/categories-repo";
import type { ReserveBalanceRepo } from "../ports/reserve-balance-repo";
import { applyExclude, type ReserveRow } from "../domain/reserve-allocator";

export interface ToggleCategoryReserveExcludedDeps {
  repo: CategoriesRepo;
  /** UAT-PH5-T3-54: needed to compute refill on exclude. */
  reserveBalanceRepo?: ReserveBalanceRepo;
}

export interface ToggleCategoryReserveExcludedInput {
  tenantId: string;
  budgetId: string;
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

      // Excluding with non-zero actual: release to siblings before flipping the flag.
      if (
        input.excluded &&
        !cat.reserveExcluded &&
        (cat.reserveActualCents ?? 0n) > 0n &&
        deps.reserveBalanceRepo
      ) {
        const asOf = new Date();
        const [activeMap, excludedMap, allCats] = await Promise.all([
          deps.reserveBalanceRepo.getForBudget(
            input.budgetId,
            input.tenantId,
            asOf,
          ),
          deps.reserveBalanceRepo.getExcludedForBudget(
            input.budgetId,
            input.tenantId,
            asOf,
          ),
          deps.repo.list(input.tenantId),
        ]);

        const rows: ReserveRow[] = allCats.map((c) => {
          const m = c.reserveExcluded
            ? excludedMap.get(c.id)
            : activeMap.get(c.id);
          const expectedCents = m
            ? BigInt(m.amount.times("100").toFixed(0))
            : 0n;
          return {
            categoryId: c.id,
            sortIndex: c.sortIndex ?? 0,
            reserveExcluded: c.reserveExcluded,
            expectedCents,
            actualCents: c.reserveActualCents ?? 0n,
          };
        });

        const allocResult = applyExclude(rows, input.categoryId);
        const updates = new Map<string, bigint>();
        for (const after of allocResult.rows) {
          const before = rows.find((r) => r.categoryId === after.categoryId)!;
          if (before.actualCents !== after.actualCents) {
            updates.set(after.categoryId, after.actualCents);
          }
        }
        if (updates.size > 0) {
          await deps.repo.setReserveActualMany(
            input.tenantId,
            updates,
            input.actorUserId,
          );
        }
      }

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
