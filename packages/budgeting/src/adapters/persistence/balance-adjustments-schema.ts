/**
 * balance-adjustments-schema.ts — Drizzle schema for budgeting.account_balance_adjustments
 * Append-only: REVOKE UPDATE, DELETE in post-migration.sql.
 *
 * v1.1 changes (migration 0012):
 *   - accountId (account_id) → walletId (wallet_id) (D-12: table retained)
 */
import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  text,
  numeric,
  char,
  timestamp,
} from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";

export const accountBalanceAdjustments = budgeting.table(
  "account_balance_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    walletId: uuid("wallet_id").notNull(), // FK to wallets.id (enforced at app level to avoid cross-schema FK issues)
    deltaAmount: numeric("delta_amount", { precision: 19, scale: 4 }).notNull(),
    deltaCurrency: char("delta_currency", { length: 3 }).notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
  },
  (t) => [
    pgPolicy("account_balance_adjustments_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
