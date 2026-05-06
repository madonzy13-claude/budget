import { sql } from "drizzle-orm";
import { pgPolicy, uuid, timestamp } from "drizzle-orm/pg-core";
import { identity, appRole, workerRole } from "@budget/platform";

/** D-07: persisted multi-select active workspaces filter. */
export const userPreferences = identity.table(
  "user_preferences",
  {
    userId: uuid("user_id").primaryKey(),
    activeWorkspaceIds: uuid("active_workspace_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    pgPolicy("user_preferences_owner_only", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
      withCheck: sql`${t.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
    }),
  ],
);
