import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  numeric,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import { tenancy, appRole, workerRole } from "@budget/platform";
import { workspaces } from "./schema";

/** D-06, TENT-13: per-member contribution shares (storage only Phase 1; math Phase 2/4). */
export const sharedWorkspaceMemberShares = tenancy.table(
  "shared_workspace_member_shares",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: uuid("user_id").notNull(),
    percentage: numeric("percentage", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    pgPolicy("shares_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.workspaceId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.workspaceId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
