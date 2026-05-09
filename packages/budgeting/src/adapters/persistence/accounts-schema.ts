/**
 * accounts-schema.ts — Drizzle schema for budgeting.accounts
 * RLS via pgPolicy. FORCE RLS in post-migration.sql.
 * No domain imports — adapters only.
 */
import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  text,
  char,
  numeric,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";

export const accounts = budgeting.table(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(), // CHECK constraint enforced below
    scope: text("scope").notNull(), // CHECK constraint enforced below
    currency: char("currency", { length: 3 }).notNull(),
    currentBalance: numeric("current_balance", {
      precision: 19,
      scale: 4,
    })
      .notNull()
      .default("0"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
  },
  (t) => [
    check(
      "accounts_kind_chk",
      sql`${t.kind} IN ('CASH','CHECKING','SAVINGS','CREDIT_CARD','LOAN','INVESTMENT')`,
    ),
    check("accounts_scope_chk", sql`${t.scope} IN ('PERSONAL','SHARED')`),
    pgPolicy("accounts_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
