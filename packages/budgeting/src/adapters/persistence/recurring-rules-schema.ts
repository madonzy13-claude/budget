/**
 * recurring-rules-schema.ts — Drizzle schema for budgeting.recurring_rules
 * RLS via pgPolicy. FORCE RLS in post-migration.sql.
 * No domain imports — adapters only.
 *
 * v1.1 changes (migration 0013 — 02-01 + 02-02):
 *   - walletId (wallet_id) DROPPED: categorical-only per TXN-02 / D-PH2-09
 *   - kind DROPPED: all rules produce SPENDING drafts per D-PH2-09
 *   - cadence CHECK extended to DAILY|WEEKLY|MONTHLY|YEARLY
 *   - yearlyMonth (yearly_month) ADDED: for YEARLY cadence (1-12)
 *   - New CHECK constraints: yearly_month_chk, cadence_anchor_chk
 */
import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  text,
  char,
  numeric,
  boolean,
  integer,
  date,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";

export const recurringRules = budgeting.table(
  "recurring_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    categoryId: uuid("category_id"),
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    cadence: text("cadence").notNull(),
    cadenceAnchor: integer("cadence_anchor"),
    weeklyDow: integer("weekly_dow"),
    yearlyMonth: integer("yearly_month"),
    note: text("note"),
    active: boolean("active").notNull().default(true),
    nextDueDate: date("next_due_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
  },
  (t) => [
    check(
      "recurring_rules_cadence_chk",
      sql`${t.cadence} IN ('DAILY','WEEKLY','MONTHLY','YEARLY')`,
    ),
    check(
      "recurring_rules_weekly_dow_chk",
      sql`${t.weeklyDow} IS NULL OR (${t.weeklyDow} BETWEEN 0 AND 6)`,
    ),
    check(
      "recurring_rules_yearly_month_chk",
      sql`(${t.cadence} <> 'YEARLY' AND ${t.yearlyMonth} IS NULL) OR (${t.cadence} = 'YEARLY' AND ${t.yearlyMonth} BETWEEN 1 AND 12)`,
    ),
    check(
      "recurring_rules_cadence_anchor_chk",
      sql`(${t.cadence} IN ('MONTHLY','YEARLY') AND ${t.cadenceAnchor} BETWEEN 1 AND 31) OR (${t.cadence} IN ('DAILY','WEEKLY') AND ${t.cadenceAnchor} IS NULL) OR ${t.cadenceAnchor} IS NULL`,
    ),
    pgPolicy("recurring_rules_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
