import { ok, err, type Result } from "@budget/shared-kernel";
import { sql } from "drizzle-orm";
import { withUserContext } from "@budget/platform";
import { UserId } from "@budget/shared-kernel";
import type { WorkspaceRepo } from "../ports/workspace-repo";

export interface SetActiveWorkspacesInput {
  userId: string;
  workspaceIds: string[];
}

export async function setActiveWorkspaces(
  deps: { workspaceRepo: WorkspaceRepo },
  input: SetActiveWorkspacesInput,
): Promise<Result<void, Error>> {
  try {
    // T-01-06-03: intersect submitted IDs with actual memberships (defense in depth)
    const memberships = await deps.workspaceRepo.listForUser(input.userId);
    const membershipIds = new Set(memberships.map((w) => w.id));
    const safeIds = input.workspaceIds.filter((id) => membershipIds.has(id));

    // Persist to user_preferences.active_workspace_ids (D-07)
    const r = await withUserContext(UserId(input.userId), async (tx) => {
      await tx.execute(sql`
        INSERT INTO identity.user_preferences (user_id, active_workspace_ids, created_at, updated_at)
        VALUES (${input.userId}, ${safeIds}::uuid[], NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE
          SET active_workspace_ids = EXCLUDED.active_workspace_ids,
              updated_at = NOW()
      `);
    });
    if (r.isErr()) return r;
    return ok(undefined);
  } catch (e) {
    return err(e as Error);
  }
}
