import { sql } from "drizzle-orm";
import {
  uuid,
  text,
  boolean,
  timestamp,
  pgPolicy,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sharedKernel } from "../db/schemas";
import { appRole, workerRole } from "../db/roles";

export const pushSubscriptions = sharedKernel.table(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id").notNull(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    locale: text("locale").notNull().default("en"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    pgPolicy("push_subscriptions_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);

export const notificationPrefs = sharedKernel.table(
  "notification_prefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id").notNull(),
    budgetId: uuid("budget_id").notNull(),
    notificationType: text("notification_type").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    pgPolicy("notification_prefs_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
    uniqueIndex("notification_prefs_user_budget_type_uq").on(
      t.userId,
      t.budgetId,
      t.notificationType,
    ),
  ],
);
