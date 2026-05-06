import { ok, err, type Result } from "@budget/shared-kernel";

type BetterAuthApi = {
  api: {
    createInvitation: (opts: {
      body: Record<string, unknown>;
    }) => Promise<{ id: string }>;
  };
};

export interface InviteMemberInput {
  workspaceId: string;
  inviterUserId: string;
  email: string;
  role: "owner" | "member";
}

export async function inviteMember(
  deps: { auth: BetterAuthApi },
  input: InviteMemberInput,
): Promise<Result<{ invitationId: string }, Error>> {
  try {
    const r = await deps.auth.api.createInvitation({
      body: {
        organizationId: input.workspaceId,
        email: input.email,
        role: input.role,
        userId: input.inviterUserId,
      },
    });
    return ok({ invitationId: r.id });
  } catch (e) {
    return err(e as Error);
  }
}
