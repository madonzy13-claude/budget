import { ok, err, type Result } from "@budget/shared-kernel";
import { sql } from "drizzle-orm";
import { withUserContext } from "@budget/platform";
import { UserId } from "@budget/shared-kernel";
import type { BudgetRepo } from "../ports/budget-repo";

export interface SetActiveBudgetsInput {
  userId: string;
  budgetIds: string[];
}
/** @deprecated use SetActiveBudgetsInput */
export type SetActiveWorkspacesInput = SetActiveBudgetsInput & {
  workspaceIds?: string[];
};

export async function setActiveBudgets(
  deps: { budgetRepo: BudgetRepo },
  input: SetActiveBudgetsInput,
): Promise<Result<void, Error>> {
  try {
    // T-01-06-03: intersect submitted IDs with actual memberships (defense in depth)
    const memberships = await deps.budgetRepo.listForUser(input.userId);
    const membershipIds = new Set(memberships.map((w) => w.id));
    const safeIds = input.budgetIds.filter((id) => membershipIds.has(id));

    // A Postgres array LITERAL, bound as one parameter. Interpolating the JS
    // array directly — `${safeIds}::uuid[]` — looks right and is not: drizzle's
    // sql`` expands an array into one placeholder PER ELEMENT, so a single id
    // arrived as a bare uuid ("malformed array literal", 22P02) and two ids
    // produced more VALUES than columns. Every non-empty selection failed.
    // `{}` is a valid empty uuid[], and a uuid needs no quoting inside braces.
    const idArrayLiteral = `{${safeIds.join(",")}}`;

    // Persist to user_preferences.active_workspace_ids (D-07)
    const r = await withUserContext(UserId(input.userId), async (tx) => {
      await tx.execute(sql`
        INSERT INTO identity.user_preferences (user_id, active_workspace_ids, created_at, updated_at)
        VALUES (${input.userId}, ${idArrayLiteral}::uuid[], NOW(), NOW())
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

/** @deprecated use setActiveBudgets */
export async function setActiveWorkspaces(
  deps: { budgetRepo?: BudgetRepo; workspaceRepo?: BudgetRepo },
  input: { userId: string; workspaceIds: string[] },
): Promise<Result<void, Error>> {
  return setActiveBudgets(
    { budgetRepo: (deps.budgetRepo ?? deps.workspaceRepo)! },
    { userId: input.userId, budgetIds: input.workspaceIds },
  );
}
