/**
 * categories-schema.ts — Drizzle schema for budgeting.categories
 * RLS via pgPolicy. FORCE RLS + one-level trigger in post-migration.sql.
 * No domain imports — adapters only.
 *
 * v1.1 changes (migration 0012):
 *   - DROP scope column (D-13: redundant with budget-level visibility)
 *   - ADD sort_index INTEGER NOT NULL DEFAULT 0 (MIG-07; UI drag-reorder in Phase 4)
 */
import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  date,
} from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";

export const categories = budgeting.table(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    parentId: uuid("parent_id"),
    // 260613-v1p: per-category color cue. Nullable (NULL = no color = no accent
    // bar). Values constrained to the 8 palette keys at the API/zod boundary; the
    // column stays plain text so a future palette change needs no migration.
    colorKey: text("color_key"),
    // scope column DROPPED in v1.1 (D-13): visibility is budget-level, not per-category
    sortIndex: integer("sort_index").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    // Issue 1b: first month the category is hidden. NULL = active; a month start
    // = "keep history" (visible before it, hidden from it on); '0001-01-01' =
    // hidden everywhere (paired with archived_at).
    archivedFrom: date("archived_from"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
    // Phase 5 (D-PH5-R10): excluded categories are hidden from reserve math totals.
    // Drag between Active/Excluded sections on the Reserves tab toggles this flag.
    reserveExcluded: boolean("reserve_excluded").notNull().default(false),
    // r33: THE smart "Investments" category (migration 0052). is_investment marks
    // the single non-deletable, reserve-excluded category pinned first in the grid.
    // investment_limit_mode: 'manual' (user-typed limit) | 'smart' (computed on
    // read = monthly income − Σ other planned). NULL for every normal category.
    isInvestment: boolean("is_investment").notNull().default(false),
    investmentLimitMode: text("investment_limit_mode"),
    // Persisted cushion configuration (migration 0059): 'none' | 'needs_wants' |
    // 'needs_only' | 'custom'. NULL = infer from the stored amounts (legacy). Lets
    // the slider show "Needs only" even when cushion == planned (no wants yet).
    cushionMode: text("cushion_mode"),
    // Phase 05 reserve rewrite (decision B, migration 0030): the stored
    // reserve_actual_cents column was DROPPED. The new replay-on-read engine
    // (reserve-engine.ts) derives R/U fresh from category_reserve_adjustments +
    // transactions + limits, so no precomputed "actual" is persisted.
  },
  (t) => [
    pgPolicy("categories_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
