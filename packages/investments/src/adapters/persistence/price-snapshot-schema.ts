/**
 * price-snapshot-schema.ts — Drizzle schema for budgeting.instrument_price_snapshots (Phase 9).
 * Reference data — NO RLS. GRANTs in apps/migrator/post-migration.sql.
 * Daily historical price points per instrument (composite PK = instrument_id + snapshot_date).
 * No domain imports — adapters only.
 */
import { uuid, date, numeric, char, primaryKey } from "drizzle-orm/pg-core";
import { budgeting } from "@budget/platform";

export const instrumentPriceSnapshots = budgeting.table(
  "instrument_price_snapshots",
  {
    instrumentId: uuid("instrument_id").notNull(),
    snapshotDate: date("snapshot_date").notNull(),
    price: numeric("price", { precision: 28, scale: 8 }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.instrumentId, t.snapshotDate] })],
);
