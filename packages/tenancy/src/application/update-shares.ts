import { ok, err, type Result } from "@budget/shared-kernel";
import type { MemberShareRepo } from "../ports/member-repo";
import type { WorkspaceRepo } from "../ports/workspace-repo";

export interface UpdateSharesInput {
  workspaceId: string;
  ownerUserId: string;
  shares: { userId: string; percentage: string }[];
}

export async function updateShares(
  deps: { memberShareRepo: MemberShareRepo; workspaceRepo: WorkspaceRepo },
  input: UpdateSharesInput,
): Promise<Result<void, Error>> {
  try {
    // Verify workspace exists
    const workspace = await deps.workspaceRepo.findById(input.workspaceId);
    if (!workspace) {
      return err(new Error(`Workspace ${input.workspaceId} not found`));
    }

    // Verify owner
    const members = await deps.workspaceRepo.listMembers(input.workspaceId);
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
