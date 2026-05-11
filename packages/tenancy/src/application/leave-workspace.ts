import { ok, err, type Result } from "@budget/shared-kernel";
import { Budget } from "../domain/budget";
import type { BudgetRepo } from "../ports/budget-repo";

type BetterAuthApi = {
  api: {
    removeMember: (opts: { body: Record<string, unknown> }) => Promise<void>;
  };
};

export interface LeaveBudgetInput {
  budgetId: string;
  userId: string;
}

/** @deprecated use LeaveBudgetInput */
export type LeaveWorkspaceInput = LeaveBudgetInput & { workspaceId?: string };

export async function leaveBudget(
  deps: { auth: BetterAuthApi; budgetRepo: BudgetRepo },
  input: LeaveBudgetInput,
): Promise<Result<void, Error>> {
  try {
    // Fetch members to check last-owner guard (TENT-05)
    const members = await deps.budgetRepo.listMembers(input.budgetId);
    const ownerIds = members
      .filter((m) => m.role === "owner")
      .map((m) => m.userId);

    const budget = await deps.budgetRepo.findById(input.budgetId);
    if (!budget) {
      return err(new Error(`Budget ${input.budgetId} not found`));
    }

    const bud = new Budget(
      budget.id,
      budget.slug,
      budget.name,
      budget.kind,
      budget.default_currency,
      budget.ownerUserId,
      budget.memberCount,
      budget.createdAt,
      budget.cushionModeEnabled ?? false,
    );
    const canLeave = bud.canBeLeftBy(input.userId, ownerIds);
    if (canLeave.isErr()) return canLeave;

    await deps.auth.api.removeMember({
      body: {
        organizationId: input.budgetId,
        memberIdOrEmail: input.userId,
        userId: input.userId,
      },
    });
    return ok(undefined);
  } catch (e) {
    return err(e as Error);
  }
}

/** @deprecated use leaveBudget */
export async function leaveWorkspace(
  deps: {
    auth: BetterAuthApi;
    budgetRepo?: BudgetRepo;
    workspaceRepo?: BudgetRepo;
  },
  input: { workspaceId: string; userId: string },
): Promise<Result<void, Error>> {
  return leaveBudget(
    { auth: deps.auth, budgetRepo: (deps.budgetRepo ?? deps.workspaceRepo)! },
    { budgetId: input.workspaceId, userId: input.userId },
  );
}
