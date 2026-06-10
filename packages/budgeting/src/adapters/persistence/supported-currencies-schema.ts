import { integer, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { budgeting } from "@budget/platform";

/** Reference data — no RLS. GRANTs in apps/migrator/post-migration.sql. */
export const supportedCurrencies = budgeting.table("supported_currencies", {
  isoCode: varchar("iso_code", { length: 10 }).primaryKey(), // varchar(10): fiat ISO-4217 (3) + crypto (4-5 chars)
  isoNumeric: integer("iso_numeric"),
  name: text("name").notNull(),
  symbol: text("symbol"),
  kind: text("kind").notNull(), // 'FIAT' | 'CRYPTO'
  provider: text("provider").notNull(), // 'frankfurter' | 'internal'
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
