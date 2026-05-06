import { sql } from "drizzle-orm";
import {
  uuid,
  text,
  numeric,
  date,
  timestamp,
  pgPolicy,
} from "drizzle-orm/pg-core";
import { budgeting } from "./schemas";
import { appRole, workerRole } from "./roles";

/**
 * D-23 (PC-05 resolved): append-only ledger primitive. Phase 1 creates the table + RLS + REVOKE.
 * Phase 2 fills it via the Budgeting context (apps emit INSERTs only).
 * MONY-06 column shape.
 */
export const expenseLedger = budgeting.table(
  "expense_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    amountOrig: numeric("amount_orig", { precision: 19, scale: 4 }).notNull(),
    currencyOrig: text("currency_orig").notNull(),
    amountDefault: numeric("amount_default", {
      precision: 19,
      scale: 4,
    }).notNull(),
    currencyDefault: text("currency_default").notNull(),
    fxRate: numeric("fx_rate", { precision: 19, scale: 8 }).notNull(),
    fxRateDate: date("fx_rate_date").notNull(),
    fxProvider: text("fx_provider").notNull(),
    correctsId: uuid("corrects_id"),
    correctedById: uuid("corrected_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    pgPolicy("expense_ledger_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
