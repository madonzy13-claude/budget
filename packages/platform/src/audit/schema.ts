import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  text,
  jsonb,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sharedKernel } from "../db/schemas";
import { appRole, workerRole } from "../db/roles";

export const auditAction = pgEnum("audit_action", [
  "create",
  "update",
  "delete",
]);

export const auditHistory = sharedKernel.table(
  "audit_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: auditAction("action").notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    beforeJsonb: jsonb("before_jsonb"),
    afterJsonb: jsonb("after_jsonb"),
  },
  (t) => [
    pgPolicy("audit_history_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
