/**
 * set-category-limit.ts — Application use case: set effective-dated limit
 * D-04-c: effectiveFrom defaults to first day of current month.
 * SCD-2: closes previous open row, inserts new one.
 */
import { ok, err, serverNow, type Result } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { CategoryLimitRepo } from "../ports/category-limit-repo";
import type { CategoryLimitDto, SetCategoryLimitInput } from "../contracts/api";
import type { TaskRepo, TenantTx } from "../ports/task-repo";
import { recomputeCushionTask } from "./recompute-cushion-task";
import { recomputeIncomeUnderPlannedTask } from "./recompute-income-under-planned-task";
import {
  recomputeReserveTopupTask,
  type RecomputeReserveTopupTaskDeps,
} from "./recompute-reserve-topup-task";
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
  /** 05-17: a category limit change shifts effLimit → overage → reserve draw →
   *  internal (ΣR) → surplus, so refresh RESERVE_TOPUP alongside the cushion
   *  recompute. Optional + gated; best-effort own-tx (sweep is the backstop). */
  reservePositions?: RecomputeReserveTopupTaskDeps["reservePositions"];
  budgetCurrencyOf?: RecomputeReserveTopupTaskDeps["budgetCurrencyOf"];
  isReservesEnabled?: RecomputeReserveTopupTaskDeps["isReservesEnabled"];
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
  /**
   * true → change ONLY `effectiveFrom`'s month (bounded SCD-2 split), used when
   * editing a PAST month. Omitted/false → carry forward from `effectiveFrom`
   * (the historical open-ended behaviour), used for current-month + new limits.
   */
  singleMonth?: boolean;
}

function firstDayOfCurrentMonth(): string {
  const now = serverNow();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export function setCategoryLimit(deps: SetCategoryLimitDeps) {
  return async (
    input: SetCategoryLimitFullInput,
  ): Promise<Result<CategoryLimitDto, Error>> => {
    const effectiveFrom = input.effectiveFrom ?? firstDayOfCurrentMonth();
    // Default (and create / current-month edits) carry forward — preserves the
    // documented SCD-2 contract. The UI sets singleMonth when editing a PAST
    // month so only that month changes.
    const carryForward = !input.singleMonth;

    try {
      await deps.limitRepo.setLimitForMonth({
        tenantId: input.tenantId,
        categoryId: input.categoryId,
        monthStart: effectiveFrom,
        normalAmount: input.normalAmount,
        normalCurrency: input.normalCurrency,
        cushionAmount: input.cushionAmount,
        cushionCurrency: input.cushionCurrency,
        actorUserId: input.actorUserId,
        carryForward,
      });
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

      // r33: INCOME_UNDER_PLANNED recompute. A planned (normal_amount) change
      // moves the income-vs-planned gap. Idempotent, best-effort own-tx.
      const incomeR = await withTenantTx(
        TenantId(input.tenantId),
        UserId(input.actorUserId),
        async (tx) => {
          await recomputeIncomeUnderPlannedTask(
            tx as unknown as TenantTx,
            { tenantId: input.tenantId, budgetId: input.tenantId },
            { taskRepo, fxProvider },
          );
        },
      );
      if (incomeR.isErr()) {
        console.error(
          "[set-category-limit] income-under-planned recompute failed:",
          incomeR.error,
        );
      }
    }

    // 05-17: RESERVE_TOPUP recompute. A limit change moves overage → reserve
    // draw → internal → surplus. Gated on the reserve deps; best-effort own-tx
    // (A2 — limitRepo.setLimit owns its tx). Never fails the save.
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
      const reserveR = await withTenantTx(
        TenantId(input.tenantId),
        UserId(input.actorUserId),
        async (tx) => {
          await recomputeReserveTopupTask(
            tx as unknown as TenantTx,
            // v1.1 invariant: tenantId === budgetId.
            { tenantId: input.tenantId, budgetId: input.tenantId },
            { taskRepo, reservePositions, budgetCurrencyOf, isReservesEnabled },
          );
        },
      );
      if (reserveR.isErr()) {
        console.error(
          "[set-category-limit] reserve-topup recompute failed:",
          reserveR.error,
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
