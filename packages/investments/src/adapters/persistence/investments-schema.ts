/**
 * investments-schema.ts — Drizzle schema for budgeting.investments (NEW in Phase 9).
 * Tenant-scoped holdings table. RLS via pgPolicy; FORCE RLS in post-migration.sql.
 * No domain imports — adapters only.
 *
 * Money is stored as bigint cents (mode:"bigint"); quantity as numeric(28,8) for
 * fractional shares/crypto. FK enforcement (budget_id → tenancy.budgets ON DELETE
 * CASCADE, instrument_id → budgeting.instruments) is authored in migration 0038 —
 * this Drizzle file exists for TYPES + the RLS policy, mirroring wallets-schema.ts.
 */
import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  text,
  char,
  numeric,
  bigint,
  integer,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";

export const investments = budgeting.table(
  "investments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    budgetId: uuid("budget_id").notNull(),
    // NULL = custom/cash holding (no tracked instrument).
    instrumentId: uuid("instrument_id"),
    name: text("name").notNull(),
    // holding_type CHECK enforced below (INV-04, 9 locked values).
    holdingType: text("holding_type").notNull(),
    // Optional user-defined grouping label within the Investments section.
    groupName: text("group_name"),
    buyPriceCents: bigint("buy_price_cents", { mode: "bigint" }),
    buyCurrency: char("buy_currency", { length: 3 }),
    quantity: numeric("quantity", { precision: 28, scale: 8 }).notNull(),
    currentPriceCents: bigint("current_price_cents", { mode: "bigint" }),
    currentPriceCurrency: char("current_price_currency", { length: 3 }),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "investments_holding_type_chk",
      sql`${t.holdingType} IN ('equities','etf','bond','crypto','reit','commodity','cash_fx','real_estate','other')`,
    ),
    pgPolicy("investments_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
