import { sql } from "drizzle-orm";
import {
  pgPolicy,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { tenancy, appRole, workerRole } from "@budget/platform";

export const workspaceKind = tenancy.enum("workspace_kind", [
  "PRIVATE",
  "SHARED",
]);

export const budgets = tenancy.table(
  "budgets",
  {
    id: uuid("id").primaryKey(),
    slug: text("slug").notNull().unique(), // nanoid(12), public-facing per D-22
    name: text("name").notNull(),
    kind: workspaceKind("kind").notNull(), // D-02, TENT-10
    // Snake-case JS keys intentional: Better Auth org plugin's additionalFields
    // are keyed `default_currency` / `owner_user_id`, and the Drizzle adapter
    // looks up `schema.budgets.<field>` directly when persisting org rows.
    default_currency: text("default_currency").notNull(), // D-04, TENT-11 (immutable via post-migration trigger)
    owner_user_id: uuid("owner_user_id").notNull(),
    memberCount: integer("member_count").notNull().default(1),
    metadata: text("metadata"), // Better Auth org metadata
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // D-03: Dual cushion storage. Current-state boolean for cheap reads; SCD-2 history
    // in budgeting.budget_mode_history for historical-month evaluation (RSCM-02).
    cushionModeEnabled: boolean("cushion_mode_enabled")
      .notNull()
      .default(false),
    // Phase 5 (D-PH5-R11): global reserves toggle. When false, Reserves tab pill,
    // spendings grid reserve row, and top reserve pill are all hidden. Toggle UI
    // lives in Phase 6 Settings; default true preserves existing UX.
    reservesEnabled: boolean("reserves_enabled").notNull().default(true),
    // Phase 6 (onboarding rewrite): pure feature flag for the cushion lane —
    // gates whether the cushion column shows up at all. Distinct from
    // cushion_mode_enabled, which records whether the CURRENT MONTH is
    // operated in cushion mode (paired with budget_mode_history SCD-2 rows).
    cushionEnabled: boolean("cushion_enabled").notNull().default(true),
    // Phase 9: gates the Investments section on the wallets page. Opt-in —
    // default false (unlike reserves/cushion, which default true).
    investmentsEnabled: boolean("investments_enabled").notNull().default(false),
    // r36: gates the Overview page (net-worth hero + cards + charts). Default
    // TRUE (shown); false hides the Overview pill. Toggled in Settings → General.
    overviewEnabled: boolean("overview_enabled").notNull().default(true),
    // Phase 6 (D-09): soft-delete timestamp. NULL = active, non-NULL = archived.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    pgPolicy("budgets_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.id} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.id} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);

export const budgetMembers = tenancy.table(
  "budget_members",
  {
    id: uuid("id").primaryKey(),
    // JS key `organizationId` matches Better Auth org plugin's member.organizationId field name;
    // column name is budget_id (renamed from workspace_id in v1.1 migration 0012).
    organizationId: uuid("budget_id")
      .notNull()
      .references(() => budgets.id),
    userId: uuid("user_id").notNull(),
    role: text("role").notNull(), // 'owner' | 'member'
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    pgPolicy("budget_members_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.organizationId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.organizationId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
    // PC-01: bootstrap-self policy. Required by Plan 07 tenant-guard which queries this table
    // BEFORE app.tenant_ids is set (chicken-and-egg: GUC is built FROM this query). User is
    // always allowed to SELECT their own membership rows via app.current_user_id GUC.
    pgPolicy("budget_members_self", {
      as: "permissive",
      for: "select",
      to: [appRole, workerRole],
      using: sql`${t.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
    }),
  ],
);

/** Better Auth invitation table; modelName='budget_invitations'. */
export const budgetInvitations = tenancy.table("budget_invitations", {
  id: uuid("id").primaryKey(),
  // JS key matches Better Auth org plugin's invitation.organizationId field name.
  organizationId: uuid("budget_id")
    .notNull()
    .references(() => budgets.id),
  email: text("email").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull(), // 'pending' | 'accepted' | 'rejected' | 'expired'
  inviterId: uuid("inviter_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Backward-compat aliases so code referencing the old names still compiles
// during the Plan 01-01 → 01-02 transition. Plan 01-02 removes these aliases.
/** @deprecated use `budgets` */
export const workspaces = budgets;
/** @deprecated use `budgetMembers` */
export const workspaceMembers = budgetMembers;
/** @deprecated use `budgetInvitations` */
export const workspaceInvitations = budgetInvitations;

// Re-export pgEnum for external use if needed
export { pgEnum };
