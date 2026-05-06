import { uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { sharedKernel } from "../db/schemas";

/**
 * D-25: Transactional outbox table.
 * Pitfall 10: NO pgPolicy — this is infrastructure, not domain.
 * Access control is GRANT-based (post-migration.sql):
 *   app_role: INSERT only
 *   worker_role: SELECT, UPDATE only
 */
export const outbox = sharedKernel.table("outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: text("aggregate_id").notNull(),
  eventType: text("event_type").notNull(),
  payloadJsonb: jsonb("payload_jsonb").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
});
