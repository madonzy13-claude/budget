import { withUserContext } from "@budget/platform";
import { UserId } from "@budget/shared-kernel";
import { sql } from "drizzle-orm";
import type { BudgetShareLinkRepo } from "../ports/budget-share-link-repo";

export interface RevokeShareLinkInput {
  linkId: string;
  tenantId: string;
  userId: string;
}

/**
 * Revoke share link — owner-only (T-02-NON-OWNER).
 * Sets revoked_at; subsequent GET resolve returns isRevoked=true; POST accept returns 410.
 */
export async function revokeShareLink(
  deps: { budgetShareLinkRepo: BudgetShareLinkRepo },
  input: RevokeShareLinkInput,
): Promise<void> {
  // Step 1: Resolve the link to get its budget_id (via public token-resolve path, no tenant GUC needed)
  // We look up by id using withInfraTx (worker_role has SELECT via budget_share_links_worker_public_resolve policy)
  const link = await deps.budgetShareLinkRepo.findById(input.linkId);
  if (!link) throw new Error("Forbidden");

  // Step 2: Owner-role assertion via withUserContext (sets app.current_user_id → budget_members_self policy)
  const memberResult = await withUserContext(UserId(input.userId), async (tx) => {
    const result = await tx.execute<{ role: string }>(
      sql`SELECT bm.role::text AS role
          FROM tenancy.budget_members bm
          WHERE bm.budget_id = ${link.budgetId}::uuid
            AND bm.user_id = ${input.userId}::uuid
          LIMIT 1`,
    );
    return result.rows[0] ?? null;
  });
  if (memberResult.isErr()) throw memberResult.error;
  if (!memberResult.value || memberResult.value.role !== "owner") {
    throw new Error("Forbidden");
  }

  await deps.budgetShareLinkRepo.revoke(input.linkId, link.tenantId, input.userId);
}
