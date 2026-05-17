/**
 * categories-repo.ts — Drizzle adapter for CategoriesRepo port.
 * MUST NOT be imported by domain/application layers (dep-cruiser).
 * Each write: withTenantTx → SELECT before → UPDATE → writeAudit → writeOutbox.
 * Pattern: mirrors wallet-repo.ts setBalance (lines 203-261) / rename-category shape.
 * Plan 05-02.
 */
import { sql } from "drizzle-orm";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { CategoriesRepo } from "../../ports/categories-repo";

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
}
