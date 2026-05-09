import { char, integer, text, timestamp } from "drizzle-orm/pg-core";
import { budgeting } from "@budget/platform";

/** Reference data — no RLS. GRANTs in apps/migrator/post-migration.sql. */
export const supportedCurrencies = budgeting.table("supported_currencies", {
  isoCode: char("iso_code", { length: 3 }).primaryKey(),
  isoNumeric: integer("iso_numeric"),
  name: text("name").notNull(),
  symbol: text("symbol"),
  kind: text("kind").notNull(), // 'FIAT' | 'CRYPTO'
  provider: text("provider").notNull(), // 'frankfurter' | 'internal'
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
