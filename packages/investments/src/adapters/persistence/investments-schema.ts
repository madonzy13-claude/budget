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
    // Phase 9.1: user-facing type the add/edit form was filled with (11 values,
    // CHECK below). Disambiguates cases holding_type can't (etb vs treasury_bond
    // → both 'bond'; collectibles → 'other'). Drives the dynamic form on edit.
    uiType: text("ui_type"),
    // Precious-metals attributes (NULL for every other type).
    metal: text("metal"), // gold | silver | platinum | palladium
    metalKind: text("metal_kind"), // coin | bar | other (descriptive)
    unitOfMeasure: text("unit_of_measure"), // g | oz | kg
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
    check(
      "investments_ui_type_chk",
      sql`${t.uiType} IS NULL OR ${t.uiType} IN ('equity','etf','etb','reit','crypto','treasury_bond','collectibles','real_estate','other','precious_metals','cash')`,
    ),
    check(
      "investments_metal_chk",
      sql`${t.metal} IS NULL OR ${t.metal} IN ('gold','silver','platinum','palladium')`,
    ),
    check(
      "investments_metal_kind_chk",
      sql`${t.metalKind} IS NULL OR ${t.metalKind} IN ('coin','bar','other')`,
    ),
    check(
      "investments_uom_chk",
      sql`${t.unitOfMeasure} IS NULL OR ${t.unitOfMeasure} IN ('g','oz','kg')`,
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
