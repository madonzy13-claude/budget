/**
 * instruments-schema.ts — Drizzle schema for budgeting.instruments (NEW in Phase 9).
 * Reference data — NO RLS (shared, non-tenant). GRANTs in apps/migrator/post-migration.sql.
 * UNIQUE(symbol,provider) + GIN trigram index are created in migration 0038.
 * No domain imports — adapters only.
 */
import { sql } from "drizzle-orm";
import { uuid, text, boolean, timestamp, check } from "drizzle-orm/pg-core";
import { budgeting } from "@budget/platform";

export const instruments = budgeting.table(
  "instruments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: text("symbol").notNull(),
    displayName: text("display_name").notNull(),
    provider: text("provider").notNull(),
    // asset_class CHECK enforced below (INV-04, 9 locked values).
    assetClass: text("asset_class").notNull(),
    quoteCurrency: text("quote_currency"),
    active: boolean("active").notNull().default(true),
    // refresh_cadence gates the hourly vs daily price-refresh jobs (Pitfall 3).
    refreshCadence: text("refresh_cadence").notNull().default("hourly"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "instruments_asset_class_chk",
      sql`${t.assetClass} IN ('equities','etf','bond','crypto','reit','commodity','cash_fx','real_estate','other')`,
    ),
    check(
      "instruments_refresh_cadence_chk",
      sql`${t.refreshCadence} IN ('hourly','daily')`,
    ),
  ],
);
