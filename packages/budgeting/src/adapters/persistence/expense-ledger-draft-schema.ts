/**
 * expense-ledger-draft-schema.ts — Drizzle schema fragment for expense_ledger draft columns.
 *
 * Phase 4 (Plan 04-01):
 *   ADD dismissed_at TIMESTAMPTZ NULL — marks a recurring draft as "dismissed for this month"
 *   without deleting it. Populated by POST /drafts/:draftId/dismiss route (Plan 04-02).
 *
 * Note: The expense_ledger table does NOT yet have a full Drizzle table definition
 * (repos use raw SQL via drizzle-orm sql`` tag). This file documents the column that
 * Plan 04-01 added to the schema so that:
 *   1. Future Drizzle migration tooling picks it up via `drizzle-kit introspect`.
 *   2. Plan 04-02 can import the column type for building the dismiss route.
 *
 * DB status (schema spike 2026-05-13): dismissed_at column already present in live DB
 * (added before formal migration tracking). No ALTER needed — column confirmed via:
 *   \d budgeting.expense_ledger → dismissed_at | timestamp with time zone | NULL
 *
 * Pattern mirrors categories-schema.ts MIG-07 sort_index header comment.
 */
import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  text,
  numeric,
  date,
  timestamp,
  bigint,
} from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";

/**
 * Drizzle schema for budgeting.expense_ledger.
 * Drafts = rows with confirmed_at IS NULL AND recurring_rule_id IS NOT NULL.
 * Dismissed drafts = rows with dismissed_at IS NOT NULL.
 */
export const expenseLedger = budgeting.table(
  "expense_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    budgetId: uuid("budget_id"),
    categoryId: uuid("category_id"),
    recurringRuleId: uuid("recurring_rule_id"),
    currencyOriginal: text("currency_original").notNull(),
    amountOriginalCents: bigint("amount_original_cents", { mode: "bigint" })
      .notNull()
      .default(BigInt(0)),
    amountConvertedCents: bigint("amount_converted_cents", { mode: "bigint" })
      .notNull()
      .default(BigInt(0)),
    fxRate: numeric("fx_rate", { precision: 19, scale: 8 }).notNull(),
    fxAsOf: date("fx_as_of").notNull(),
    transactionDate: date("transaction_date").notNull(),
    kind: text("kind").notNull().default("SPENDING"),
    note: text("note"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    // Phase 4 (Plan 04-01): dismiss a recurring draft without deleting it.
    // SET when user taps "Dismiss" on a draft row (POST .../drafts/:id/dismiss).
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
