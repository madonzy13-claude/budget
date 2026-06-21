/**
 * price-cache-schema.ts — Drizzle schema for budgeting.instrument_price_cache (Phase 9).
 * Reference data — NO RLS. GRANTs in apps/migrator/post-migration.sql.
 * Latest fetched price per instrument (one row per instrument, PK = instrument_id).
 * No domain imports — adapters only.
 */
import { uuid, numeric, char, timestamp } from "drizzle-orm/pg-core";
import { budgeting } from "@budget/platform";

export const instrumentPriceCache = budgeting.table("instrument_price_cache", {
  instrumentId: uuid("instrument_id").primaryKey(),
  price: numeric("price", { precision: 28, scale: 8 }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
