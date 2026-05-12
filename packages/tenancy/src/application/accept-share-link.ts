import type { BudgetShareLinkRepo } from "../ports/budget-share-link-repo";

type BetterAuthApi = {
  api: {
    addMember: (opts: {
      body: { organizationId: string; userId: string; role: string };
    }) => Promise<unknown>;
  };
};

export interface AcceptShareLinkResult {
  budgetId: string;
}

/**
 * Accept share link — calls Better Auth addMember (NOT createInvitation).
 * SHRD-02: token-only flow, single-use, no email send.
 * T-02-06: link state validated before addMember call.
 */
export async function acceptShareLink(
  deps: {
    budgetShareLinkRepo: BudgetShareLinkRepo;
    auth: BetterAuthApi;
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

  // Call Better Auth addMember (SHRD-02)
  // Uses org membership rules — recipient becomes a member of the budget (org)
  await deps.auth.api.addMember({
    body: {
      organizationId: link.budgetId,
      userId: acceptingUserId,
      role: "member",
    },
  });

  // Mark link as used (defense-in-depth WHERE in adapter prevents race-condition double-accept)
  // Pass link.budgetId as tenantId (v1.1: budget_id === tenant_id) so withTenantTx can set GUC
  await deps.budgetShareLinkRepo.accept(link.id, link.budgetId, acceptingUserId);

  return { budgetId: link.budgetId };
}
