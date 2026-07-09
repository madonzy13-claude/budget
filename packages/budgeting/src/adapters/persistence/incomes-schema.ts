/**
 * incomes-schema.ts — Drizzle schema for budgeting.incomes (r32).
 *
 * A per-budget list of expected incomes (config only for now; consumption TBD).
 * Mirrors recurring_rules' cadence model (name + amount + currency + frequency)
 * minus the scheduling/draft machinery (no category, note, or next_due_date).
 * RLS via pgPolicy; FORCE RLS + grants live in migration 0051 / post-migration.
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
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";

export const incomes = budgeting.table(
  "incomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(), // == budgetId (v1.1 invariant)
    name: text("name").notNull(),
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    cadence: text("cadence").notNull(),
    cadenceAnchor: integer("cadence_anchor"),
    weeklyDow: integer("weekly_dow"),
    yearlyMonth: integer("yearly_month"),
    active: boolean("active").notNull().default(true),
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
      "incomes_cadence_chk",
      sql`${t.cadence} IN ('DAILY','WEEKLY','MONTHLY','YEARLY')`,
    ),
    check(
      "incomes_weekly_dow_chk",
      sql`${t.weeklyDow} IS NULL OR (${t.weeklyDow} BETWEEN 0 AND 6)`,
    ),
    check(
      "incomes_yearly_month_chk",
      sql`(${t.cadence} <> 'YEARLY' AND ${t.yearlyMonth} IS NULL) OR (${t.cadence} = 'YEARLY' AND ${t.yearlyMonth} BETWEEN 1 AND 12)`,
    ),
    check(
      "incomes_cadence_anchor_chk",
      sql`(${t.cadence} IN ('MONTHLY','YEARLY') AND ${t.cadenceAnchor} BETWEEN 1 AND 31) OR (${t.cadence} IN ('DAILY','WEEKLY') AND ${t.cadenceAnchor} IS NULL) OR ${t.cadenceAnchor} IS NULL`,
    ),
    pgPolicy("incomes_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
