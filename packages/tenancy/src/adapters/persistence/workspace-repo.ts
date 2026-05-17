// This file MUST NOT be imported directly by domain/application/ports layers.
// Apps use createTenancyModule() from contracts/factory.ts (PC-02, PC-15).
import { sql } from "drizzle-orm";
import {
  withTenantTx,
  withUserContext,
  withInfraTx,
  writeAudit,
  writeOutbox,
} from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { validateShares } from "../../domain/share";
import type { BudgetDTO, MemberDTO, MemberShareDTO } from "../../contracts/api";
import type { BudgetRepo } from "../../ports/budget-repo";
import type { MemberShareRepo } from "../../ports/member-repo";

export class DrizzleBudgetRepo implements BudgetRepo {
  async findById(id: string): Promise<BudgetDTO | null> {
    // withInfraTx: infrastructure carve-out (PC-04). findById is called in bootstrap paths
    // before the tenant context is established (e.g., by application services verifying a
    // budget exists). The RLS predicate on budgets uses app.tenant_ids — without GUC,
    // no rows are returned for app_role. We use workerDb (withinfraTx) here as the resolver
    // runs under a service context not a user request context.
    const r = await withInfraTx(async (tx) => {
      const result = await tx.execute<{
        id: string;
        slug: string;
        name: string;
        kind: string;
        default_currency: string;
        owner_user_id: string;
        member_count: number;
        created_at: Date;
        cushion_mode_enabled: boolean;
        reserves_enabled: boolean;
      }>(
        sql`SELECT id, slug, name, kind, default_currency, owner_user_id, member_count, created_at, cushion_mode_enabled, reserves_enabled
            FROM tenancy.budgets WHERE id = ${id}`,
      );
      return result.rows[0] ?? null;
    });
    if (r.isErr()) throw r.error;
    const row = r.value;
    if (!row) return null;
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      kind: row.kind as "PRIVATE" | "SHARED",
      default_currency: row.default_currency,
      ownerUserId: row.owner_user_id,
      memberCount: row.member_count,
      createdAt: row.created_at,
      cushionModeEnabled: row.cushion_mode_enabled,
      reservesEnabled: row.reserves_enabled ?? true,
    };
  }

  async listForUser(userId: string): Promise<BudgetDTO[]> {
    const r = await withUserContext(UserId(userId), async (tx) => {
      const result = await tx.execute<{
        id: string;
        slug: string;
        name: string;
        kind: string;
        default_currency: string;
        owner_user_id: string;
        member_count: number;
        created_at: Date;
        cushion_mode_enabled: boolean;
      }>(sql`
        SELECT w.id, w.slug, w.name, w.kind, w.default_currency,
               w.owner_user_id, w.member_count, w.created_at, w.cushion_mode_enabled
        FROM tenancy.budgets w
        INNER JOIN tenancy.budget_members m ON m.budget_id = w.id
        WHERE m.user_id = ${userId}
      `);
      return result.rows;
    });
    if (r.isErr()) throw r.error;
    return r.value.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      kind: row.kind as "PRIVATE" | "SHARED",
      default_currency: row.default_currency,
      ownerUserId: row.owner_user_id,
      memberCount: row.member_count,
      createdAt: row.created_at,
      cushionModeEnabled: row.cushion_mode_enabled,
    }));
  }

  async listMembers(budgetId: string): Promise<MemberDTO[]> {
    // withInfraTx: infrastructure carve-out for listing members.
    const r = await withInfraTx(async (tx) => {
      const result = await tx.execute<{
        budget_id: string;
        user_id: string;
        role: string;
        created_at: Date;
      }>(
        sql`SELECT budget_id, user_id, role, created_at
            FROM tenancy.budget_members WHERE budget_id = ${budgetId}`,
      );
      return result.rows;
    });
    if (r.isErr()) throw r.error;
    return r.value.map((row) => ({
      budgetId: row.budget_id,
      userId: row.user_id,
      role: row.role as "owner" | "member",
      joinedAt: row.created_at,
    }));
  }
}

// Backward-compat alias
export { DrizzleBudgetRepo as DrizzleWorkspaceRepo };

export class DrizzleMemberShareRepo implements MemberShareRepo {
  async list(budgetId: string): Promise<MemberShareDTO[]> {
    const r = await withInfraTx(async (tx) => {
      const result = await tx.execute<{
        budget_id: string;
        user_id: string;
        percentage: string;
        updated_at: Date;
      }>(
        sql`SELECT budget_id, user_id, percentage, updated_at
            FROM tenancy.shared_budget_member_shares WHERE budget_id = ${budgetId}`,
      );
      return result.rows;
    });
    if (r.isErr()) throw r.error;
    return r.value.map((row) => ({
      budgetId: row.budget_id,
      userId: row.user_id,
      percentage: row.percentage,
      updatedAt: row.updated_at,
    }));
  }

  async update(
    budgetId: string,
    shares: { userId: string; percentage: string }[],
    actorUserId: string,
  ): Promise<void> {
    const tid = TenantId(budgetId);
    const aid = UserId(actorUserId);
    const r = await withTenantTx(tid, aid, async (tx) => {
      // Validate sum=100 in domain first (defense in depth; trigger is the second wall)
      const v = validateShares(shares);
      if (v.isErr()) throw v.error;

      // Snapshot before
      const before = await tx.execute(
        sql`SELECT user_id, percentage FROM tenancy.shared_budget_member_shares WHERE budget_id = ${budgetId}`,
      );

      // Replace all rows for this budget
      await tx.execute(
        sql`DELETE FROM tenancy.shared_budget_member_shares WHERE budget_id = ${budgetId}`,
      );
      for (const s of shares) {
        await tx.execute(
          sql`INSERT INTO tenancy.shared_budget_member_shares (budget_id, user_id, percentage)
              VALUES (${budgetId}, ${s.userId}, ${s.percentage})`,
        );
      }

      // Audit
      await writeAudit(tx, {
        tenantId: tid,
        entityType: "shared_budget_member_shares",
        entityId: budgetId,
        action: "update",
        actorUserId: aid,
        before: before.rows,
        after: shares,
      });

      // Outbox SharesUpdated event
      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "budget",
        aggregateId: budgetId,
        eventType: "tenancy.shares.updated",
        payload: { shares, actorUserId },
      });
    });
    if (r.isErr()) throw r.error;
  }
}
