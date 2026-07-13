/**
 * budget-wealth-snapshots-schema.ts — Drizzle schema for budgeting.budget_wealth_snapshots
 * Per-budget wealth aggregate, one row per ≤3h tick (D-04). RLS via pgPolicy;
 * FORCE RLS in post-migration.sql. No domain imports — adapters only.
 *
 * Stores ONLY the aggregate totals (capitalization + investment value, in the
 * budget default_currency) — NO per-asset price/FX/quantity/cost-basis history (D-17).
 * The FK to tenancy.budgets and the date_trunc('hour', captured_at) bucket UNIQUE
 * index live in the hand-authored migration (Drizzle can't express a date_trunc
 * index); this file exists for the TYPES + the RLS policy.
 */
import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  char,
  bigint,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";

export const budgetWealthSnapshots = budgeting.table(
  "budget_wealth_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    budgetId: uuid("budget_id").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    capitalizationCents: bigint("capitalization_cents", {
      mode: "bigint",
    }).notNull(),
    investmentValueCents: bigint("investment_value_cents", {
      mode: "bigint",
    }).notNull(),
    // 0062: investments cost basis (Σ buy_price × qty, FX→budget ccy) at capture
    // time, so P/L (value − cost) is trackable over time. Nullable (legacy rows
    // backfilled to the current cost basis).
    investmentCostBasisCents: bigint("investment_cost_basis_cents", {
      mode: "bigint",
    }),
    currency: char("currency", { length: 3 }).notNull(),
  },
  (t) => [
    index("budget_wealth_snapshots_series_idx").on(t.budgetId, t.capturedAt),
    pgPolicy("budget_wealth_snapshots_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
