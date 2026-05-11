import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  numeric,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import { tenancy, appRole, workerRole } from "@budget/platform";
import { budgets } from "./schema";

/** D-06, TENT-13: per-member contribution shares (storage only Phase 1; math Phase 2/4).
 * v1.1 (migration 0012): table renamed shared_workspace_member_shares → shared_budget_member_shares,
 * column workspace_id → budget_id.
 */
export const sharedBudgetMemberShares = tenancy.table(
  "shared_budget_member_shares",
  {
    budgetId: uuid("budget_id")
      .notNull()
      .references(() => budgets.id),
    userId: uuid("user_id").notNull(),
    percentage: numeric("percentage", { precision: 5, scale: 2 })
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
    primaryKey({ columns: [t.budgetId, t.userId] }),
    pgPolicy("shares_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.budgetId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.budgetId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);

// Backward-compat alias — Plan 01-02 removes this.
/** @deprecated use `sharedBudgetMemberShares` */
export const sharedWorkspaceMemberShares = sharedBudgetMemberShares;
