/**
 * budget-mode-repo.ts — BudgetModeRepo port (SCD-2 workspace mode history)
 */
import type { Result } from "@budget/shared-kernel";

export type BudgetMode = "NORMAL" | "CUSHION";

export interface ToggleBudgetModeInput {
  tenantId: string;
  workspaceId: string;
  mode: BudgetMode;
  effectiveFrom: string; // YYYY-MM-DD
  actorUserId: string;
}

export interface BudgetModeDto {
  id: string;
  workspaceId: string;
  mode: BudgetMode;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
}

export interface BudgetModeRepo {
  toggleMode(input: ToggleBudgetModeInput): Promise<Result<BudgetModeDto, Error>>;
  getCurrentMode(tenantId: string, workspaceId: string): Promise<BudgetModeDto | null>;
}
