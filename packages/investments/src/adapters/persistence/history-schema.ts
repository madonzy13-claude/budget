/**
 * history-schema.ts — Drizzle mirror of budgeting.investment_history (Phase 13).
 * Types + RLS policy only; FKs (budget → tenancy.budgets, holding →
 * budgeting.investments, both ON DELETE CASCADE) are authored in 0087.
 *
 * One row per change to a holding. An entry's TYPE is its holding's current
 * ui_type (join) — there is deliberately no type/group column.
 */
import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  text,
  char,
  numeric,
  bigint,
  timestamp,
  date,
  check,
  boolean,
} from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";

export const investmentHistory = budgeting.table(
  "investment_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    budgetId: uuid("budget_id").notNull(),
    holdingId: uuid("holding_id").notNull(),
    kind: text("kind").notNull(),
    effectiveDate: date("effective_date").notNull(),
    amountCents: bigint("amount_cents", { mode: "bigint" }),
    amountCurrency: char("amount_currency", { length: 3 }),
    qtyDelta: numeric("qty_delta", { precision: 28, scale: 8 }),
    costDeltaCents: bigint("cost_delta_cents", { mode: "bigint" })
      .notNull()
      .default(0n),
    costCurrency: char("cost_currency", { length: 3 }),
    flowCents: bigint("flow_cents", { mode: "bigint" }).notNull().default(0n),
    flowCurrency: char("flow_currency", { length: 3 }),
    soldCostBudgetCents: bigint("sold_cost_budget_cents", { mode: "bigint" }),
    realizedBudgetCents: bigint("realized_budget_cents", { mode: "bigint" }),
    /** R6-2: the amount in the asset's own currency fixed at the deal. */
    assetAmountCents: bigint("asset_amount_cents", { mode: "bigint" }),
    /** R6: the user's note on a sale out of investments (≤ 200 chars). */
    note: text("note"),
    budgetCurrency: char("budget_currency", { length: 3 }),
    valueDeltaCents: bigint("value_delta_cents", { mode: "bigint" })
      .notNull()
      .default(0n),
    priorPrincipalCents: bigint("prior_principal_cents", { mode: "bigint" }),
    priorStartDate: date("prior_start_date"),
    transferId: uuid("transfer_id"),
    // 0088 (Phase 13.1): sell → wallet link (D-20/D-21), prior price snapshot
    // for value/price undo (D-18), D-35 backfill marker.
    walletId: uuid("wallet_id"),
    walletDeltaNumeric: numeric("wallet_delta_numeric", {
      precision: 19,
      scale: 4,
    }),
    walletCreated: boolean("wallet_created").notNull().default(false),
    priorPriceCents: numeric("prior_price_cents", { precision: 24, scale: 6 }),
    priorPriceCurrency: char("prior_price_currency", { length: 3 }),
    backfilled: boolean("backfilled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    check(
      "investment_history_kind_chk",
      sql`${t.kind} IN ('start','buy','add','value_change','withdraw','convert_out','convert_in','transfer_out','transfer_in','price_change')`,
    ),
    pgPolicy("investment_history_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
