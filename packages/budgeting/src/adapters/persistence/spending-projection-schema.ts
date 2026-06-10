/**
 * spending-projection-schema.ts — Drizzle schema for budgeting.spending_by_category_month
 * ENGR-14: synchronous projection, upserted in same withTenantTx as ledger INSERT.
 * RLS via pgPolicy. FORCE RLS in post-migration.sql.
 */
import { sql } from "drizzle-orm";
import {
  pgPolicy,
  primaryKey,
  uuid,
  date,
  numeric,
  char,
  timestamp,
} from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";

export const spendingByCategoryMonth = budgeting.table(
  "spending_by_category_month",
  {
    tenantId: uuid("tenant_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    categoryId: uuid("category_id").notNull(),
    monthStartDate: date("month_start_date").notNull(),
    normalAmount: numeric("normal_amount", { precision: 19, scale: 4 })
      .notNull()
      .default("0"),
    cushionAmount: numeric("cushion_amount", { precision: 19, scale: 4 })
      .notNull()
      .default("0"),
    currency: char("currency", { length: 3 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.categoryId, t.monthStartDate] }),
    pgPolicy("spending_projection_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
