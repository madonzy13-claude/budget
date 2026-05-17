/**
 * categories-repo.ts — Drizzle adapter for CategoriesRepo port.
 * MUST NOT be imported by domain/application layers (dep-cruiser).
 * Each write: withTenantTx → SELECT before → UPDATE → writeAudit → writeOutbox.
 * Pattern: mirrors wallet-repo.ts setBalance (lines 203-261) / rename-category shape.
 * Plan 05-02 (setReserveExcluded).
 * Plan 05-03 (findById, list — needed by use-case guard lookups).
 */
import { sql } from "drizzle-orm";
import {
  withTenantTx,
  writeAudit,
  writeOutbox,
  withInfraTx,
} from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { CategoriesRepo, CategoryRow } from "../../ports/categories-repo";

export class DrizzleCategoriesRepo implements CategoriesRepo {
  /**
   * Toggle reserve_excluded flag. SELECT before → UPDATE → audit + outbox.
   * Audit: entityType="category", action="update",
   *        before={reserveExcluded: prev}, after={reserveExcluded: excluded}.
   * Outbox: eventType="budgeting.category.reserve_excluded_changed".
   */
  async setReserveExcluded(
    tenantId: string,
    categoryId: string,
    excluded: boolean,
    actorUserId: string,
  ): Promise<void> {
    const tid = TenantId(tenantId);
    const uid = UserId(actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      // SELECT before state
      const before = await tx.execute<{ reserve_excluded: boolean }>(
        sql`SELECT reserve_excluded
            FROM budgeting.categories
            WHERE id = ${categoryId}::uuid AND tenant_id = ${tenantId}::uuid`,
      );
      const beforeRow = (before as any).rows?.[0] ?? (before as any)[0];
      if (!beforeRow) {
        throw new Error("Category not found");
      }
      const prevExcluded: boolean = beforeRow.reserve_excluded;

      // UPDATE
      await tx.execute(
        sql`UPDATE budgeting.categories
            SET reserve_excluded = ${excluded}
            WHERE id = ${categoryId}::uuid AND tenant_id = ${tenantId}::uuid`,
      );

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "category",
        entityId: categoryId,
        action: "update",
        actorUserId: uid,
        before: { reserveExcluded: prevExcluded },
        after: { reserveExcluded: excluded },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "category",
        aggregateId: categoryId,
        eventType: "budgeting.category.reserve_excluded_changed",
        payload: { excluded, actorUserId },
      });
    });

    if (r.isErr()) throw r.error;
  }

  /**
   * Find a single category by id for the given tenant.
   * Uses withInfraTx (BYPASSRLS) so RLS cross-tenant filtering is enforced
   * by the explicit tenant_id predicate — same pattern as reserve-balance-repo.
   * Returns null when not found (RLS or missing row).
   */
  async findById(
    tenantId: string,
    categoryId: string,
  ): Promise<CategoryRow | null> {
    const r = await withInfraTx(async (tx) => {
      const result = await tx.execute<{
        id: string;
        name: string;
        reserve_excluded: boolean;
        archived_at: Date | null;
      }>(
        sql`SELECT id, name, reserve_excluded, archived_at
            FROM budgeting.categories
            WHERE id = ${categoryId}::uuid
              AND tenant_id = ${tenantId}::uuid
            LIMIT 1`,
      );
      const rows = (result as any).rows ?? result;
      return rows[0] ?? null;
    });
    if (r.isErr()) throw r.error;
    if (!r.value) return null;
    const row = r.value;
    return {
      id: row.id,
      name: row.name,
      reserveExcluded: row.reserve_excluded,
      archivedAt: row.archived_at ? new Date(row.archived_at) : null,
    };
  }

  /**
   * List all non-archived categories for the given tenant.
   * Returns both Active (reserveExcluded=false) and Excluded (reserveExcluded=true)
   * categories — callers partition by reserveExcluded.
   */
  async list(tenantId: string): Promise<CategoryRow[]> {
    const r = await withInfraTx(async (tx) => {
      const result = await tx.execute<{
        id: string;
        name: string;
        reserve_excluded: boolean;
        archived_at: Date | null;
      }>(
        sql`SELECT id, name, reserve_excluded, archived_at
            FROM budgeting.categories
            WHERE tenant_id = ${tenantId}::uuid
              AND archived_at IS NULL
            ORDER BY sort_index ASC, created_at ASC`,
      );
      return (result as any).rows ?? result;
    });
    if (r.isErr()) throw r.error;
    return r.value.map(
      (row: {
        id: string;
        name: string;
        reserve_excluded: boolean;
        archived_at: Date | null;
      }) => ({
        id: row.id,
        name: row.name,
        reserveExcluded: row.reserve_excluded,
        archivedAt: row.archived_at ? new Date(row.archived_at) : null,
      }),
    );
  }
}
