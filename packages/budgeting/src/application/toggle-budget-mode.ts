/**
 * toggle-budget-mode.ts — Application use case: set workspace budget mode
 * D-04-e: SCD-2 pattern for NORMAL|CUSHION mode history.
 */
import { serverNow, type Result } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { BudgetModeRepo, BudgetMode } from "../ports/budget-mode-repo";
import type { BudgetModeDto } from "../contracts/api";
import type { TaskRepo, TenantTx } from "../ports/task-repo";
import {
  recomputeReserveTopupTask,
  type RecomputeReserveTopupTaskDeps,
} from "./recompute-reserve-topup-task";

export interface ToggleBudgetModeDeps {
  budgetModeRepo: BudgetModeRepo;
  /** 05-17: toggling NORMAL↔CUSHION flips the effective limit for every category
   *  with a limit this month → overage → reserve draw → internal → surplus, so
   *  refresh RESERVE_TOPUP after the mode change. Optional + gated; best-effort
   *  own-tx (the toggle owns its tx; sweep is the backstop). */
  taskRepo?: TaskRepo;
  reservePositions?: RecomputeReserveTopupTaskDeps["reservePositions"];
  budgetCurrencyOf?: RecomputeReserveTopupTaskDeps["budgetCurrencyOf"];
  isReservesEnabled?: RecomputeReserveTopupTaskDeps["isReservesEnabled"];
}

export interface ToggleBudgetModeFullInput {
  tenantId: string;
  workspaceId: string;
  mode: BudgetMode;
  effectiveFrom?: string; // YYYY-MM-DD; defaults to first-of-current-month
  actorUserId: string;
}

function firstDayOfCurrentMonth(): string {
  const now = serverNow();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export function toggleBudgetMode(deps: ToggleBudgetModeDeps) {
  return async (
    input: ToggleBudgetModeFullInput,
  ): Promise<Result<BudgetModeDto, Error>> => {
    const effectiveFrom = input.effectiveFrom ?? firstDayOfCurrentMonth();

    const result = await deps.budgetModeRepo.toggleMode({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      mode: input.mode,
      effectiveFrom,
      actorUserId: input.actorUserId,
    });

    // 05-17: refresh RESERVE_TOPUP — the cushion-mode flip changed effLimit for
    // limited categories → overage/draw → surplus. Gated; best-effort own-tx.
    if (
      result.isOk() &&
      deps.taskRepo &&
      deps.reservePositions &&
      deps.budgetCurrencyOf &&
      deps.isReservesEnabled
    ) {
      const taskRepo = deps.taskRepo;
      const reservePositions = deps.reservePositions;
      const budgetCurrencyOf = deps.budgetCurrencyOf;
      const isReservesEnabled = deps.isReservesEnabled;
      const recomputeR = await withTenantTx(
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
      if (recomputeR.isErr()) {
        console.error(
          "[toggle-budget-mode] reserve-topup recompute failed:",
          recomputeR.error,
        );
      }
    }

    return result;
  };
}
