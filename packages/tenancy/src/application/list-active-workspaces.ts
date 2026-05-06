import { ok, err, type Result } from "@budget/shared-kernel";
import { sql } from "drizzle-orm";
import { withUserContext } from "@budget/platform";
import { UserId } from "@budget/shared-kernel";
import type { WorkspaceRepo } from "../ports/workspace-repo";
import type { WorkspaceDTO } from "../contracts/api";

export interface ListActiveWorkspacesInput {
  userId: string;
}

export async function listActiveWorkspaces(
  deps: { workspaceRepo: WorkspaceRepo },
  input: ListActiveWorkspacesInput,
): Promise<Result<WorkspaceDTO[], Error>> {
  try {
    // Get persisted active_workspace_ids
    const prefsResult = await withUserContext(
      UserId(input.userId),
      async (tx) => {
        const r = await tx.execute<{ active_workspace_ids: string[] }>(
          sql`SELECT active_workspace_ids FROM identity.user_preferences WHERE user_id = ${input.userId}`,
        );
        const row = r.rows[0];
        return row?.active_workspace_ids ?? ([] as string[]);
      },
    );
    if (prefsResult.isErr()) return err(prefsResult.error);

    const storedIds = prefsResult.value;
    if (storedIds.length === 0) return ok([]);

    // Intersect with actual memberships (D-07, TENT-12)
    const memberships = await deps.workspaceRepo.listForUser(input.userId);
    const membershipMap = new Map(memberships.map((w) => [w.id, w]));

    const active = storedIds
      .filter((id) => membershipMap.has(id))
      .map((id) => membershipMap.get(id)!);

    return ok(active);
  } catch (e) {
    return err(e as Error);
  }
}
