/**
 * categories-repo.ts — Drizzle adapter for CategoriesRepo port.
 * MUST NOT be imported by domain/application layers (dep-cruiser).
 * Each write: withTenantTx → SELECT before → UPDATE → writeAudit → writeOutbox.
 * Pattern: mirrors wallet-repo.ts setBalance (lines 203-261) / rename-category shape.
 * Plan 05-02 (setReserveExcluded).
 * Plan 05-03 (findById, list — read helpers for use-case guards, use withTenantTx
 *   so they run on DATABASE_URL_APP pool, not the worker pool, matching test setup).
 */
import { sql } from "drizzle-orm";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
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
   * Uses withTenantTx (DATABASE_URL_APP pool) — same pool as integration tests.
   * Explicit tenant_id predicate enforces cross-tenant isolation (RLS also active).
   * Returns null when not found.
   */
  async findById(
    tenantId: string,
    categoryId: string,
  ): Promise<CategoryRow | null> {
    const tid = TenantId(tenantId);
    const uid = UserId("system");
    const r = await withTenantTx(tid, uid, async (tx) => {
      const result = await tx.execute<{
        id: string;
        name: string;
        reserve_excluded: boolean;
        archived_at: Date | null;
        sort_index: number;
        reserve_actual_cents: string | number | bigint;
      }>(
        sql`SELECT id, name, reserve_excluded, archived_at, sort_index, reserve_actual_cents
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
      sortIndex: Number(row.sort_index ?? 0),
      reserveActualCents: BigInt(row.reserve_actual_cents ?? 0),
    };
  }

  /**
   * List all non-archived categories for the given tenant.
   * Returns both Active (reserveExcluded=false) and Excluded (reserveExcluded=true)
   * categories — callers partition by reserveExcluded.
   */
  async list(tenantId: string): Promise<CategoryRow[]> {
    const tid = TenantId(tenantId);
    const uid = UserId("system");
    const r = await withTenantTx(tid, uid, async (tx) => {
      const result = await tx.execute<{
        id: string;
        name: string;
        reserve_excluded: boolean;
        archived_at: Date | null;
        sort_index: number;
        reserve_actual_cents: string | number | bigint;
      }>(
        sql`SELECT id, name, reserve_excluded, archived_at, sort_index, reserve_actual_cents
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
        sort_index: number;
        reserve_actual_cents: string | number | bigint;
      }) => ({
        id: row.id,
        name: row.name,
        reserveExcluded: row.reserve_excluded,
        archivedAt: row.archived_at ? new Date(row.archived_at) : null,
        sortIndex: Number(row.sort_index ?? 0),
        reserveActualCents: BigInt(row.reserve_actual_cents ?? 0),
      }),
    );
  }

  /**
   * UAT-PH5-T3-54: bulk-write `reserve_actual_cents` for many categories.
   * Reads before-state once, UPDATEs each row, then writes one audit + one
   * outbox entry per CHANGED row. Skips rows where new === old.
   * Single withTenantTx → all-or-nothing.
   */
  async setReserveActualMany(
    tenantId: string,
    updates: Map<string, bigint>,
    actorUserId: string,
  ): Promise<void> {
    if (updates.size === 0) return;
    const tid = TenantId(tenantId);
    const uid = UserId(actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      const ids = Array.from(updates.keys());

      // SELECT before state for all affected rows.
      const before = await tx.execute<{
        id: string;
        reserve_actual_cents: string | number | bigint;
      }>(
        sql`SELECT id, reserve_actual_cents
            FROM budgeting.categories
            WHERE tenant_id = ${tenantId}::uuid
              AND id = ANY(${sql.raw(`ARRAY[${ids.map((i) => `'${i}'`).join(",")}]::uuid[]`)})`,
      );
      const beforeRows = ((before as any).rows ?? before) as {
        id: string;
        reserve_actual_cents: string | number | bigint;
      }[];
      const beforeMap = new Map<string, bigint>();
      for (const row of beforeRows) {
        beforeMap.set(row.id, BigInt(row.reserve_actual_cents ?? 0));
      }
      for (const id of ids) {
        if (!beforeMap.has(id)) {
          throw new Error(`category ${id} not found`);
        }
      }

      // Apply each UPDATE individually for predictability + audit clarity.
      for (const [id, newCents] of updates) {
        const oldCents = beforeMap.get(id)!;
        if (oldCents === newCents) continue;
        await tx.execute(
          sql`UPDATE budgeting.categories
              SET reserve_actual_cents = ${newCents.toString()}::bigint
              WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid`,
        );
        await writeAudit(tx, {
          tenantId: tid,
          entityType: "category",
          entityId: id,
          action: "update",
          actorUserId: uid,
          before: { reserveActualCents: oldCents.toString() },
          after: { reserveActualCents: newCents.toString() },
        });
        await writeOutbox(tx, {
          tenantId: tid,
          aggregateType: "category",
          aggregateId: id,
          eventType: "budgeting.category.reserve_actual_changed",
          payload: {
            oldCents: oldCents.toString(),
            newCents: newCents.toString(),
            actorUserId,
          },
        });
      }
    });

    if (r.isErr()) throw r.error;
  }
}
