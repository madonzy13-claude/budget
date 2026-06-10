import { withInfraTx } from "@budget/platform";
import { sql } from "drizzle-orm";
import type { BudgetShareLinkRepo } from "../ports/budget-share-link-repo";

export interface ResolveShareLinkResult {
  found: boolean;
  budgetName?: string;
  isExpired?: boolean;
  isRevoked?: boolean;
  isUsed?: boolean;
}

/**
 * Public resolve — no tenant context required.
 * Token IS the credential (T-02-05, D-PH2-05).
 * Budget name (not financial data) is minimum disclosure for share-link confirm page (T-02-PUBLIC-RESOLVE-LEAK: accept).
 */
export async function resolveShareLink(
  deps: { budgetShareLinkRepo: BudgetShareLinkRepo },
  token: string,
): Promise<ResolveShareLinkResult> {
  const link = await deps.budgetShareLinkRepo.findByToken(token);
  if (!link) return { found: false };

  const isExpired = new Date(link.expiresAt) <= new Date();
  const isRevoked = link.revokedAt !== null;
  const isUsed = link.acceptedBy !== null;

  // Load budget name via withInfraTx (no tenant GUC available in public path)
  const budgetResult = await withInfraTx(async (tx) => {
    const result = await tx.execute<{ name: string }>(
      sql`SELECT name FROM tenancy.budgets WHERE id = ${link.budgetId}::uuid LIMIT 1`,
    );
    return result.rows[0] ?? null;
  });
  if (budgetResult.isErr()) throw budgetResult.error;
  const budgetName = budgetResult.value?.name ?? "Unknown";

  return {
    found: true,
    budgetName,
    isExpired,
    isRevoked,
    isUsed,
  };
}
