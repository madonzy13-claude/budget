import { withUserContext } from "@budget/platform";
import { UserId } from "@budget/shared-kernel";
import { sql } from "drizzle-orm";
import type { BudgetShareLinkRepo } from "../ports/budget-share-link-repo";

export interface CreateShareLinkInput {
  budgetId: string;
  tenantId: string;
  userId: string;
  ttlDays?: number;
}

export interface CreateShareLinkResult {
  id: string;
  url: string;
  expiresAt: string; // ISO 8601
}

export async function createShareLink(
  deps: {
    budgetShareLinkRepo: BudgetShareLinkRepo;
    appUrl: string;
  },
  input: CreateShareLinkInput,
): Promise<CreateShareLinkResult> {
  const ttlDays = input.ttlDays ?? 7;

  // Owner-role assertion via withUserContext (sets app.current_user_id → budget_members_self policy)
  const memberResult = await withUserContext(UserId(input.userId), async (tx) => {
    const result = await tx.execute<{ role: string }>(
      sql`SELECT bm.role::text AS role
          FROM tenancy.budget_members bm
          WHERE bm.budget_id = ${input.budgetId}::uuid
            AND bm.user_id = ${input.userId}::uuid
          LIMIT 1`,
    );
    return result.rows[0] ?? null;
  });
  if (memberResult.isErr()) throw memberResult.error;
  if (!memberResult.value || memberResult.value.role !== "owner") {
    throw new Error("Forbidden");
  }

  // Generate nanoid(32) URL-safe token (~192-bit entropy, T-02-05)
  const { nanoid } = await import("nanoid");
  const token = nanoid(32);

  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  const link = await deps.budgetShareLinkRepo.create({
    budgetId: input.budgetId,
    tenantId: input.tenantId,
    createdBy: input.userId,
    token,
    expiresAt,
  });

  return {
    id: link.id,
    url: `${deps.appUrl}/budgets/join/${token}`,
    expiresAt: expiresAt.toISOString(),
  };
}
