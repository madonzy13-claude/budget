/**
 * category-share-overrides-schema.ts — Drizzle schema for budgeting.category_share_overrides
 * Composite PK (category_id, user_id). Denormalized tenant_id for simple RLS.
 * Sum-100 DEFERRABLE constraint trigger in post-migration.sql (BDGT-08).
 */
import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  numeric,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";

export const categoryShareOverrides = budgeting.table(
  "category_share_overrides",
  {
    categoryId: uuid("category_id").notNull(),
    userId: uuid("user_id").notNull(),
    tenantId: uuid("tenant_id").notNull(), // denormalized for simple RLS
    percentage: numeric("percentage", { precision: 7, scale: 4 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.categoryId, t.userId] }),
    pgPolicy("category_share_overrides_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
