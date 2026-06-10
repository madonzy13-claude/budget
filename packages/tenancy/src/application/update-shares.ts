import { ok, err, type Result } from "@budget/shared-kernel";
import type { MemberShareRepo } from "../ports/member-repo";
import type { BudgetRepo } from "../ports/budget-repo";

export interface UpdateSharesInput {
  workspaceId: string;
  ownerUserId: string;
  shares: { userId: string; percentage: string }[];
}

export async function updateShares(
  deps: {
    memberShareRepo: MemberShareRepo;
    budgetRepo?: BudgetRepo;
    workspaceRepo?: BudgetRepo;
  },
  input: UpdateSharesInput,
): Promise<Result<void, Error>> {
  const repo = (deps.budgetRepo ?? deps.workspaceRepo)!;
  try {
    // Verify budget exists
    const workspace = await repo.findById(input.workspaceId);
    if (!workspace) {
      return err(new Error(`Budget ${input.workspaceId} not found`));
    }

    // Verify owner
    const members = await repo.listMembers(input.workspaceId);
    const ownerIds = members
      .filter((m) => m.role === "owner")
      .map((m) => m.userId);
    if (!ownerIds.includes(input.ownerUserId)) {
      return err(
        new Error("Only owners can update workspace shares (TENT-13)"),
      );
    }

    // MemberShareRepo delegates to validateShares + writeAudit + writeOutbox in withTenantTx (PC-03)
    await deps.memberShareRepo.update(
      input.workspaceId,
      input.shares,
      input.ownerUserId,
    );
    return ok(undefined);
  } catch (e) {
    return err(e as Error);
  }
}
