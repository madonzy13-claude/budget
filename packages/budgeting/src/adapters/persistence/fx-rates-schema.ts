import {
  char,
  date,
  numeric,
  text,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import { budgeting } from "@budget/platform";

/** Reference data — no RLS. GRANTs in apps/migrator/post-migration.sql. */
export const fxRates = budgeting.table(
  "fx_rates",
  {
    base: char("base", { length: 3 }).notNull(),
    quote: char("quote", { length: 3 }).notNull(),
    date: date("date").notNull(),
    rate: numeric("rate", { precision: 19, scale: 8 }).notNull(),
    provider: text("provider").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.base, t.quote, t.date] })],
);
