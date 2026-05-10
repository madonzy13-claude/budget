/**
 * toggle-budget-mode.ts — Application use case: set workspace budget mode
 * D-04-e: SCD-2 pattern for NORMAL|CUSHION mode history.
 */
import { type Result } from "@budget/shared-kernel";
import type { BudgetModeRepo, BudgetMode } from "../ports/budget-mode-repo";
import type { BudgetModeDto } from "../contracts/api";

export interface ToggleBudgetModeDeps {
  budgetModeRepo: BudgetModeRepo;
}

export interface ToggleBudgetModeFullInput {
  tenantId: string;
  workspaceId: string;
  mode: BudgetMode;
  effectiveFrom?: string; // YYYY-MM-DD; defaults to first-of-current-month
  actorUserId: string;
}

function firstDayOfCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export function toggleBudgetMode(deps: ToggleBudgetModeDeps) {
  return async (
    input: ToggleBudgetModeFullInput,
  ): Promise<Result<BudgetModeDto, Error>> => {
    const effectiveFrom = input.effectiveFrom ?? firstDayOfCurrentMonth();

    return deps.budgetModeRepo.toggleMode({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      mode: input.mode,
      effectiveFrom,
      actorUserId: input.actorUserId,
    });
  };
}
