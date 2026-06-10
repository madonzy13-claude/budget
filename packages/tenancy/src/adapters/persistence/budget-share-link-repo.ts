// This file MUST NOT be imported directly by domain/application/ports layers.
// Apps use createTenancyModule() from contracts/factory.ts (PC-02, PC-15).
import { sql } from "drizzle-orm";
import { withTenantTx, withInfraTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type {
  BudgetShareLink,
  BudgetShareLinkRepo,
} from "../../ports/budget-share-link-repo";

function rowToLink(row: {
  id: string;
  budget_id: string;
  tenant_id: string;
  token: string;
  created_by: string;
  expires_at: Date;
  revoked_at: Date | null;
  accepted_by: string | null;
  accepted_at: Date | null;
  created_at: Date;
}): BudgetShareLink {
  return {
    id: row.id,
    budgetId: row.budget_id,
    tenantId: row.tenant_id,
    token: row.token,
    createdBy: row.created_by,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    acceptedBy: row.accepted_by,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
  };
}

export class DrizzleBudgetShareLinkRepo implements BudgetShareLinkRepo {
  /** Inserts under withTenantTx (RLS-scoped). */
  async create(input: {
    budgetId: string;
    tenantId: string;
    createdBy: string;
    token: string;
    expiresAt: Date;
  }): Promise<BudgetShareLink> {
    const r = await withTenantTx(
      TenantId(input.tenantId),
      UserId(input.createdBy),
      async (tx) => {
        const result = await tx.execute<{
          id: string;
          budget_id: string;
          tenant_id: string;
          token: string;
          created_by: string;
          expires_at: Date;
          revoked_at: Date | null;
          accepted_by: string | null;
          accepted_at: Date | null;
          created_at: Date;
        }>(
          sql`INSERT INTO tenancy.budget_share_links
                (id, budget_id, tenant_id, token, created_by, expires_at, created_at)
              VALUES (gen_random_uuid(), ${input.budgetId}::uuid, ${input.tenantId}::uuid,
                      ${input.token}, ${input.createdBy}::uuid, ${input.expiresAt}, now())
              RETURNING id, budget_id, tenant_id, token, created_by, expires_at,
                        revoked_at, accepted_by, accepted_at, created_at`,
        );
        return result.rows[0]!;
      },
    );
    if (r.isErr()) throw r.error;
    return rowToLink(r.value);
  }

  /**
   * Looks up by id WITHOUT tenant context (used by revokeShareLink to get budgetId).
   * Uses withInfraTx — worker_role has SELECT via budget_share_links_worker_public_resolve policy.
   */
  async findById(id: string): Promise<BudgetShareLink | null> {
    const r = await withInfraTx(async (tx) => {
      const result = await tx.execute<{
        id: string;
        budget_id: string;
        tenant_id: string;
        token: string;
        created_by: string;
        expires_at: Date;
        revoked_at: Date | null;
        accepted_by: string | null;
        accepted_at: Date | null;
        created_at: Date;
      }>(
        sql`SELECT id, budget_id, tenant_id, token, created_by, expires_at,
                   revoked_at, accepted_by, accepted_at, created_at
            FROM tenancy.budget_share_links
            WHERE id = ${id}::uuid
            LIMIT 1`,
      );
      return result.rows[0] ?? null;
    });
    if (r.isErr()) throw r.error;
    if (!r.value) return null;
    return rowToLink(r.value);
  }

  /**
   * Looks up by token WITHOUT tenant context (public resolve).
   * Uses withInfraTx — pre-auth recipient has no tenant context.
   * Token IS the credential (T-02-05).
   */
  async findByToken(token: string): Promise<BudgetShareLink | null> {
    const r = await withInfraTx(async (tx) => {
      const result = await tx.execute<{
        id: string;
        budget_id: string;
        tenant_id: string;
        token: string;
        created_by: string;
        expires_at: Date;
        revoked_at: Date | null;
        accepted_by: string | null;
        accepted_at: Date | null;
        created_at: Date;
      }>(
        sql`SELECT id, budget_id, tenant_id, token, created_by, expires_at,
                   revoked_at, accepted_by, accepted_at, created_at
            FROM tenancy.budget_share_links
            WHERE token = ${token}
            LIMIT 1`,
      );
      return result.rows[0] ?? null;
    });
    if (r.isErr()) throw r.error;
    if (!r.value) return null;
    return rowToLink(r.value);
  }

  /**
   * Updates accepted_by + accepted_at under withTenantTx (using the link's own tenant_id).
   * Defense-in-depth WHERE clause prevents race-condition double-accept (T-02-06).
   * tenantId = link.budgetId (v1.1: budget_id === tenant_id).
   * acceptingUserId is used as the actor for audit purposes.
   */
  async accept(id: string, tenantId: string, acceptingUserId: string): Promise<void> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(acceptingUserId),
      async (tx) => {
        const result = await tx.execute<{ id: string }>(
          sql`UPDATE tenancy.budget_share_links
              SET accepted_by = ${acceptingUserId}::uuid,
                  accepted_at = now()
              WHERE id = ${id}::uuid
                AND accepted_by IS NULL
                AND revoked_at IS NULL
                AND expires_at > now()
              RETURNING id`,
        );
        return result.rows[0] ?? null;
      },
    );
    if (r.isErr()) throw r.error;
    if (!r.value) {
      // Re-fetch to provide a meaningful error (race or already used)
      const refetch = await withInfraTx(async (tx) => {
        const result = await tx.execute<{
          revoked_at: Date | null;
          accepted_by: string | null;
          expires_at: Date;
        }>(
          sql`SELECT revoked_at, accepted_by, expires_at
              FROM tenancy.budget_share_links WHERE id = ${id}::uuid LIMIT 1`,
        );
        return result.rows[0] ?? null;
      });
      if (refetch.isErr()) throw refetch.error;
      const row = refetch.value;
      if (!row) throw new Error("NotFound");
      if (row.revoked_at) throw new Error("Revoked");
      if (new Date(row.expires_at as string | Date) <= new Date()) throw new Error("Expired");
      if (row.accepted_by) throw new Error("AlreadyUsed");
      throw new Error("AlreadyUsed");
    }
  }

  /**
   * Updates revoked_at under withTenantTx (uses link's own tenant_id).
   * Owner-role assertion is done in revokeShareLink application service before this call.
   * tenantId is resolved by the service via findById (public resolve path).
   */
  async revoke(id: string, tenantId: string, userId: string): Promise<void> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(userId),
      async (tx) => {
        await tx.execute(
          sql`UPDATE tenancy.budget_share_links
              SET revoked_at = now()
              WHERE id = ${id}::uuid
                AND tenant_id = ${tenantId}::uuid`,
        );
      },
    );
    if (r.isErr()) throw r.error;
  }

  /** Lists active links for owner UI (Phase 6). */
  async listForBudget(
    budgetId: string,
    tenantId: string,
  ): Promise<BudgetShareLink[]> {
    const userId = tenantId; // budget_id === tenant_id in v1.1
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(userId),
      async (tx) => {
        const result = await tx.execute<{
          id: string;
          budget_id: string;
          tenant_id: string;
          token: string;
          created_by: string;
          expires_at: Date;
          revoked_at: Date | null;
          accepted_by: string | null;
          accepted_at: Date | null;
          created_at: Date;
        }>(
          sql`SELECT id, budget_id, tenant_id, token, created_by, expires_at,
                     revoked_at, accepted_by, accepted_at, created_at
              FROM tenancy.budget_share_links
              WHERE budget_id = ${budgetId}::uuid
              ORDER BY created_at DESC`,
        );
        return result.rows;
      },
    );
    if (r.isErr()) throw r.error;
    return r.value.map(rowToLink);
  }
}
