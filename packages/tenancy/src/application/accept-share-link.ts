import type { BudgetShareLinkRepo } from "../ports/budget-share-link-repo";
import type { BudgetRepo } from "../ports/budget-repo";

export interface AcceptShareLinkResult {
  budgetId: string;
}

/**
 * Accept share link — adds the accepting user as a `member` of the budget.
 *
 * SHRD-02: token-only flow, single-use, no email send.
 * T-02-06: link state (revoked / expired / used) validated BEFORE the
 *          membership write so a stale link cannot mint a new member.
 *
 * Why we bypass Better Auth's `auth.api.addMember` here:
 *   The org plugin's addMember endpoint is admin-gated — it expects the
 *   caller to be an existing owner or admin of the organization, which
 *   the share-link recipient is not. Calling it raises a Better Auth
 *   `APIError("Organization not found")` because the unauthenticated
 *   permission check fails before the org lookup even runs. The correct
 *   primitive for "trusted server-side membership insert" is a direct
 *   write into `tenancy.budget_members` (same table the org plugin
 *   manages via its Drizzle adapter), which we route through
 *   `budgetRepo.joinAsMember`. That method also bumps the cached
 *   `budgets.member_count` so reads stay consistent.
 */
export async function acceptShareLink(
  deps: {
    budgetShareLinkRepo: BudgetShareLinkRepo;
    budgetRepo: BudgetRepo;
  },
  token: string,
  acceptingUserId: string,
): Promise<AcceptShareLinkResult> {
  const link = await deps.budgetShareLinkRepo.findByToken(token);
  if (!link) throw new Error("NotFound");

  const isExpired = new Date(link.expiresAt) <= new Date();
  const isRevoked = link.revokedAt !== null;
  const isUsed = link.acceptedBy !== null;

  if (isRevoked) throw new Error("Revoked");
  if (isExpired) throw new Error("Expired");
  if (isUsed) throw new Error("AlreadyUsed");

  await deps.budgetRepo.joinAsMember(link.budgetId, acceptingUserId, "member");

  // Mark link as used. Defense-in-depth WHERE in the adapter prevents
  // race-condition double-accept. Pass link.budgetId as tenantId
  // (v1.1: budget_id === tenant_id) so withTenantTx can set the GUC.
  await deps.budgetShareLinkRepo.accept(
    link.id,
    link.budgetId,
    acceptingUserId,
  );

  return { budgetId: link.budgetId };
}
