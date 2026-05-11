/**
 * recurring-rules-schema.ts — Drizzle schema for budgeting.recurring_rules
 * RLS via pgPolicy. FORCE RLS in post-migration.sql.
 * No domain imports — adapters only.
 *
 * v1.1 changes (migration 0012):
 *   - accountId (account_id) → walletId (wallet_id)
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
    walletId: uuid("wallet_id").notNull(),
    categoryId: uuid("category_id"),
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    kind: text("kind").notNull(),
    cadence: text("cadence").notNull(),
    cadenceAnchor: integer("cadence_anchor"),
    weeklyDow: integer("weekly_dow"),
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
      "recurring_rules_kind_chk",
      sql`${t.kind} IN ('EXPENSE','INCOME','TRANSFER')`,
    ),
    check(
      "recurring_rules_cadence_chk",
      sql`${t.cadence} IN ('MONTHLY','WEEKLY')`,
    ),
    check(
      "recurring_rules_weekly_dow_chk",
      sql`${t.weeklyDow} IS NULL OR (${t.weeklyDow} BETWEEN 0 AND 6)`,
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
