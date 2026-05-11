/**
 * categories-schema.ts — Drizzle schema for budgeting.categories
 * RLS via pgPolicy. FORCE RLS + one-level trigger in post-migration.sql.
 * No domain imports — adapters only.
 *
 * v1.1 changes (migration 0012):
 *   - DROP scope column (D-13: redundant with budget-level visibility)
 *   - ADD sort_index INTEGER NOT NULL DEFAULT 0 (MIG-07; UI drag-reorder in Phase 4)
 */
import { sql } from "drizzle-orm";
import { pgPolicy, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";

export const categories = budgeting.table(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    parentId: uuid("parent_id"),
    // scope column DROPPED in v1.1 (D-13): visibility is budget-level, not per-category
    sortIndex: integer("sort_index").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
  },
  (t) => [
    pgPolicy("categories_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
