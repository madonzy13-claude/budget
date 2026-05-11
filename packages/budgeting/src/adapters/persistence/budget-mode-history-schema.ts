/**
 * budget-mode-history-schema.ts — Drizzle schema for budgeting.budget_mode_history
 * (renamed from workspace_budget_mode_history in v1.1 migration 0012)
 * Effective-dated SCD-2 per D-04-e. Partial unique index in post-migration.sql.
 * Tracks NORMAL|CUSHION mode per budget over time.
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

export const budgetModeHistory = budgeting.table(
  "budget_mode_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    budgetId: uuid("budget_id").notNull(),
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
    check("budget_mode_chk", sql`${t.mode} IN ('NORMAL','CUSHION')`),
    pgPolicy("budget_mode_history_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);

// Backward-compat alias so code referencing old export name still compiles during
// the Plan 01-01 → 01-02 transition. Plan 01-02 removes this alias.
/** @deprecated use `budgetModeHistory` */
export const workspaceBudgetModeHistory = budgetModeHistory;
