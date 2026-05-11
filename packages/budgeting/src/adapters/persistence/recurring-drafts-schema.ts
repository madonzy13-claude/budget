/**
 * recurring-drafts-schema.ts — Drizzle schema for budgeting.recurring_drafts
 * RLS via pgPolicy. FORCE RLS in post-migration.sql.
 * Unique (rule_id, due_date) prevents double-generation if cron re-runs (idempotency).
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
  date,
  timestamp,
  check,
  unique,
} from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";

export const recurringDrafts = budgeting.table(
  "recurring_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    ruleId: uuid("rule_id").notNull(),
    dueDate: date("due_date").notNull(),
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    walletId: uuid("wallet_id").notNull(),
    categoryId: uuid("category_id"),
    kind: text("kind").notNull(),
    note: text("note"),
    status: text("status").notNull().default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    actorUserId: uuid("actor_user_id"),
  },
  (t) => [
    unique("recurring_drafts_rule_due_uq").on(t.ruleId, t.dueDate),
    check(
      "recurring_drafts_status_chk",
      sql`${t.status} IN ('PENDING','CONFIRMED','SKIPPED')`,
    ),
    pgPolicy("recurring_drafts_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
