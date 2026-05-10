/**
 * workspace-budget-mode-history-schema.ts — Drizzle schema for budgeting.workspace_budget_mode_history
 * Effective-dated SCD-2 per D-04-e. Partial unique index in post-migration.sql.
 * Tracks NORMAL|CUSHION mode per workspace over time.
 */
import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  text,
  date,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";

export const workspaceBudgetModeHistory = budgeting.table(
  "workspace_budget_mode_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    mode: text("mode").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    actorUserId: uuid("actor_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("workspace_budget_mode_chk", sql`${t.mode} IN ('NORMAL','CUSHION')`),
    pgPolicy("workspace_budget_mode_history_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
