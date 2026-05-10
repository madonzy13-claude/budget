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
 *
 * Plan 02-06: Phase-2 ADD COLUMN (transaction_date, note, account_id, category_id, kind,
 * transfer_group_id, note_tsv). DROP corrected_by_id (D-05-a).
 * note_tsv is GENERATED ALWAYS AS ... STORED — added via post-migration.sql ALTER because
 * Drizzle 0.45 cannot express GENERATED ALWAYS AS (tsvector) columns in a schema push.
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
    // corrected_by_id DROPPED in plan 02-06 (D-05-a) — removed from Drizzle schema
    // Phase-2 columns (D-05-b, D-05-f):
    transactionDate: date("transaction_date").notNull().default(sql`now()::date`),
    note: text("note"),
    accountId: uuid("account_id").notNull().default(sql`'00000000-0000-0000-0000-000000000000'::uuid`),
    categoryId: uuid("category_id"),
    kind: text("kind").notNull().default("EXPENSE"),
    transferGroupId: uuid("transfer_group_id"),
    // note_tsv: GENERATED ALWAYS AS (to_tsvector('simple', coalesce(note, ''))) STORED
    // Cannot be expressed in Drizzle 0.45 — declared as plain text for type purposes.
    // Actual GENERATED column added via post-migration.sql ALTER TABLE.
    noteTsv: text("note_tsv"),
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
