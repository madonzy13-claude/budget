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
import type {
  WorkspaceDTO,
  MemberDTO,
  MemberShareDTO,
} from "../../contracts/api";
import type { WorkspaceRepo } from "../../ports/workspace-repo";
import type { MemberShareRepo } from "../../ports/member-repo";

export class DrizzleWorkspaceRepo implements WorkspaceRepo {
  async findById(id: string): Promise<WorkspaceDTO | null> {
    // withInfraTx: infrastructure carve-out (PC-04). findById is called in bootstrap paths
    // before the tenant context is established (e.g., by application services verifying a
    // workspace exists). The RLS predicate on workspaces uses app.tenant_ids — without GUC,
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
      }>(
        sql`SELECT id, slug, name, kind, default_currency, owner_user_id, member_count, created_at
            FROM tenancy.workspaces WHERE id = ${id}`,
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
    };
  }

  async listForUser(userId: string): Promise<WorkspaceDTO[]> {
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
      }>(sql`
        SELECT w.id, w.slug, w.name, w.kind, w.default_currency,
               w.owner_user_id, w.member_count, w.created_at
        FROM tenancy.workspaces w
        INNER JOIN tenancy.workspace_members m ON m.workspace_id = w.id
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
    }));
  }

  async listMembers(workspaceId: string): Promise<MemberDTO[]> {
    // withInfraTx: infrastructure carve-out for listing members. In normal request paths
    // the tenant context is already established by middleware; this method is available for
    // service-layer checks (e.g., owner count for leaveWorkspace guard).
    const r = await withInfraTx(async (tx) => {
      const result = await tx.execute<{
        workspace_id: string;
        user_id: string;
        role: string;
        created_at: Date;
      }>(
        sql`SELECT workspace_id, user_id, role, created_at
            FROM tenancy.workspace_members WHERE workspace_id = ${workspaceId}`,
      );
      return result.rows;
    });
    if (r.isErr()) throw r.error;
    return r.value.map((row) => ({
      workspaceId: row.workspace_id,
      userId: row.user_id,
      role: row.role as "owner" | "member",
      joinedAt: row.created_at,
    }));
  }
}

export class DrizzleMemberShareRepo implements MemberShareRepo {
  async list(workspaceId: string): Promise<MemberShareDTO[]> {
    const r = await withInfraTx(async (tx) => {
      const result = await tx.execute<{
        workspace_id: string;
        user_id: string;
        percentage: string;
        updated_at: Date;
      }>(
        sql`SELECT workspace_id, user_id, percentage, updated_at
            FROM tenancy.shared_workspace_member_shares WHERE workspace_id = ${workspaceId}`,
      );
      return result.rows;
    });
    if (r.isErr()) throw r.error;
    return r.value.map((row) => ({
      workspaceId: row.workspace_id,
      userId: row.user_id,
      percentage: row.percentage,
      updatedAt: row.updated_at,
    }));
  }

  async update(
    workspaceId: string,
    shares: { userId: string; percentage: string }[],
    actorUserId: string,
  ): Promise<void> {
    const tid = TenantId(workspaceId);
    const aid = UserId(actorUserId);
    const r = await withTenantTx(tid, aid, async (tx) => {
      // Validate sum=100 in domain first (defense in depth; trigger is the second wall)
      const v = validateShares(shares);
      if (v.isErr()) throw v.error;

      // Snapshot before
      const before = await tx.execute(
        sql`SELECT user_id, percentage FROM tenancy.shared_workspace_member_shares WHERE workspace_id = ${workspaceId}`,
      );

      // Replace all rows for this workspace
      await tx.execute(
        sql`DELETE FROM tenancy.shared_workspace_member_shares WHERE workspace_id = ${workspaceId}`,
      );
      for (const s of shares) {
        await tx.execute(
          sql`INSERT INTO tenancy.shared_workspace_member_shares (workspace_id, user_id, percentage)
              VALUES (${workspaceId}, ${s.userId}, ${s.percentage})`,
        );
      }

      // Audit
      await writeAudit(tx, {
        tenantId: tid,
        entityType: "shared_workspace_member_shares",
        entityId: workspaceId,
        action: "update",
        actorUserId: aid,
        before: before.rows,
        after: shares,
      });

      // Outbox SharesUpdated event
      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "workspace",
        aggregateId: workspaceId,
        eventType: "tenancy.shares.updated",
        payload: { shares, actorUserId },
      });
    });
    if (r.isErr()) throw r.error;
  }
}
