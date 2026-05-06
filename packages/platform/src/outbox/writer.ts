import { sql, type SQLWrapper } from "drizzle-orm";
import type { TenantId } from "@budget/shared-kernel";

export interface OutboxEvent {
  tenantId: TenantId;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
}

export async function writeOutbox(
  tx: { execute: (q: string | SQLWrapper) => Promise<unknown> },
  evt: OutboxEvent,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO shared_kernel.outbox (tenant_id, aggregate_type, aggregate_id, event_type, payload_jsonb)
    VALUES (${evt.tenantId}, ${evt.aggregateType}, ${evt.aggregateId}, ${evt.eventType}, ${JSON.stringify(evt.payload)}::jsonb)
  `);
}
