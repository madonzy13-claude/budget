import { ok, err, type Result } from "@budget/shared-kernel";

type BetterAuthApi = {
  api: {
    acceptInvitation: (opts: {
      body: Record<string, unknown>;
    }) => Promise<void>;
  };
};

export interface AcceptInvitationInput {
  invitationId: string;
  userId: string;
}

export async function acceptInvitation(
  deps: { auth: BetterAuthApi },
  input: AcceptInvitationInput,
): Promise<Result<void, Error>> {
  try {
    await deps.auth.api.acceptInvitation({
      body: {
        invitationId: input.invitationId,
        userId: input.userId,
      },
    });
    return ok(undefined);
  } catch (e) {
    return err(e as Error);
  }
}
