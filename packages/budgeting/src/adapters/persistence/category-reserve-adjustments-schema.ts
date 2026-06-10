/**
 * category-reserve-adjustments-schema.ts — Drizzle schema for
 * budgeting.category_reserve_adjustments (Phase 5 Plan 01, D-PH5-R8).
 *
 * Append-only adjustments ledger. No UPDATE / DELETE routes exist (Plans 02/03
 * deliberately omit them). RLS mirrors wallets-schema.ts verbatim (T-05-04).
 * No domain imports — adapters only.
 */
import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  text,
  bigint,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";

export const categoryReserveAdjustments = budgeting.table(
  "category_reserve_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    categoryId: uuid("category_id").notNull(),
    /** Signed delta in cents. Negative = withdraw from reserve. */
    deltaCents: bigint("delta_cents", { mode: "bigint" }).notNull(),
    /** Optional user note (Zod refine in Plan 02 enforces max 280 chars). */
    note: text("note"),
    createdBy: uuid("created_by"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("category_reserve_adjustments_tenant_cat_occurred_idx").on(
      t.tenantId,
      t.categoryId,
      t.occurredAt,
    ),
    pgPolicy("category_reserve_adjustments_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
