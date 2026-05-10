/**
 * categories-schema.ts — Drizzle schema for budgeting.categories
 * RLS via pgPolicy. FORCE RLS + one-level trigger in post-migration.sql.
 * No domain imports — adapters only.
 */
import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  text,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";

export const categories = budgeting.table(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    parentId: uuid("parent_id"),
    scope: text("scope").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
  },
  (t) => [
    check("categories_scope_chk", sql`${t.scope} IN ('PERSONAL','SHARED')`),
    pgPolicy("categories_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
