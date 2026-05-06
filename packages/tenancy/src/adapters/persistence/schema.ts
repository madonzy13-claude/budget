import { sql } from "drizzle-orm";
import {
  pgPolicy,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { tenancy, appRole, workerRole } from "@budget/platform";

export const workspaceKind = tenancy.enum("workspace_kind", [
  "PRIVATE",
  "SHARED",
]);

export const workspaces = tenancy.table(
  "workspaces",
  {
    id: uuid("id").primaryKey(),
    slug: text("slug").notNull().unique(), // nanoid(12), public-facing per D-22
    name: text("name").notNull(),
    kind: workspaceKind("kind").notNull(), // D-02, TENT-10
    defaultCurrency: text("default_currency").notNull(), // D-04, TENT-11 (immutable via post-migration trigger)
    ownerUserId: uuid("owner_user_id").notNull(),
    memberCount: integer("member_count").notNull().default(1),
    metadata: text("metadata"), // Better Auth org metadata
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    pgPolicy("workspaces_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.id} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.id} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);

export const workspaceMembers = tenancy.table(
  "workspace_members",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: uuid("user_id").notNull(),
    role: text("role").notNull(), // 'owner' | 'member'
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    pgPolicy("workspace_members_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.workspaceId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.workspaceId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
    // PC-01: bootstrap-self policy. Required by Plan 07 tenant-guard which queries this table
    // BEFORE app.tenant_ids is set (chicken-and-egg: GUC is built FROM this query). User is
    // always allowed to SELECT their own membership rows via app.current_user_id GUC.
    pgPolicy("workspace_members_self", {
      as: "permissive",
      for: "select",
      to: [appRole, workerRole],
      using: sql`${t.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
    }),
  ],
);

/** Better Auth invitation table; modelName='workspace_invitations'. */
export const workspaceInvitations = tenancy.table("workspace_invitations", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  email: text("email").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull(), // 'pending' | 'accepted' | 'rejected' | 'expired'
  inviterId: uuid("inviter_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Re-export pgEnum for external use if needed
export { pgEnum };
