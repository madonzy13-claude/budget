import { sql } from "drizzle-orm";
import { withInfraTx } from "../db/tx";
import { tenantContextSql } from "../db/rls";
import { eventBus } from "../events/bus";
import { TenantId, UserId } from "@budget/shared-kernel";

/** PC-08 system principal — outbox dispatcher's app.current_user_id placeholder. */
const OUTBOX_SYSTEM_USER = UserId("00000000-0000-0000-0000-00000000fafe");

type OutboxRow = {
  id: string;
  tenant_id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload_jsonb: unknown;
};

export async function dispatchOutboxBatch(): Promise<number> {
  // PC-04: use withInfraTx (infrastructure carve-out) — never workerDb().transaction directly
  const r = await withInfraTx(async (tx) => {
    const sel = await tx.execute(sql`
      SELECT id, tenant_id, aggregate_type, aggregate_id, event_type, payload_jsonb
      FROM shared_kernel.outbox
      WHERE dispatched_at IS NULL
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 100
    `);
    const rows = sel.rows as OutboxRow[];
    for (const row of rows) {
      // PC-08: scope in-process handlers to the row's tenant before publish
      for (const stmt of tenantContextSql(
        [TenantId(row.tenant_id)],
        OUTBOX_SYSTEM_USER,
      )) {
        await tx.execute(stmt);
      }
      await eventBus.publish({
        tenantId: row.tenant_id,
        aggregateType: row.aggregate_type,
        aggregateId: row.aggregate_id,
        eventType: row.event_type,
        payload: row.payload_jsonb,
      });
      await tx.execute(
        sql`UPDATE shared_kernel.outbox SET dispatched_at = now() WHERE id = ${row.id}`,
      );
    }
    return rows.length;
  });
  if (r.isErr()) throw r.error;
  return r.value;
}
