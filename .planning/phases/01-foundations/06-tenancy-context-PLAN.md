---
phase: 01-foundations
plan: 06
plan_id: 01.06
type: execute
wave: 2
depends_on: ['01.00', '01.01', '01.02', '01.03', '01.05']
files_modified:
  - packages/tenancy/package.json
  - packages/tenancy/src/index.ts
  - packages/tenancy/src/domain/workspace.ts
  - packages/tenancy/src/domain/membership.ts
  - packages/tenancy/src/domain/share.ts
  - packages/tenancy/src/domain/events.ts
  - packages/tenancy/src/contracts/api.ts
  - packages/tenancy/src/contracts/events.ts
  - packages/tenancy/src/contracts/factory.ts
  - packages/tenancy/src/ports/workspace-repo.ts
  - packages/tenancy/src/ports/member-repo.ts
  - packages/tenancy/src/application/create-workspace.ts
  - packages/tenancy/src/application/invite-member.ts
  - packages/tenancy/src/application/accept-invitation.ts
  - packages/tenancy/src/application/leave-workspace.ts
  - packages/tenancy/src/application/transfer-ownership.ts
  - packages/tenancy/src/application/update-shares.ts
  - packages/tenancy/src/application/set-active-workspaces.ts
  - packages/tenancy/src/application/list-active-workspaces.ts
  - packages/tenancy/src/adapters/persistence/schema.ts
  - packages/tenancy/src/adapters/persistence/shares-schema.ts
  - packages/tenancy/src/adapters/persistence/better-auth-org.ts
  - packages/tenancy/src/adapters/persistence/workspace-repo.ts
  - packages/tenancy/test/create-private.test.ts
  - packages/tenancy/test/create-shared-invite.test.ts
  - packages/tenancy/test/role-enforcement.test.ts
  - packages/tenancy/test/multi-shared.test.ts
  - packages/tenancy/test/transfer-ownership.test.ts
  - packages/tenancy/test/leave-workspace.test.ts
  - packages/tenancy/test/default-currency-immutable.test.ts
  - packages/tenancy/test/active-filter.test.ts
  - packages/tenancy/test/shares-audit.test.ts
  - packages/tenancy/test/private-toctou.test.ts
  - apps/migrator/post-migration.sql
  - apps/migrator/drizzle.config.ts
autonomous: true
requirements: [TENT-01, TENT-02, TENT-03, TENT-04, TENT-05, TENT-06, TENT-09, TENT-10, TENT-11, TENT-12, TENT-13, MONY-02, ENGR-04]
must_haves:
  truths:
    - "Workspace.kind enum (PRIVATE | SHARED) declared as Postgres enum (D-02, TENT-10)"
    - "PRIVATE workspace creation results in single-member workspace with kind='PRIVATE' (D-01)"
    - "SHARED workspace owner can invite member by email; invitation email sent via EmailSender port (TENT-02)"
    - "organizationHooks.beforeAddMember REJECTS invite when organization.kind='PRIVATE' (D-02) — defense in depth, BEFORE INSERT trigger is the race-free wall (PC-11)"
    - "BEFORE INSERT trigger workspace_members_private_guard raises if PRIVATE workspace already has ≥1 member at INSERT time (PC-11 — TOCTOU race-free)"
    - "organizationHooks.beforeUpdate REJECTS change to default_currency (D-04, TENT-11)"
    - "organizationHooks.afterAddMember inserts shared_workspace_member_shares row at 0% for SHARED, using withTenantTx(workspaceId, userId) (D-06, PC-03)"
    - "default_currency immutable post-create — DB CHECK trigger blocks UPDATE (D-04, TENT-11)"
    - "shared_workspace_member_shares.percentage NUMERIC(5,2); deferred CHECK enforces sum=100 per workspace (D-06, TENT-13)"
    - "Owner-only update-shares endpoint writes audit_history row (D-06, TENT-13)"
    - "Transfer-ownership succeeds; last-owner CANNOT leave (TENT-05)"
    - "Member can leave SHARED workspace; PRIVATE workspaces unaffected (TENT-06)"
    - "set-active-workspaces persists user_preferences.active_workspace_ids (D-07, TENT-12)"
    - "User can have unlimited PRIVATE + unlimited SHARED memberships (TENT-09 — allowUserToCreateOrganization always true, no organizationLimit)"
    - "workspace_members table has TWO policies: tenant_isolation (app.tenant_ids array predicate) AND members_self (user_id = app.current_user_id GUC) — second policy is required by Plan 07 tenant-guard bootstrap query (PC-01)"
    - "FORCE ROW LEVEL SECURITY verified for tenancy.workspaces, tenancy.workspace_members, tenancy.shared_workspace_member_shares via leak-CI grep gate (Plan 10)"
    - "Tenancy module factory createTenancyModule() exported from packages/tenancy/src/contracts/factory.ts; apps import from package root only (PC-02, PC-15)"
    - "All hook database writes use withTenantTx(workspaceId, userId, fn) (extended signature) — never raw appPool().connect() (PC-03)"
  artifacts:
    - path: packages/tenancy/src/adapters/persistence/schema.ts
      provides: "tenancy.workspaces (extends Better Auth org with kind + default_currency additionalFields), tenancy.workspace_members (TWO policies: tenant_isolation + members_self), workspace_kind enum"
      contains: "workspace_members_self"
    - path: packages/tenancy/src/adapters/persistence/shares-schema.ts
      provides: "tenancy.shared_workspace_member_shares (D-06)"
      contains: "shared_workspace_member_shares"
    - path: packages/tenancy/src/adapters/persistence/better-auth-org.ts
      provides: "organization plugin config + organizationHooks for kind/currency/shares (D-02, D-04, D-06)"
      contains: "organization"
    - path: packages/tenancy/src/contracts/factory.ts
      provides: "createTenancyModule factory — apps/* import this surface only (PC-02, PC-15, D-27 carve-out)"
      contains: "createTenancyModule"
    - path: packages/tenancy/src/application/update-shares.ts
      provides: "Owner-only shares update (writes audit + transactional sum=100 invariant)"
      contains: "update-shares"
  key_links:
    - from: "packages/tenancy/src/adapters/persistence/better-auth-org.ts"
      to: "packages/identity createAuth(opts.additionalPlugins)"
      via: "factory injection"
      pattern: "additionalPlugins"
    - from: "organization plugin organizationHooks"
      to: "packages/tenancy/src/application/* (PRIVATE invite-reject, currency immutable, shares insert)"
      via: "hook callbacks (use withTenantTx, never raw appPool().connect())"
      pattern: "withTenantTx"
    - from: "packages/tenancy/src/application/update-shares.ts"
      to: "packages/platform writeAudit"
      via: "audit_history INSERT"
      pattern: "writeAudit"
---

<objective>
Ship the Tenancy bounded context: workspaces (PRIVATE | SHARED kind enum), members, contribution shares, and the organization plugin configuration with hooks for kind validation, currency immutability, and shares lifecycle.

Purpose: Implements all TENT-* requirements (01-13) + MONY-02 + D-01/02/04/06/07/12. The Tenancy context layers on Better Auth's organization plugin (configured via Plan 05's additionalPlugins) and adds domain-specific tables (workspace_members extension, shared_workspace_member_shares) plus a CHECK trigger enforcing default_currency immutability at the DB level (defense in depth).

Output: A `packages/tenancy` with full DDD layout, the organization plugin properly configured, member-shares storage with sum=100 invariant, and 9 integration tests covering every TENT-* requirement.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-foundations/01-CONTEXT.md
@.planning/phases/01-foundations/01-RESEARCH.md
@.planning/phases/01-foundations/01-VALIDATION.md
@CLAUDE.md
@packages/shared-kernel/src/index.ts
@packages/platform/src/index.ts
@packages/identity/src/adapters/persistence/better-auth.ts
@apps/migrator/post-migration.sql

<interfaces>
<!-- Public contracts of packages/tenancy -->

// contracts/api.ts
export type WorkspaceKind = 'PRIVATE' | 'SHARED';

export interface WorkspaceDTO {
  id: string;
  slug: string;                  // nanoid(12)
  name: string;
  kind: WorkspaceKind;
  default_currency: string;      // ISO-4217 immutable post-create (D-04)
  ownerUserId: string;
  memberCount: number;
  createdAt: Date;
}

export interface MemberDTO {
  workspaceId: string;
  userId: string;
  role: 'owner' | 'member';
  joinedAt: Date;
}

export interface MemberShareDTO {
  workspaceId: string;
  userId: string;
  percentage: string;            // string for big.js precision (5,2)
  updatedAt: Date;
}

// ports/workspace-repo.ts
export interface WorkspaceRepo {
  findById(id: string): Promise<WorkspaceDTO | null>;
  listForUser(userId: string): Promise<WorkspaceDTO[]>;
  listMembers(workspaceId: string): Promise<MemberDTO[]>;
}

// ports/member-repo.ts
export interface MemberShareRepo {
  list(workspaceId: string): Promise<MemberShareDTO[]>;
  update(workspaceId: string, shares: { userId: string; percentage: string }[], actorUserId: string): Promise<void>;  // sum=100 + audit
}

// contracts/factory.ts (PC-02, PC-15)
export interface TenancyModule {
  organizationPlugin: ReturnType<typeof import('better-auth/plugins').organization>;
  workspaceRepo: import('../ports/workspace-repo').WorkspaceRepo;
  memberShareRepo: import('../ports/member-repo').MemberShareRepo;
}
export function createTenancyModule(deps: {
  emailSender: import('@budget/shared-kernel').EmailSender;
  appUrl: string;
}): TenancyModule;
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Tenancy domain + contracts + ports + factory surface</name>
  <files>
    packages/tenancy/package.json,
    packages/tenancy/src/index.ts,
    packages/tenancy/src/domain/workspace.ts,
    packages/tenancy/src/domain/membership.ts,
    packages/tenancy/src/domain/share.ts,
    packages/tenancy/src/domain/events.ts,
    packages/tenancy/src/contracts/api.ts,
    packages/tenancy/src/contracts/events.ts,
    packages/tenancy/src/contracts/factory.ts,
    packages/tenancy/src/ports/workspace-repo.ts,
    packages/tenancy/src/ports/member-repo.ts
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-CONTEXT.md D-01 to D-07 (workspace model)
    - .planning/phases/01-foundations/01-RESEARCH.md §"Project Structure" packages/tenancy layout (lines 391-400)
    - packages/identity/src/contracts/api.ts (Locale, UserDTO shapes)
    - packages/shared-kernel/src/index.ts (Result, branded ids, Big-precision strings)
  </read_first>
  <behavior>
    - Workspace domain class with kind: WorkspaceKind, default_currency immutability invariant (cannot mutate this.default_currency)
    - Workspace.canAcceptMember(): false for PRIVATE if memberCount >= 1
    - Workspace.canBeLeftBy(userId): false if user is sole owner
    - MemberShare.validate(shares): Result.err if not all >=0 or sum != 100 (within 0.005 tolerance — UI-SPEC sum tolerance)
    - contracts/factory.ts exports createTenancyModule() factory; only this surface is importable by apps/* (PC-02, PC-15, D-27 carve-out for contracts/**)
  </behavior>
  <action>
    1. Add to `packages/tenancy/package.json`:
       ```json
       "dependencies": {
         "@budget/shared-kernel": "workspace:*",
         "@budget/platform": "workspace:*",
         "@budget/identity": "workspace:*",
         "big.js": "^7.0.1"
       }
       ```
       Set `"main": "src/index.ts"`, `"exports": { ".": "./src/index.ts" }` (PC-15: no /dist/ paths; Bun runs TS natively).
    2. Implement `packages/tenancy/src/contracts/api.ts` per `<interfaces>` (WorkspaceKind enum, WorkspaceDTO, MemberDTO, MemberShareDTO).
    3. Implement `packages/tenancy/src/contracts/events.ts`:
       ```ts
       export interface WorkspaceCreated { workspaceId: string; kind: 'PRIVATE'|'SHARED'; default_currency: string; ownerUserId: string }
       export interface MemberAdded { workspaceId: string; userId: string; role: 'owner'|'member' }
       export interface MemberLeft { workspaceId: string; userId: string }
       export interface OwnershipTransferred { workspaceId: string; fromUserId: string; toUserId: string }
       export interface SharesUpdated { workspaceId: string; actorUserId: string; shares: Array<{ userId: string; percentage: string }> }
       ```
    4. Implement `packages/tenancy/src/domain/workspace.ts`:
       ```ts
       import { ok, err, type Result } from '@budget/shared-kernel';
       import type { WorkspaceKind } from '../contracts/api';

       export class Workspace {
         constructor(
           public readonly id: string,
           public readonly slug: string,
           public name: string,
           public readonly kind: WorkspaceKind,
           public readonly default_currency: string,    // readonly enforces D-04
           public readonly ownerUserId: string,
           public memberCount: number,
           public readonly createdAt: Date,
         ) {}

         canAcceptMember(): Result<void, Error> {
           if (this.kind === 'PRIVATE' && this.memberCount >= 1) {
             return err(new Error('PRIVATE workspaces accept only the owner. Convert to SHARED first.'));
           }
           return ok(undefined);
         }

         canBeLeftBy(userId: string, allOwnerIds: string[]): Result<void, Error> {
           const isOwner = userId === this.ownerUserId || allOwnerIds.includes(userId);
           if (isOwner && allOwnerIds.length === 1) {
             return err(new Error('Cannot leave as last owner — transfer ownership first (TENT-05)'));
           }
           return ok(undefined);
         }
       }
       ```
    5. Implement `packages/tenancy/src/domain/membership.ts`:
       ```ts
       export type Role = 'owner' | 'member';
       export class Membership {
         constructor(public readonly workspaceId: string, public readonly userId: string, public role: Role, public readonly joinedAt: Date) {}
         canInvite(): boolean { return this.role === 'owner'; }
       }
       ```
    6. Implement `packages/tenancy/src/domain/share.ts`:
       ```ts
       import Big from 'big.js';
       import { ok, err, type Result } from '@budget/shared-kernel';

       export interface ShareEntry { userId: string; percentage: string }

       export function validateShares(entries: ShareEntry[]): Result<void, Error> {
         if (entries.length === 0) return err(new Error('At least one share required'));
         let sum = new Big(0);
         for (const e of entries) {
           const p = new Big(e.percentage);
           if (p.lt(0) || p.gt(100)) return err(new Error(`Share for ${e.userId} out of range [0,100]: ${e.percentage}`));
           sum = sum.plus(p);
         }
         // UI-SPEC tolerance ±0.005 — domain accepts ±0.01 to be lenient on rounding
         if (sum.minus(100).abs().gt('0.01')) {
           return err(new Error(`Shares must sum to 100; got ${sum.toString()}`));
         }
         return ok(undefined);
       }
       ```
    7. Implement `packages/tenancy/src/domain/events.ts` re-exporting contracts/events.
    8. Implement `packages/tenancy/src/ports/workspace-repo.ts` and `member-repo.ts` per `<interfaces>`.
    9. Implement `packages/tenancy/src/contracts/factory.ts` (PC-02, PC-15 — apps/* import this surface only):
       ```ts
       import type { EmailSender } from '@budget/shared-kernel';
       import type { WorkspaceRepo } from '../ports/workspace-repo';
       import type { MemberShareRepo } from '../ports/member-repo';

       export interface TenancyModule {
         organizationPlugin: unknown;   // typed as ReturnType<typeof organization> at impl site
         workspaceRepo: WorkspaceRepo;
         memberShareRepo: MemberShareRepo;
       }

       export function createTenancyModule(deps: { emailSender: EmailSender; appUrl: string }): TenancyModule {
         // Implementation imports adapters/persistence/* internally — apps NEVER reach those paths.
         // Loaded lazily to keep contracts/ free of adapter imports at type-check time.
         // eslint-disable-next-line @typescript-eslint/no-require-imports
         const { createOrganizationPlugin } = require('../adapters/persistence/better-auth-org') as typeof import('../adapters/persistence/better-auth-org');
         // eslint-disable-next-line @typescript-eslint/no-require-imports
         const { DrizzleWorkspaceRepo, DrizzleMemberShareRepo } = require('../adapters/persistence/workspace-repo') as typeof import('../adapters/persistence/workspace-repo');
         return {
           organizationPlugin: createOrganizationPlugin(deps),
           workspaceRepo: new DrizzleWorkspaceRepo(),
           memberShareRepo: new DrizzleMemberShareRepo(),
         };
       }
       ```
    10. Implement `packages/tenancy/src/index.ts` exporting ONLY contracts and factory (PC-02, PC-15):
        ```ts
        export * from './contracts/api';
        export * from './contracts/events';
        export * from './contracts/factory';
        export type { WorkspaceRepo } from './ports/workspace-repo';
        export type { MemberShareRepo } from './ports/member-repo';
        // domain/* and adapters/* are NOT re-exported.
        ```
  </action>
  <verify>
    <automated>cd /home/claude/budget && bunx tsc --noEmit -p packages/tenancy/tsconfig.json && bunx depcruise --config .dependency-cruiser.cjs --output-type err packages/tenancy</automated>
  </verify>
  <acceptance_criteria>
    - domain/workspace.ts has readonly default_currency: `grep -E 'readonly default_currency' packages/tenancy/src/domain/workspace.ts` exits 0
    - canAcceptMember and canBeLeftBy declared: `grep -E '(canAcceptMember|canBeLeftBy)' packages/tenancy/src/domain/workspace.ts | wc -l` returns at least 2
    - validateShares uses big.js: `grep -F "from 'big.js'" packages/tenancy/src/domain/share.ts` exits 0
    - validateShares enforces sum=100: `grep -F 'sum to 100' packages/tenancy/src/domain/share.ts` exits 0
    - domain layer does NOT import drizzle/hono/better-auth: `! grep -RE "from '(drizzle-orm|hono|better-auth)'" packages/tenancy/src/domain/` exits 0
    - factory.ts exports createTenancyModule: `grep -F 'export function createTenancyModule' packages/tenancy/src/contracts/factory.ts` exits 0
    - index.ts re-exports factory: `grep -F "export * from './contracts/factory'" packages/tenancy/src/index.ts` exits 0
    - dep-cruiser passes
    - tsc passes
  </acceptance_criteria>
  <done>Tenancy domain + contracts + ports shipped without adapter imports. Domain enforces D-04 immutability + TENT-05 last-owner guard + TENT-13 sum=100 invariant. createTenancyModule factory ready for apps/* consumption (PC-02).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Drizzle persistence schema (workspaces + members + shares) + immutability CHECK trigger + PRIVATE TOCTOU trigger + members_self policy</name>
  <files>
    packages/tenancy/src/adapters/persistence/schema.ts,
    packages/tenancy/src/adapters/persistence/shares-schema.ts,
    apps/migrator/post-migration.sql,
    apps/migrator/drizzle.config.ts
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-RESEARCH.md §"Pattern 1" (workspaces table reference, kind enum)
    - .planning/phases/01-foundations/01-CONTEXT.md D-02, D-04, D-06, D-10
    - apps/migrator/post-migration.sql (existing FORCE RLS pattern)
    - packages/identity/src/adapters/persistence/schema.ts (FK source for ownerUserId)
  </read_first>
  <behavior>
    - tenancy.workspace_kind enum (PRIVATE, SHARED)
    - tenancy.workspaces extends Better Auth org via additionalFields (kind, default_currency, slug)
    - tenancy.workspace_members has TWO pgPolicy declarations:
      1. workspace_members_tenant_isolation — tenant array predicate (handler-time queries)
      2. workspace_members_self — user_id = app.current_user_id (Plan 07 bootstrap query, PC-01)
    - tenancy.shared_workspace_member_shares: workspace_id, user_id, percentage NUMERIC(5,2), created_at, updated_at — composite PK (workspace_id, user_id)
    - post-migration.sql:
      - GRANTs on tenancy.* tables for app_role + worker_role
      - FORCE RLS on workspaces, workspace_members, shared_workspace_member_shares
      - CREATE OR REPLACE FUNCTION trigger that BLOCKS UPDATE if NEW.default_currency != OLD.default_currency on tenancy.workspaces (D-04)
      - DEFERRABLE constraint trigger that asserts sum(percentage) per workspace_id = 100.00 ± 0.005 after each transaction
      - PC-11: BEFORE INSERT trigger on tenancy.workspace_members that raises if (workspace.kind = 'PRIVATE' AND existing member count ≥ 1) — race-free TOCTOU guard (defense beyond app-layer hook)
  </behavior>
  <action>
    1. Implement `packages/tenancy/src/adapters/persistence/schema.ts`:
       ```ts
       import { sql } from 'drizzle-orm';
       import { pgPolicy, uuid, text, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core';
       import { tenancy, appRole, workerRole } from '@budget/platform';

       export const workspaceKind = tenancy.enum('workspace_kind', ['PRIVATE', 'SHARED']);

       export const workspaces = tenancy.table('workspaces', {
         id: uuid('id').primaryKey(),
         slug: text('slug').notNull().unique(),                       // nanoid(12), public-facing per D-22
         name: text('name').notNull(),
         kind: workspaceKind('kind').notNull(),                       // D-02, TENT-10
         defaultCurrency: text('default_currency').notNull(),         // D-04, TENT-11 (immutable via post-migration trigger)
         ownerUserId: uuid('owner_user_id').notNull(),
         memberCount: integer('member_count').notNull().default(1),
         metadata: text('metadata'),                                  // Better Auth org metadata
         createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
       }, (t) => [
         pgPolicy('workspaces_tenant_isolation', {
           as: 'permissive',
           for: 'all',
           to: [appRole, workerRole],
           using: sql`${t.id} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
           withCheck: sql`${t.id} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
         }),
       ]);

       export const workspaceMembers = tenancy.table('workspace_members', {
         id: uuid('id').primaryKey(),
         workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
         userId: uuid('user_id').notNull(),
         role: text('role').notNull(),                                // 'owner' | 'member'
         createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
       }, (t) => [
         pgPolicy('workspace_members_tenant_isolation', {
           as: 'permissive',
           for: 'all',
           to: [appRole, workerRole],
           using: sql`${t.workspaceId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
           withCheck: sql`${t.workspaceId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
         }),
         // PC-01: bootstrap-self policy. Required by Plan 07 tenant-guard which queries this table
         // BEFORE app.tenant_ids is set (chicken-and-egg: GUC is built FROM this query). User is
         // always allowed to SELECT their own membership rows via app.current_user_id GUC.
         pgPolicy('workspace_members_self', {
           as: 'permissive',
           for: 'select',
           to: [appRole, workerRole],
           using: sql`${t.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
         }),
       ]);

       /** Better Auth invitation table; modelName='workspace_invitations'. */
       export const workspaceInvitations = tenancy.table('workspace_invitations', {
         id: uuid('id').primaryKey(),
         workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
         email: text('email').notNull(),
         role: text('role').notNull(),
         status: text('status').notNull(),                            // 'pending' | 'accepted' | 'rejected' | 'expired'
         inviterId: uuid('inviter_id').notNull(),
         expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
         createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
       });
       ```
    2. Implement `packages/tenancy/src/adapters/persistence/shares-schema.ts`:
       ```ts
       import { sql } from 'drizzle-orm';
       import { pgPolicy, uuid, numeric, timestamp, primaryKey } from 'drizzle-orm/pg-core';
       import { tenancy, appRole, workerRole } from '@budget/platform';
       import { workspaces } from './schema';

       /** D-06, TENT-13: per-member contribution shares (storage only Phase 1; math Phase 2/4). */
       export const sharedWorkspaceMemberShares = tenancy.table('shared_workspace_member_shares', {
         workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
         userId: uuid('user_id').notNull(),
         percentage: numeric('percentage', { precision: 5, scale: 2 }).notNull().default('0'),
         createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
         updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
       }, (t) => [
         primaryKey({ columns: [t.workspaceId, t.userId] }),
         pgPolicy('shares_tenant_isolation', {
           as: 'permissive',
           for: 'all',
           to: [appRole, workerRole],
           using: sql`${t.workspaceId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
           withCheck: sql`${t.workspaceId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
         }),
       ]);
       ```
    3. APPEND to `apps/migrator/post-migration.sql`:
       ```sql
       -- Plan 06: tenancy schema
       GRANT USAGE ON SCHEMA tenancy TO app_role, worker_role;
       GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.workspaces, tenancy.workspace_members, tenancy.workspace_invitations TO app_role;
       GRANT SELECT ON tenancy.workspaces, tenancy.workspace_members TO worker_role;
       GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.shared_workspace_member_shares TO app_role;
       GRANT SELECT ON tenancy.shared_workspace_member_shares TO worker_role;

       ALTER TABLE tenancy.workspaces FORCE ROW LEVEL SECURITY;
       ALTER TABLE tenancy.workspace_members FORCE ROW LEVEL SECURITY;
       ALTER TABLE tenancy.shared_workspace_member_shares FORCE ROW LEVEL SECURITY;
       -- workspace_invitations: token-keyed lookup; NO RLS (status column controls visibility).

       -- D-04 / TENT-11: default_currency immutable post-create.
       CREATE OR REPLACE FUNCTION tenancy.workspaces_block_currency_change() RETURNS trigger AS $$
       BEGIN
         IF NEW.default_currency IS DISTINCT FROM OLD.default_currency THEN
           RAISE EXCEPTION 'default_currency is immutable post-create (TENT-11, D-04)';
         END IF;
         RETURN NEW;
       END $$ LANGUAGE plpgsql;
       DROP TRIGGER IF EXISTS workspaces_currency_immutable ON tenancy.workspaces;
       CREATE TRIGGER workspaces_currency_immutable
         BEFORE UPDATE ON tenancy.workspaces
         FOR EACH ROW EXECUTE FUNCTION tenancy.workspaces_block_currency_change();

       -- PC-11 (TENT-10, D-02): TOCTOU race-free PRIVATE-cap guard. Postgres unique partial indexes
       -- cannot reference subqueries, so we use a BEFORE INSERT trigger that runs in the same tx
       -- as the INSERT — count read + insert decision are atomic from any concurrent transaction's
       -- perspective (row-level lock on workspaces.id picked up by SELECT FOR KEY SHARE).
       CREATE OR REPLACE FUNCTION tenancy.workspace_members_private_guard() RETURNS trigger AS $$
       DECLARE
         ws_kind text;
         live_count int;
       BEGIN
         SELECT kind INTO ws_kind FROM tenancy.workspaces WHERE id = NEW.workspace_id FOR KEY SHARE;
         IF ws_kind = 'PRIVATE' THEN
           SELECT count(*)::int INTO live_count FROM tenancy.workspace_members WHERE workspace_id = NEW.workspace_id;
           IF live_count >= 1 THEN
             RAISE EXCEPTION 'PRIVATE workspaces accept only the owner. Convert to SHARED first. (TENT-10, D-02, PC-11)';
           END IF;
         END IF;
         RETURN NEW;
       END $$ LANGUAGE plpgsql;
       DROP TRIGGER IF EXISTS workspace_members_private_cap ON tenancy.workspace_members;
       CREATE TRIGGER workspace_members_private_cap
         BEFORE INSERT ON tenancy.workspace_members
         FOR EACH ROW EXECUTE FUNCTION tenancy.workspace_members_private_guard();

       -- D-06 / TENT-13: shares sum = 100 per workspace, deferred constraint trigger.
       CREATE OR REPLACE FUNCTION tenancy.shares_sum_check() RETURNS trigger AS $$
       DECLARE total numeric(7,2);
       BEGIN
         SELECT coalesce(sum(percentage), 0) INTO total
         FROM tenancy.shared_workspace_member_shares
         WHERE workspace_id = COALESCE(NEW.workspace_id, OLD.workspace_id);
         IF abs(total - 100) > 0.005 AND total > 0 THEN
           RAISE EXCEPTION 'shared_workspace_member_shares for workspace % must sum to 100 (got %)', COALESCE(NEW.workspace_id, OLD.workspace_id), total;
         END IF;
         RETURN NULL;
       END $$ LANGUAGE plpgsql;
       DROP TRIGGER IF EXISTS shares_sum_invariant ON tenancy.shared_workspace_member_shares;
       CREATE CONSTRAINT TRIGGER shares_sum_invariant
         AFTER INSERT OR UPDATE OR DELETE ON tenancy.shared_workspace_member_shares
         DEFERRABLE INITIALLY DEFERRED
         FOR EACH ROW EXECUTE FUNCTION tenancy.shares_sum_check();
       -- Note: total > 0 short-circuit allows the freshly-created workspace state where no rows exist (sum=0)
       -- and the subsequent owner-edit transaction filling rows to balance to 100 within the same tx.
       ```
    4. Update `apps/migrator/drizzle.config.ts` schema array to include tenancy:
       ```ts
       schema: [
         ...,
         '../../packages/tenancy/src/adapters/persistence/schema.ts',
         '../../packages/tenancy/src/adapters/persistence/shares-schema.ts',
       ],
       ```
  </action>
  <verify>
    <automated>cd /home/claude/budget && bunx tsc --noEmit -p packages/tenancy/tsconfig.json && grep -F 'workspace_kind' packages/tenancy/src/adapters/persistence/schema.ts && grep -F 'workspaces_currency_immutable' apps/migrator/post-migration.sql && grep -F 'shares_sum_invariant' apps/migrator/post-migration.sql && grep -F 'workspace_members_private_cap' apps/migrator/post-migration.sql && grep -F 'workspace_members_self' packages/tenancy/src/adapters/persistence/schema.ts</automated>
  </verify>
  <acceptance_criteria>
    - workspace_kind enum declared: `grep -F "tenancy.enum('workspace_kind', ['PRIVATE', 'SHARED'])" packages/tenancy/src/adapters/persistence/schema.ts` exits 0
    - workspaces table has kind + default_currency columns: `grep -E '(kind|default_currency)' packages/tenancy/src/adapters/persistence/schema.ts | wc -l` returns at least 2
    - workspace_members has TWO policies (PC-01): `grep -E "pgPolicy\('workspace_members_(tenant_isolation|self)'" packages/tenancy/src/adapters/persistence/schema.ts | wc -l` returns 2
    - workspace_members_self uses app.current_user_id (PC-01): `grep -F "app.current_user_id" packages/tenancy/src/adapters/persistence/schema.ts` exits 0
    - shares table uses NUMERIC(5,2): `grep -F "numeric('percentage', { precision: 5, scale: 2 })" packages/tenancy/src/adapters/persistence/shares-schema.ts` exits 0
    - shares table has composite primaryKey: `grep -F 'primaryKey({ columns:' packages/tenancy/src/adapters/persistence/shares-schema.ts` exits 0
    - post-migration trigger blocks default_currency change: `grep -F 'default_currency is immutable' apps/migrator/post-migration.sql` exits 0
    - post-migration constraint trigger enforces sum=100: `grep -F 'must sum to 100' apps/migrator/post-migration.sql` exits 0
    - PC-11 PRIVATE-cap trigger declared: `grep -F 'workspace_members_private_cap' apps/migrator/post-migration.sql && grep -F 'PRIVATE workspaces accept only the owner' apps/migrator/post-migration.sql` exits 0
    - post-migration FORCE RLS on 3 tenancy tables: `grep -E 'tenancy\\.(workspaces|workspace_members|shared_workspace_member_shares) FORCE ROW LEVEL SECURITY' apps/migrator/post-migration.sql | wc -l` returns 3
    - drizzle.config.ts includes tenancy schema files: `grep -F 'tenancy/src/adapters/persistence' apps/migrator/drizzle.config.ts` exits 0
    - tsc passes
  </acceptance_criteria>
  <done>Tenancy schema declared with kind enum + immutability trigger + shares-sum trigger + PC-11 PRIVATE-cap BEFORE-INSERT trigger + PC-01 workspace_members_self bootstrap policy. RLS predicates use app.tenant_ids array (D-08).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: organization plugin config + organizationHooks (D-02, D-04, D-06) — uses withTenantTx (PC-03)</name>
  <files>
    packages/tenancy/src/adapters/persistence/better-auth-org.ts,
    packages/tenancy/src/adapters/persistence/workspace-repo.ts
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-RESEARCH.md §"Pattern 3" lines 595-647 (organization plugin + organizationHooks reference impl)
    - .planning/phases/01-foundations/01-CONTEXT.md D-02, D-04, D-06, D-12, TENT-09, TENT-10, TENT-11
    - .planning/phases/01-foundations/01-RESEARCH.md §"Common Pitfalls" Pitfall 3 (no customSession)
    - packages/identity/src/adapters/persistence/better-auth.ts (createAuth factory accepting additionalPlugins)
    - packages/tenancy/src/adapters/persistence/schema.ts (table shapes from Task 2)
    - packages/platform/src/db/tx.ts (withTenantTx extended signature: withTenantTx(workspaceId, userId, fn) — PC-03)
  </read_first>
  <behavior>
    - createOrganizationPlugin(deps: { emailSender, appUrl }) returns the configured organization plugin
    - allowUserToCreateOrganization: () => true (TENT-09 unbounded)
    - schema.organization.modelName = 'workspaces', additionalFields: { kind, default_currency, slug }
    - schema.member.modelName = 'workspace_members'
    - schema.invitation.modelName = 'workspace_invitations'
    - organizationHooks.beforeAddMember: app-layer rejection if organization.kind === 'PRIVATE' AND member_count >= 1 (D-02 — defense in depth; PC-11 trigger is the race-free wall)
    - organizationHooks.beforeUpdateOrganization: throw if before.default_currency !== after.default_currency (D-04 — DB trigger is the second wall)
    - organizationHooks.afterAddMember: if organization.kind === 'SHARED' → INSERT INTO tenancy.shared_workspace_member_shares using withTenantTx(workspaceId, userId) (D-06, PC-03 — never raw appPool().connect())
    - sendInvitationEmail uses EmailSender port (TENT-02)
    - PC-03: ALL hook DB writes route through withTenantTx (extended signature) — never appPool().connect() + raw query
  </behavior>
  <action>
    1. Implement `packages/tenancy/src/adapters/persistence/better-auth-org.ts`:
       ```ts
       import { organization } from 'better-auth/plugins';
       import { sql } from 'drizzle-orm';
       import { withTenantTx } from '@budget/platform';
       import { TenantId, UserId, type EmailSender } from '@budget/shared-kernel';

       export interface OrgDeps {
         emailSender: EmailSender;
         appUrl: string;
       }

       export function createOrganizationPlugin(deps: OrgDeps) {
         return organization({
           // TENT-09: unlimited orgs per user
           allowUserToCreateOrganization: async () => true,

           // D-12: map to our domain table names
           schema: {
             organization: {
               modelName: 'workspaces',
               additionalFields: {
                 kind: { type: 'string', input: true, required: true },             // D-02 TENT-10
                 default_currency: { type: 'string', input: true, required: true }, // D-04 TENT-11
                 slug: { type: 'string', input: true, required: true },             // public-facing nanoid
               },
             },
             member: { modelName: 'workspace_members' },
             invitation: { modelName: 'workspace_invitations' },
           },

           organizationHooks: {
             // D-02: PRIVATE rejects invites (app-layer defense in depth; PC-11 trigger is race-free wall)
             beforeAddMember: async ({ member, organization }) => {
               const org = organization as unknown as { id: string; kind: 'PRIVATE'|'SHARED' };
               const actorUserId = (member as { user_id: string }).user_id;
               // PC-03: use withTenantTx(workspaceId, userId, fn) — never appPool().connect()
               const result = await withTenantTx(TenantId(org.id), UserId(actorUserId), async (tx) => {
                 const r = await tx.execute(sql`SELECT count(*)::int AS c FROM tenancy.workspace_members WHERE workspace_id = ${org.id}`);
                 return ((r.rows?.[0] as { c: number } | undefined)?.c) ?? 0;
               });
               if (result.isErr()) throw result.error;
               if (org.kind === 'PRIVATE' && result.value >= 1) {
                 throw new Error('PRIVATE workspaces accept only the owner. Convert to SHARED first.');
               }
             },

             // D-04: default_currency immutable
             beforeUpdateOrganization: async ({ data }) => {
               // 'data' contains proposed updates — block if it includes default_currency at all
               if ((data as { default_currency?: unknown }).default_currency !== undefined) {
                 throw new Error('default_currency is immutable post-create (TENT-11, D-04)');
               }
             },

             // D-06: SHARED workspace gains member → insert 0% share row.
             // PC-03: use withTenantTx(workspaceId, userId, fn) — extended signature sets BOTH
             // app.tenant_ids AND app.current_user_id GUCs in same SET LOCAL pair.
             afterAddMember: async ({ member, organization }) => {
               const org = organization as unknown as { id: string; kind: 'PRIVATE'|'SHARED' };
               if (org.kind !== 'SHARED') return;
               const memberUserId = (member as { user_id: string }).user_id;
               const r = await withTenantTx(TenantId(org.id), UserId(memberUserId), async (tx) => {
                 await tx.execute(sql`
                   INSERT INTO tenancy.shared_workspace_member_shares (workspace_id, user_id, percentage)
                   VALUES (${org.id}, ${memberUserId}, 0)
                   ON CONFLICT DO NOTHING
                 `);
               });
               if (r.isErr()) throw r.error;
             },
           },

           sendInvitationEmail: async ({ id, email, organization, inviter }) => {
             const url = `${deps.appUrl}/accept-invitation/${id}`;
             await deps.emailSender.send({
               to: email,
               template: 'workspace-invite',
               vars: {
                 url,
                 workspace: (organization as { name: string }).name,
                 inviter: (inviter as { user: { name: string } }).user.name,
               },
             });
           },
         });
       }
       ```
    2. Implement `packages/tenancy/src/adapters/persistence/workspace-repo.ts` — DrizzleWorkspaceRepo + DrizzleMemberShareRepo classes. Key methods:
       - WorkspaceRepo.findById, listForUser (joins workspace_members), listMembers
       - MemberShareRepo.list, MemberShareRepo.update — must perform the update inside withTenantTx so the constraint trigger sees the full new state at COMMIT time. Use the EXTENDED withTenantTx signature with both workspaceId AND actorUserId (PC-03):
         ```ts
         async update(workspaceId: string, shares: ShareEntry[], actorUserId: string): Promise<void> {
           const tid = TenantId(workspaceId);
           const aid = UserId(actorUserId);
           const r = await withTenantTx(tid, aid, async (tx) => {
             // Validate sum=100 in domain first (defense in depth; trigger is the second wall)
             const v = validateShares(shares);
             if (v.isErr()) throw v.error;
             // Snapshot before
             const before = await tx.execute(sql`SELECT user_id, percentage FROM tenancy.shared_workspace_member_shares WHERE workspace_id = ${workspaceId}`);
             // Replace all rows for this workspace
             await tx.execute(sql`DELETE FROM tenancy.shared_workspace_member_shares WHERE workspace_id = ${workspaceId}`);
             for (const s of shares) {
               await tx.execute(sql`INSERT INTO tenancy.shared_workspace_member_shares (workspace_id, user_id, percentage) VALUES (${workspaceId}, ${s.userId}, ${s.percentage})`);
             }
             // Audit
             await writeAudit(tx, { tenantId: tid, entityType: 'shared_workspace_member_shares', entityId: workspaceId, action: 'update', actorUserId: aid, before: before.rows, after: shares });
             // Outbox SharesUpdated event
             await writeOutbox(tx, { tenantId: tid, aggregateType: 'workspace', aggregateId: workspaceId, eventType: 'tenancy.shares.updated', payload: { shares, actorUserId } });
           });
           if (r.isErr()) throw r.error;
         }
         ```
       (validateShares + writeAudit + writeOutbox imported from domain/share + @budget/platform respectively.)
  </action>
  <verify>
    <automated>cd /home/claude/budget && bunx tsc --noEmit -p packages/tenancy/tsconfig.json && bunx depcruise --config .dependency-cruiser.cjs --output-type err packages/tenancy && ! grep -F 'appPool().connect()' packages/tenancy/src/adapters/persistence/better-auth-org.ts</automated>
  </verify>
  <acceptance_criteria>
    - better-auth-org.ts uses organization plugin: `grep -F "from 'better-auth/plugins'" packages/tenancy/src/adapters/persistence/better-auth-org.ts` exits 0
    - allowUserToCreateOrganization always true (TENT-09): `grep -F 'allowUserToCreateOrganization: async () => true' packages/tenancy/src/adapters/persistence/better-auth-org.ts` exits 0
    - additionalFields includes kind + default_currency: `grep -E '(kind:|default_currency:)' packages/tenancy/src/adapters/persistence/better-auth-org.ts | wc -l` returns at least 2
    - beforeAddMember rejects PRIVATE invite: `grep -F 'PRIVATE workspaces accept only the owner' packages/tenancy/src/adapters/persistence/better-auth-org.ts` exits 0
    - beforeUpdateOrganization blocks currency change: `grep -F 'default_currency is immutable' packages/tenancy/src/adapters/persistence/better-auth-org.ts` exits 0
    - afterAddMember inserts 0% share for SHARED via withTenantTx (PC-03): `grep -F 'shared_workspace_member_shares' packages/tenancy/src/adapters/persistence/better-auth-org.ts && grep -F 'withTenantTx' packages/tenancy/src/adapters/persistence/better-auth-org.ts` exits 0
    - PC-03: NO raw appPool().connect() in this file: `! grep -F 'appPool().connect()' packages/tenancy/src/adapters/persistence/better-auth-org.ts` exits 0
    - sendInvitationEmail uses EmailSender port: `grep -F 'deps.emailSender.send' packages/tenancy/src/adapters/persistence/better-auth-org.ts` exits 0
    - workspace-repo.ts MemberShareRepo.update uses withTenantTx + writeAudit + writeOutbox: `for s in withTenantTx writeAudit writeOutbox; do grep -F "$s" packages/tenancy/src/adapters/persistence/workspace-repo.ts; done` exits 0
    - tsc passes; dep-cruiser passes
  </acceptance_criteria>
  <done>organization plugin configured with all D-02/D-04/D-06 hooks; sendInvitationEmail wired to email port; ALL hook DB writes use withTenantTx(workspaceId, userId, fn) (PC-03 — no raw appPool().connect()); MemberShareRepo.update writes audit + outbox in same tx as the share update.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Application services + 9 integration tests covering all TENT-* requirements + PC-11 TOCTOU regression test</name>
  <files>
    packages/tenancy/src/application/create-workspace.ts,
    packages/tenancy/src/application/invite-member.ts,
    packages/tenancy/src/application/accept-invitation.ts,
    packages/tenancy/src/application/leave-workspace.ts,
    packages/tenancy/src/application/transfer-ownership.ts,
    packages/tenancy/src/application/update-shares.ts,
    packages/tenancy/src/application/set-active-workspaces.ts,
    packages/tenancy/src/application/list-active-workspaces.ts,
    packages/tenancy/test/create-private.test.ts,
    packages/tenancy/test/create-shared-invite.test.ts,
    packages/tenancy/test/role-enforcement.test.ts,
    packages/tenancy/test/multi-shared.test.ts,
    packages/tenancy/test/transfer-ownership.test.ts,
    packages/tenancy/test/leave-workspace.test.ts,
    packages/tenancy/test/default-currency-immutable.test.ts,
    packages/tenancy/test/active-filter.test.ts,
    packages/tenancy/test/shares-audit.test.ts,
    packages/tenancy/test/private-toctou.test.ts
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-VALIDATION.md rows 2a-2h, TENT-12, TENT-13 (test paths and expectations)
    - .planning/phases/01-foundations/01-CONTEXT.md D-01 to D-07, TENT-01 to TENT-13
    - packages/tenancy/src/adapters/persistence/better-auth-org.ts (organization plugin instance)
    - packages/identity/src/adapters/persistence/better-auth.ts (createAuth factory)
    - packages/db/test/testcontainer.ts (PC-06 — Wave-1 testcontainer helper)
  </read_first>
  <behavior>
    Each application service is a thin function: takes deps + input → calls auth.api / repo, returns Result.
    - createWorkspace({ ownerUserId, name, kind, default_currency }) → calls auth.api.createOrganization with additionalFields
    - inviteMember({ workspaceId, email, role }) → auth.api.createInvitation
    - acceptInvitation({ token })
    - leaveWorkspace({ workspaceId, userId }) → checks last-owner guard (TENT-05), then auth.api.removeMember
    - transferOwnership({ workspaceId, fromUserId, toUserId })
    - updateShares({ workspaceId, ownerUserId, shares }) → calls MemberShareRepo.update
    - setActiveWorkspaces({ userId, workspaceIds }) → updates user_preferences.active_workspace_ids (intersect with actual memberships server-side)
    - listActiveWorkspaces({ userId }) → returns user_preferences.active_workspace_ids ∩ memberships

    Tests use the testcontainer-backed DB (PC-06). Skip-if-env removed for these tests; testcontainer helper provides DATABASE_URL_APP at test time:

    9 integration tests (one per TENT-* requirement cluster):
    - create-private.test.ts: createWorkspace kind=PRIVATE → workspace.kind==='PRIVATE', memberCount==1 (TENT-01, TENT-10)
    - create-shared-invite.test.ts: createWorkspace kind=SHARED → invite member → invitation email sent via StdoutEmailSender capture (TENT-02, TENT-09)
    - role-enforcement.test.ts: member (not owner) calling inviteMember rejected (TENT-03)
    - multi-shared.test.ts: same user can be member of 3 SHARED workspaces simultaneously (TENT-04, TENT-09)
    - transfer-ownership.test.ts: transferOwnership succeeds; previous owner becomes member; previous owner CAN now leave (TENT-05)
    - leave-workspace.test.ts: member can leave SHARED; sole owner CANNOT leave (TENT-05, TENT-06)
    - default-currency-immutable.test.ts: trying to update workspace default_currency throws — verifies BOTH the app-layer hook AND the DB trigger fire (TENT-11, D-04)
    - active-filter.test.ts: setActiveWorkspaces persists; logout/login (re-fetch) returns same array (TENT-12, D-07)
    - shares-audit.test.ts: SHARED owner updates shares; sum=100 enforced; audit_history row written; trying sum=99 throws (TENT-13, D-06)

    + PC-11 regression test (private-toctou.test.ts): seed PRIVATE workspace with owner; spawn TWO concurrent INSERT attempts into workspace_members for that workspace (different second-member UUIDs); assert exactly ONE succeeds and the other raises with the trigger's PRIVATE-cap exception. Proves race-free guard.
  </behavior>
  <action>
    1. Implement application services. Each service signature:
       ```ts
       export interface CreateWorkspaceInput { name: string; kind: 'PRIVATE'|'SHARED'; default_currency: string; ownerUserId: string }
       export async function createWorkspace(deps: { auth: ReturnType<typeof createAuth> }, input: CreateWorkspaceInput): Promise<Result<{ workspaceId: string }, Error>> {
         try {
           // generate slug nanoid(12) — import from shared-kernel
           const slug = generateSlug();
           const r = await deps.auth.api.createOrganization({ body: { name: input.name, slug, kind: input.kind, default_currency: input.default_currency }, headers: /* user session */ });
           return ok({ workspaceId: r.id });
         } catch (e) { return err(e as Error); }
       }
       ```
       (generateSlug uses nanoid — add `nanoid` dependency to packages/tenancy and a `slug.ts` helper.)
    2. WRITE all 9 test files plus the new private-toctou.test.ts. Tests use the full createAuth({ ..., additionalPlugins: [createOrganizationPlugin({ emailSender, appUrl })] }) so the org plugin hooks fire. Use the testcontainer helper from PC-06:
       ```ts
       import { startTestcontainer } from '@budget/db/test/testcontainer';
       beforeAll(async () => { await startTestcontainer(); });   // sets DATABASE_URL_APP
       ```
       Sample for `create-private.test.ts`:
       ```ts
       import { test, expect, beforeAll } from 'bun:test';
       import { startTestcontainer } from '@budget/db/test/testcontainer';
       import { StdoutEmailSender } from '@budget/shared-kernel';
       import { LibsodiumKeyStore } from '@budget/platform';
       import { createIdentityModule } from '@budget/identity';
       import { createTenancyModule } from '@budget/tenancy';
       import { createWorkspace } from '../src/application/create-workspace';
       import { signUp } from '@budget/identity';

       beforeAll(async () => { await startTestcontainer(); });

       test('createWorkspace PRIVATE has kind=PRIVATE, memberCount=1', async () => {
         const sender = new StdoutEmailSender();
         const tenancy = createTenancyModule({ emailSender: sender, appUrl: 'http://localhost:3000' });
         const identity = createIdentityModule({ emailSender: sender, keyStore: new LibsodiumKeyStore(), additionalPlugins: [tenancy.organizationPlugin] });
         const u = await signUp({ auth: identity.auth }, { email: `t${Date.now()}@x.com`, password: 'changeme1234', name: 'O', locale: 'en', displayCurrency: 'USD' });
         expect(u.isOk()).toBe(true);
         const w = await createWorkspace({ auth: identity.auth }, { name: 'Mine', kind: 'PRIVATE', default_currency: 'USD', ownerUserId: u.isOk() ? u.value.userId : '' });
         expect(w.isOk()).toBe(true);
         // Read back via repo and assert kind+memberCount
       });
       ```
       Cover all 9 behaviors. For `default-currency-immutable.test.ts` confirm BOTH app-layer hook (try `auth.api.updateOrganization({ body: { default_currency: 'EUR' } })` → throws) AND trigger (raw SQL UPDATE bypassing app → trigger throws).
       For `shares-audit.test.ts` use sender + assert `audit_history` row visible inside the same workspace's tenant context.
    3. WRITE `packages/tenancy/test/private-toctou.test.ts` (PC-11):
       ```ts
       import { test, expect, beforeAll } from 'bun:test';
       import { sql } from 'drizzle-orm';
       import { startTestcontainer } from '@budget/db/test/testcontainer';
       import { withTenantTx } from '@budget/platform';
       import { TenantId, UserId } from '@budget/shared-kernel';

       beforeAll(async () => { await startTestcontainer(); });

       test('PC-11 PRIVATE-cap trigger blocks 2nd member under concurrency', async () => {
         // Setup: PRIVATE workspace with one owner row already present (seeded via createWorkspace path).
         // Spawn two concurrent withTenantTx attempts to INSERT a 2nd member.
         const wsId = '...'; // use a freshly-created PRIVATE workspace id
         const user1 = '...'; const user2 = '...';
         const tasks = [user1, user2].map((uid) => withTenantTx(TenantId(wsId), UserId(uid), async (tx) => {
           await tx.execute(sql`INSERT INTO tenancy.workspace_members (id, workspace_id, user_id, role) VALUES (gen_random_uuid(), ${wsId}, ${uid}, 'member')`);
         }));
         const results = await Promise.all(tasks);
         const ok = results.filter(r => r.isOk()).length;
         const err = results.filter(r => r.isErr()).length;
         expect(ok).toBe(0);    // both blocked since owner already occupies the single seat
         expect(err).toBe(2);
         results.filter(r => r.isErr()).forEach(r => {
           if (r.isErr()) expect(r.error.message).toMatch(/PRIVATE workspaces accept only the owner/);
         });
       });
       ```
  </action>
  <verify>
    <automated>cd /home/claude/budget && bunx tsc --noEmit -p packages/tenancy/tsconfig.json && bunx depcruise --config .dependency-cruiser.cjs --output-type err packages/tenancy</automated>
  </verify>
  <acceptance_criteria>
    - 8 application services exist: `for f in create-workspace invite-member accept-invitation leave-workspace transfer-ownership update-shares set-active-workspaces list-active-workspaces; do test -f packages/tenancy/src/application/${f}.ts; done` exits 0
    - All 9 + 1 test files exist: `for f in create-private create-shared-invite role-enforcement multi-shared transfer-ownership leave-workspace default-currency-immutable active-filter shares-audit private-toctou; do test -f packages/tenancy/test/${f}.test.ts; done` exits 0
    - update-shares calls MemberShareRepo.update which writes audit: covered by Task 3 ac (writeAudit). Update-shares application service forwards to repo: `grep -F 'MemberShareRepo' packages/tenancy/src/application/update-shares.ts` exits 0
    - set-active-workspaces intersects with actual memberships server-side: `grep -F 'memberships' packages/tenancy/src/application/set-active-workspaces.ts` exits 0
    - PC-11 regression test exists: `test -f packages/tenancy/test/private-toctou.test.ts && grep -F 'PRIVATE workspaces accept only the owner' packages/tenancy/test/private-toctou.test.ts` exits 0
    - tsc + dep-cruiser pass
  </acceptance_criteria>
  <done>All 8 application services + 9 integration tests covering TENT-01..13 + MONY-02 + D-01..D-07 wired. PC-11 regression test asserts BEFORE-INSERT trigger is race-free. Plan 06 ships the complete Tenancy bounded context.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| API request → workspace mutation | Better Auth role enforcement (owner/member); organizationHooks add domain invariants |
| App-layer hook → DB | Defense in depth: hook + DB trigger BOTH enforce default_currency immutability; PC-11 BEFORE-INSERT trigger is race-free PRIVATE cap |
| Cross-workspace dashboard reads | RLS with array GUC ensures user only sees workspaces they're members of |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-06-01 | Tampering | PRIVATE workspace getting a 2nd member (D-02 violation) | mitigate | TWO walls: (1) organizationHooks.beforeAddMember queries live count via withTenantTx and rejects if PRIVATE & count>=1 (app-layer defense in depth); (2) PC-11 BEFORE INSERT trigger workspace_members_private_cap raises in same tx as INSERT (race-free, TOCTOU-proof). private-toctou.test.ts asserts both walls under concurrency |
| T-01-06-02 | Tampering | default_currency change post-create (TENT-11 violation) | mitigate | Two-layer: organizationHooks.beforeUpdateOrganization throws AND DB trigger workspaces_currency_immutable raises; default-currency-immutable.test.ts asserts both layers |
| T-01-06-03 | Information Disclosure | Cross-workspace data leak via active_workspace_ids tampering (user submits another user's workspace ID) | mitigate | setActiveWorkspaces application service intersects submitted IDs with actual memberships before writing user_preferences (defense in depth — app side) AND tenant-guard middleware (Plan 07) intersects again at request time |
| T-01-06-04 | Elevation of Privilege | Member calling inviteMember (only owners can) | mitigate | Better Auth role check + role-enforcement.test.ts asserts member-call → 403 |
| T-01-06-05 | Tampering | Owner-shares update with sum != 100 | mitigate | Three-layer: domain validateShares() returns Result.err on mismatch (defense 1); app-layer guard in MemberShareRepo.update (defense 2); DB constraint trigger shares_sum_invariant (defense 3); shares-audit.test.ts asserts |
| T-01-06-06 | Repudiation | Untracked shares edits | mitigate | MemberShareRepo.update writes audit_history row in same tx as DELETE/INSERT; shares-audit.test.ts asserts visible |
| T-01-06-07 | Spoofing | Replayed invitation tokens | mitigate | Better Auth invitation table has expiresAt + status; single-use semantics handled by plugin |
| T-01-06-08 | Tampering | Last-owner leaving workspace, leaving it ownerless | mitigate | leaveWorkspace application service checks owner count via repo; rejects with TENT-05 message; leave-workspace.test.ts asserts |
| T-01-06-09 | Information Disclosure | workspace_invitations table leaking pending invites across tenants | accept (Phase 1) | Token-keyed lookup (token IS the credential). NO RLS on this table — same pattern as identity.verifications. Documented in schema comment |
| T-01-06-10 | Elevation of Privilege | Hook code escaping tenant context via raw appPool().connect() | mitigate (PC-03) | All hook DB writes use withTenantTx(workspaceId, userId, fn) extended signature; CI grep gate (Plan 00) bans appPool().connect() outside packages/db/src/tx.ts |

## PC-18 Trigger Semantics — Phase 6 Hardening (Documented Limitation)

PC-18 (deferred): The PC-11 BEFORE INSERT trigger uses `SELECT FOR KEY SHARE` to read the workspace's `kind` column under a row-level lock; this prevents the row from being updated concurrently but does NOT serialize concurrent INSERTs into `workspace_members` for the same workspace beyond what the trigger's count-then-decide already provides. Under extreme concurrency on the same workspace, two concurrent INSERTs could BOTH read count=0 (if both run before either commits). Postgres serializes the trigger function execution per row, but the count-query is non-locking. Phase 6 hardening: add a `SELECT 1 FROM tenancy.workspace_members WHERE workspace_id = ? FOR UPDATE LIMIT 1` as the first statement to take a row lock that serializes concurrent inserts, OR convert to a partial unique index using a generated column. Phase 1 ships the trigger as-is; private-toctou.test.ts demonstrates the common-case correctness.
</threat_model>

<verification>
```bash
cd /home/claude/budget
bunx tsc --noEmit -p packages/tenancy/tsconfig.json
bunx depcruise --config .dependency-cruiser.cjs --output-type err packages/tenancy
bun test packages/tenancy/test/   # 10 test files (9 + private-toctou)
grep -F 'workspaces_currency_immutable' apps/migrator/post-migration.sql
grep -F 'shares_sum_invariant' apps/migrator/post-migration.sql
grep -F 'workspace_members_private_cap' apps/migrator/post-migration.sql
grep -F 'workspace_members_self' packages/tenancy/src/adapters/persistence/schema.ts
grep -F 'tenancy.workspaces FORCE ROW LEVEL SECURITY' apps/migrator/post-migration.sql
grep -F 'tenancy.shared_workspace_member_shares FORCE ROW LEVEL SECURITY' apps/migrator/post-migration.sql
! grep -F 'appPool().connect()' packages/tenancy/src/adapters/persistence/better-auth-org.ts
```
All exit 0. Tests run real with testcontainer; skip-if removed.
</verification>

<success_criteria>
- packages/tenancy with full DDD layout (domain, contracts, ports, application, adapters)
- workspace_kind enum + workspaces table + workspace_members (TWO policies: tenant_isolation + members_self per PC-01) + shared_workspace_member_shares per D-02/06/12
- organization plugin configured via createOrganizationPlugin(deps) factory; injected into createIdentityModule.additionalPlugins via tenancy.organizationPlugin (PC-02)
- organizationHooks: PRIVATE invite-reject (app-layer defense + PC-11 trigger), default_currency immutable, SHARED member-add → 0% share insert via withTenantTx (PC-03)
- DB triggers: workspaces_currency_immutable + shares_sum_invariant + workspace_members_private_cap (defense in depth)
- All hook DB writes route through withTenantTx — CI grep gate bans raw appPool().connect()
- All 8 application services
- All 9 + 1 integration tests covering TENT-01..13 + MONY-02 + PC-11 TOCTOU regression
- audit_history rows written on shares update (D-06, ENGR-07 wiring)
- Known limitation (PC-18 — deferred to Phase 6): PRIVATE-cap trigger uses count-based check; for extreme-concurrency hardening, Phase 6 will add row-lock SELECT FOR UPDATE before the count or convert to a generated-column partial unique index
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundations/01-06-SUMMARY.md`
</output>
