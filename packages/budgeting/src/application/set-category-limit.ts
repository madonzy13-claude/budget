/**
 * set-category-limit.ts — Application use case: set effective-dated limit
 * D-04-c: effectiveFrom defaults to first day of current month.
 * SCD-2: closes previous open row, inserts new one.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { CategoryLimitRepo } from "../ports/category-limit-repo";
import type { SetLimitInput as RepoInput } from "../ports/category-limit-repo";
import type { CategoryLimitDto, SetCategoryLimitInput } from "../contracts/api";
import type { TaskRepo, TenantTx } from "../ports/task-repo";
import { recomputeCushionTask } from "./recompute-cushion-task";
import type { FxProviderLike } from "./recurring-engine-fx";

export interface SetCategoryLimitDeps {
  limitRepo: CategoryLimitRepo;
  /** Phase 7 (D-PH7-19): when provided alongside fxProvider, recompute the
   *  CUSHION_BELOW_TARGET task in a follow-up tx after the category limit
   *  SCD-2 row lands. The helper is idempotent (ON CONFLICT DO NOTHING +
   *  UPDATE WHERE PENDING), so we call it unconditionally — the cost is
   *  ≈2 SELECTs even when cushion_amount didn't change. Optional so legacy
   *  callers keep compiling. */
  taskRepo?: TaskRepo;
  fxProvider?: FxProviderLike;
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

    // Phase 7 (D-PH7-19): CUSHION_BELOW_TARGET recompute hook.
    // Unconditional call — every category limit change is a potential
    // cushion_amount change (the SCD-2 setLimit path always rewrites
    // cushion_amount; the helper is idempotent so a no-op edit costs ≈2
    // SELECTs). limitRepo.setLimit opens its own tx; A2 fallback opens a
    // separate withTenantTx for the recompute. Errors don't fail the save —
    // log and continue.
    if (deps.taskRepo && deps.fxProvider) {
      const taskRepo = deps.taskRepo;
      const fxProvider = deps.fxProvider;
      const recomputeR = await withTenantTx(
        TenantId(input.tenantId),
        UserId(input.actorUserId),
        async (tx) => {
          await recomputeCushionTask(
            tx as unknown as TenantTx,
            { tenantId: input.tenantId, budgetId: input.tenantId },
            { taskRepo, fxProvider },
          );
        },
      );
      if (recomputeR.isErr()) {
        console.error(
          "[set-category-limit] cushion recompute failed:",
          recomputeR.error,
        );
      }
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
