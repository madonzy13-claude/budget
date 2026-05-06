import { ok, err, type Result } from "@budget/shared-kernel";

type BetterAuthApi = {
  api: {
    updateMemberRole: (opts: {
      body: Record<string, unknown>;
    }) => Promise<void>;
  };
};

export interface TransferOwnershipInput {
  workspaceId: string;
  fromUserId: string;
  toUserId: string;
}

export async function transferOwnership(
  deps: { auth: BetterAuthApi },
  input: TransferOwnershipInput,
): Promise<Result<void, Error>> {
  try {
    // Elevate new owner
    await deps.auth.api.updateMemberRole({
      body: {
        organizationId: input.workspaceId,
        memberId: input.toUserId,
        role: "owner",
        userId: input.fromUserId,
      },
    });
    // Demote previous owner
    await deps.auth.api.updateMemberRole({
      body: {
        organizationId: input.workspaceId,
        memberId: input.fromUserId,
        role: "member",
        userId: input.fromUserId,
      },
    });
    return ok(undefined);
  } catch (e) {
    return err(e as Error);
  }
}
