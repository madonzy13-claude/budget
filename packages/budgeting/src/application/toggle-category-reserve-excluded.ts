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
 * Phase 05 reserve rewrite (05-REWRITE-SPEC.md, 05-13 — decision: independence):
 *   Excluding a category drops its R from internal (the orchestrator skips
 *   excluded categories). Categories are INDEPENDENT — there is NO sibling
 *   refill/spill (the OLD greedy exclude-release to siblings is GONE).
 *   Re-including is likewise just a flag flip; the engine replays the category
 *   back into internal from its existing adjustment/accrual history.
 *
 * The flag flip shifts internal (ΣR) → surplus moves → RESERVE_TOPUP is
 * recomputed when the task deps are wired. Plan 05-13 / RSRV-REWRITE-USECASES.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { CategoriesRepo } from "../ports/categories-repo";
import type { TaskRepo, TenantTx } from "../ports/task-repo";
import {
  recomputeReserveTopupTask,
  type RecomputeReserveTopupTaskDeps,
} from "./recompute-reserve-topup-task";

export interface ToggleCategoryReserveExcludedDeps {
  repo: CategoriesRepo;
  /** Phase 7 / 05-13: when wired, recompute RESERVE_TOPUP after the flag flip
   *  (excluding/including a category shifts internal → surplus). Optional so
   *  legacy callers keep compiling; otherwise the hourly sweep catches it. */
  taskRepo?: TaskRepo;
  reservePositions?: RecomputeReserveTopupTaskDeps["reservePositions"];
  budgetCurrencyOf?: (tenantId: string) => Promise<string>;
  isReservesEnabled?: (tenantId: string) => Promise<boolean>;
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

      // Decision (independence): set the flag only — NO sibling refill/spill.
      await deps.repo.setReserveExcluded(
        input.tenantId,
        input.categoryId,
        input.excluded,
        input.actorUserId,
      );

      // RESERVE_TOPUP recompute: the toggled category's R left/entered internal.
      if (
        deps.taskRepo &&
        deps.reservePositions &&
        deps.budgetCurrencyOf &&
        deps.isReservesEnabled
      ) {
        const taskRepo = deps.taskRepo;
        const reservePositions = deps.reservePositions;
        const budgetCurrencyOf = deps.budgetCurrencyOf;
        const isReservesEnabled = deps.isReservesEnabled;
        await withTenantTx(
          TenantId(input.tenantId),
          UserId(input.actorUserId),
          async (tx) => {
            await recomputeReserveTopupTask(
              tx as unknown as TenantTx,
              { tenantId: input.tenantId, budgetId: input.budgetId },
              { taskRepo, reservePositions, budgetCurrencyOf, isReservesEnabled },
            );
          },
        );
      }

      return ok({
        categoryId: input.categoryId,
        reserveExcluded: input.excluded,
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
