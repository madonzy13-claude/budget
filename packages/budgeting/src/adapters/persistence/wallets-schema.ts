/**
 * wallets-schema.ts — Drizzle schema for budgeting.wallets (renamed from accounts in v1.1)
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

export const wallets = budgeting.table(
  "wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    // wallet_type replaces the old kind + scope columns. Values: SPENDINGS | CUSHION | RESERVE
    walletType: text("wallet_type").notNull(), // CHECK constraint enforced below
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
      "wallets_wallet_type_chk",
      sql`${t.walletType} IN ('SPENDINGS','CUSHION','RESERVE')`,
    ),
    pgPolicy("wallets_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);

// Backward-compat alias so code referencing `accounts` still compiles during
// the Plan 01-01 → 01-02 transition. Plan 01-02 removes this alias.
/** @deprecated use `wallets` */
export const accounts = wallets;
