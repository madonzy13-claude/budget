// This file MUST NOT be imported directly by domain/application/ports layers.
// Mirror of the tenancy.budget_share_links table created by migration 0013 Section D (SHRD-01).
import {
  pgPolicy,
  uuid,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenancy, appRole } from "@budget/platform";

export const budgetShareLinks = tenancy.table(
  "budget_share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    budgetId: uuid("budget_id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    token: text("token").notNull(),
    createdBy: uuid("created_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    acceptedBy: uuid("accepted_by"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("budget_share_links_token_uidx").on(t.token),
    pgPolicy("budget_share_links_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
