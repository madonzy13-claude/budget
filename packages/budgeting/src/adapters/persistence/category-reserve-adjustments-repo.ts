/**
 * category-reserve-adjustments-repo.ts — Drizzle adapter for CategoryReserveAdjustmentsRepo.
 * Append-only: INSERT + paginated SELECT only. No UPDATE/DELETE (D-PH5-R8, T-05-07).
 * Each write: withTenantTx → INSERT → writeAudit → writeOutbox.
 * Pattern: mirrors wallet-repo.ts create() (lines 39-83).
 * Plan 05-02.
 */
import { sql } from "drizzle-orm";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId, serverNow } from "@budget/shared-kernel";
import type {
  CategoryReserveAdjustmentsRepo,
  CategoryReserveAdjustmentRow,
} from "../../ports/category-reserve-adjustments-repo";

export class DrizzleCategoryReserveAdjustmentsRepo implements CategoryReserveAdjustmentsRepo {
  async create(input: {
    tenantId: string;
    categoryId: string;
    deltaCents: bigint;
    note?: string | null;
    actorUserId: string;
  }): Promise<{ id: string; occurredAt: Date }> {
    const tid = TenantId(input.tenantId);
    const uid = UserId(input.actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      const result = await tx.execute<{ id: string; occurred_at: Date }>(
        // occurred_at = serverNow() (= real now() when the test clock is off, so
        // identical to the DB default; the gated test clock can move it to drive a
        // multi-month timeline). occurred_at's month is the adjust's asOf month.
        sql`INSERT INTO budgeting.category_reserve_adjustments
              (tenant_id, category_id, delta_cents, note, created_by, occurred_at)
            VALUES
              (${input.tenantId}::uuid, ${input.categoryId}::uuid,
               ${input.deltaCents.toString()}::bigint,
               ${input.note ?? null},
               ${input.actorUserId}::uuid,
               ${serverNow().toISOString()}::timestamptz)
            RETURNING id, occurred_at`,
      );

      const rows = (result as any).rows ?? result;
      const row = rows[0];
      if (!row) throw new Error("INSERT returned no rows");

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "category_reserve_adjustment",
        entityId: row.id,
        action: "create",
        actorUserId: uid,
        before: null,
        after: {
          deltaCents: input.deltaCents.toString(),
          categoryId: input.categoryId,
          note: input.note ?? null,
        },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "category_reserve_adjustment",
        aggregateId: row.id,
        eventType: "budgeting.reserve.adjusted",
        payload: {
          categoryId: input.categoryId,
          deltaCents: input.deltaCents.toString(),
          note: input.note ?? null,
          actorUserId: input.actorUserId,
        },
      });

      return { id: row.id as string, occurredAt: new Date(row.occurred_at) };
    });

    if (r.isErr()) throw r.error;
    return r.value;
  }

  async listForCategory(
    tenantId: string,
    categoryId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<CategoryReserveAdjustmentRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId); // placeholder for read-only op

    const r = await withTenantTx(tid, uid, async (tx) => {
      const result = await tx.execute<{
        id: string;
        tenant_id: string;
        category_id: string;
        delta_cents: string;
        note: string | null;
        created_by: string | null;
        occurred_at: Date;
      }>(
        sql`SELECT id, tenant_id, category_id, delta_cents::text, note, created_by, occurred_at
            FROM budgeting.category_reserve_adjustments
            WHERE tenant_id = ${tenantId}::uuid
              AND category_id = ${categoryId}::uuid
            ORDER BY occurred_at DESC
            LIMIT ${limit}
            OFFSET ${offset}`,
      );
      return (result as any).rows ?? result;
    });

    if (r.isErr()) throw r.error;
    return r.value.map(
      (row: {
        id: string;
        tenant_id: string;
        category_id: string;
        delta_cents: string;
        note: string | null;
        created_by: string | null;
        occurred_at: Date;
      }): CategoryReserveAdjustmentRow => ({
        id: row.id,
        tenantId: row.tenant_id,
        categoryId: row.category_id,
        deltaCents: BigInt(row.delta_cents),
        note: row.note,
        createdBy: row.created_by,
        occurredAt: new Date(row.occurred_at),
      }),
    );
  }
}
