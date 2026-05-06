import { nanoid } from "nanoid";
import { ok, err, type Result } from "@budget/shared-kernel";

// Internal type alias — tenancy does NOT import adapters from identity (dep-cruiser).
type BetterAuthApi = {
  api: {
    createOrganization: (opts: {
      body: Record<string, unknown>;
    }) => Promise<{ id: string }>;
  };
};

export interface CreateWorkspaceInput {
  name: string;
  kind: "PRIVATE" | "SHARED";
  default_currency: string;
  ownerUserId: string;
}

export async function createWorkspace(
  deps: { auth: BetterAuthApi },
  input: CreateWorkspaceInput,
): Promise<Result<{ workspaceId: string }, Error>> {
  try {
    const slug = nanoid(12);
    const r = await deps.auth.api.createOrganization({
      body: {
        name: input.name,
        slug,
        kind: input.kind,
        default_currency: input.default_currency,
        userId: input.ownerUserId,
      },
    });
    return ok({ workspaceId: r.id });
  } catch (e) {
    return err(e as Error);
  }
}
