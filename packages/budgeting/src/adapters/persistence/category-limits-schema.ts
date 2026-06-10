/**
 * category-limits-schema.ts — Drizzle schema for budgeting.category_limits (SCD-2)
 * RLS via pgPolicy. Partial unique index + PIT index in post-migration.sql.
 * Effective-dated per RESEARCH.md §4 / D-04-b.
 *
 * v1.1 changes (migration 0012):
 *   - ADD cushion_amount_cents BIGINT (nullable parallel SCD-2 column per D-11 / MIG-05)
 *   - Existing cushion_amount BIGINT NOT NULL remains untouched (D-11)
 */
import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  bigint,
  char,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";

export const categoryLimits = budgeting.table(
  "category_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    categoryId: uuid("category_id").notNull(),
    normalAmount: bigint("normal_amount", { mode: "bigint" }).notNull(),
    normalCurrency: char("normal_currency", { length: 3 }).notNull(),
    cushionAmount: bigint("cushion_amount", { mode: "bigint" }).notNull(),
    cushionCurrency: char("cushion_currency", { length: 3 }).notNull(),
    // MIG-05: parallel SCD-2 column for cushion in base-currency cents (D-11).
    // Nullable: NULL means "not yet set / use cushionAmount legacy field".
    cushionAmountCents: bigint("cushion_amount_cents", { mode: "bigint" }),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    actorUserId: uuid("actor_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    pgPolicy("category_limits_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
