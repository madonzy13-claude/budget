import { ok, err, type Result } from "@budget/shared-kernel";
import { Workspace } from "../domain/workspace";
import type { WorkspaceRepo } from "../ports/workspace-repo";

type BetterAuthApi = {
  api: {
    removeMember: (opts: { body: Record<string, unknown> }) => Promise<void>;
  };
};

export interface LeaveWorkspaceInput {
  workspaceId: string;
  userId: string;
}

export async function leaveWorkspace(
  deps: { auth: BetterAuthApi; workspaceRepo: WorkspaceRepo },
  input: LeaveWorkspaceInput,
): Promise<Result<void, Error>> {
  try {
    // Fetch members to check last-owner guard (TENT-05)
    const members = await deps.workspaceRepo.listMembers(input.workspaceId);
    const ownerIds = members
      .filter((m) => m.role === "owner")
      .map((m) => m.userId);

    const workspace = await deps.workspaceRepo.findById(input.workspaceId);
    if (!workspace) {
      return err(new Error(`Workspace ${input.workspaceId} not found`));
    }

    const ws = new Workspace(
      workspace.id,
      workspace.slug,
      workspace.name,
      workspace.kind,
      workspace.default_currency,
      workspace.ownerUserId,
      workspace.memberCount,
      workspace.createdAt,
    );
    const canLeave = ws.canBeLeftBy(input.userId, ownerIds);
    if (canLeave.isErr()) return canLeave;

    await deps.auth.api.removeMember({
      body: {
        organizationId: input.workspaceId,
        memberIdOrEmail: input.userId,
        userId: input.userId,
      },
    });
    return ok(undefined);
  } catch (e) {
    return err(e as Error);
  }
}
