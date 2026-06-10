/**
 * budget-templates-schema.ts — Drizzle schema for budgeting.budget_templates + items
 * RLS via pgPolicy. FORCE RLS in post-migration.sql.
 * Per RESEARCH.md §5.
 */
import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  text,
  bigint,
  char,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";

export const budgetTemplates = budgeting.table(
  "budget_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    pgPolicy("budget_templates_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);

export const budgetTemplateItems = budgeting.table(
  "budget_template_items",
  {
    templateId: uuid("template_id").notNull(),
    categoryId: uuid("category_id").notNull(),
    normalAmount: bigint("normal_amount", { mode: "bigint" }).notNull(),
    normalCurrency: char("normal_currency", { length: 3 }).notNull(),
    cushionAmount: bigint("cushion_amount", { mode: "bigint" }).notNull(),
    cushionCurrency: char("cushion_currency", { length: 3 }).notNull(),
    tenantId: uuid("tenant_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.templateId, t.categoryId] }),
    pgPolicy("budget_template_items_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
