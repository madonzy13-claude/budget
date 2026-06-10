---
phase: 01-foundations
plan: 05
plan_id: 01.05
type: execute
wave: 2
depends_on: ["01.00", "01.01", "01.02", "01.04"]
files_modified:
  - packages/identity/package.json
  - packages/identity/src/index.ts
  - packages/identity/src/domain/user.ts
  - packages/identity/src/domain/session.ts
  - packages/identity/src/domain/events.ts
  - packages/identity/src/contracts/api.ts
  - packages/identity/src/contracts/events.ts
  - packages/identity/src/contracts/factory.ts
  - packages/identity/src/ports/user-repo.ts
  - packages/identity/src/ports/credential-repo.ts
  - packages/identity/src/application/sign-up.ts
  - packages/identity/src/application/verify-email.ts
  - packages/identity/src/application/reset-password.ts
  - packages/identity/src/application/update-locale.ts
  - packages/identity/src/application/update-display-currency.ts
  - packages/identity/src/application/update-provider-prefs.ts
  - packages/identity/src/application/revoke-session.ts
  - packages/identity/src/application/list-sessions.ts
  - packages/identity/src/adapters/persistence/schema.ts
  - packages/identity/src/adapters/persistence/user-preferences.ts
  - packages/identity/src/adapters/persistence/better-auth.ts
  - packages/identity/src/adapters/persistence/user-repo.ts
  - packages/identity/test/sign-up.test.ts
  - packages/identity/test/verify-email.test.ts
  - packages/identity/test/reset-password.test.ts
  - packages/identity/test/sessions.test.ts
  - packages/identity/test/locale.test.ts
  - packages/identity/test/display-currency.test.ts
  - packages/identity/test/provider-prefs.test.ts
  - apps/migrator/post-migration.sql
autonomous: true
requirements:
  [
    IDNT-01,
    IDNT-02,
    IDNT-03,
    IDNT-04,
    IDNT-05,
    IDNT-06,
    IDNT-07,
    IDNT-08,
    MONY-09,
    ENGR-04,
    ENGR-13,
  ]
must_haves:
  truths:
    - "User signs up with email/password (IDNT-01) — Better Auth emailAndPassword.enabled = true"
    - "Verification email sent on signup with 24h TTL; grace login per D-13 (banner + workspace gate, no auto-block)"
    - "Password reset link 30-min TTL, single-use (D-14, IDNT-03)"
    - "Session list returns active sessions; user can revoke any from settings (IDNT-04, D-15)"
    - "User has locale field at signup; persists; settings update propagates (IDNT-05, IDNT-06)"
    - "User has display_currency independent of any workspace currency (D-05, MONY-09)"
    - "User has preferred_llm_provider + preferred_stt_provider enums; UI ships Phase 1 (adapters wire Phase 5) (IDNT-07, IDNT-08)"
    - "user_preferences.active_workspace_ids UUID[] persisted on user (D-07)"
    - "Email port wired (StdoutEmailSender dev adapter — Better Auth callbacks invoke it for verification + reset)"
    - "Session cookies httpOnly + Secure (production) + SameSite=Lax"
    - "PII columns (email, display_name) stored as ciphertext bytea + email_hash for lookup (D-16 wiring)"
    - "PC-03: Better Auth user.create.after hook uses withUserContext(userId, fn) (Plan 02 Task 2) for DEK insert — never raw appPool().connect() (CI grep gate enforces)"
    - "PC-09: DEK persistence atomicity — Phase 1 ships best-effort (after-hook) + documents Phase 6 reconciliation worker"
    - "Identity module factory createIdentityModule() exported from packages/identity/src/contracts/factory.ts; apps import from package root only (PC-02, PC-15)"
  artifacts:
    - path: packages/identity/src/adapters/persistence/better-auth.ts
      provides: "Better Auth instance with Drizzle adapter, additionalFields (locale/display_currency/llm/stt), email port wired; hooks use withUserContext (PC-03)"
      contains: "betterAuth"
    - path: packages/identity/src/adapters/persistence/schema.ts
      provides: "identity.users + identity.sessions + identity.verifications + identity.accounts (Better Auth schema mapped via additionalFields)"
      contains: "identity.users"
    - path: packages/identity/src/adapters/persistence/user-preferences.ts
      provides: "identity.user_preferences (active_workspace_ids UUID[]) per D-07"
      contains: "active_workspace_ids"
    - path: packages/identity/src/contracts/api.ts
      provides: "Cross-package importable API contracts (DTOs, route shapes)"
      contains: "export"
    - path: packages/identity/src/contracts/factory.ts
      provides: "createIdentityModule factory — apps/* import this surface only (PC-02, PC-15)"
      contains: "createIdentityModule"
  key_links:
    - from: "packages/identity/src/adapters/persistence/better-auth.ts"
      to: "@better-auth/drizzle-adapter"
      via: "drizzleAdapter(db, { provider: 'pg' })"
      pattern: "drizzleAdapter"
    - from: "Better Auth callbacks"
      to: "EmailSender port (StdoutEmailSender dev)"
      via: "sendVerificationEmail / sendResetPassword"
      pattern: "emailSender.send"
    - from: "Better Auth user.create.after hook"
      to: "withUserContext(userId, fn) — Plan 02 Task 2"
      via: "DEK insert (PC-03)"
      pattern: "withUserContext"
    - from: "packages/identity/src/adapters/persistence/schema.ts"
      to: "packages/platform crypto-keys (bytea PII)"
      via: "encrypted columns + email_hash"
      pattern: "email_hash"
---

<objective>
Ship the Identity bounded context: Better Auth instance with Drizzle adapter, email/password + verification + reset + sessions, locale + display_currency + provider prefs, and the `identity.user_preferences.active_workspace_ids` table.

Purpose: D-12 (Better Auth = workspaces via organization plugin), D-13/14/15 (verification/reset/session policy), D-05/MONY-09 (display_currency), D-07 (active_workspace_ids), IDNT-01..08, ENGR-04 (per-context layers). The Identity context is the source of truth for user authentication and preferences. Plan 6 layers Tenancy on top using the same Better Auth instance via the createIdentityModule.additionalPlugins parameter.

PC-03: All hook DB writes route through `withUserContext(userId, fn)` from Plan 02 Task 2 — the user.create.after hook generating the user's DEK uses this primitive instead of raw `appPool().connect()`. CI grep gate enforces.

PC-09: DEK persistence atomicity — Better Auth's `before` hook lets us compute hashes/ciphertext but does not currently expose its INSERT transaction to consumers. Phase 1 ships the best-effort `after` hook (DEK row written immediately after user row commits, in withUserContext); Phase 6 hardening adds a reconciliation worker that detects users with no `user_keys` row and back-fills.

Output: A `packages/identity` with the complete domain/application/ports/adapters/contracts layout, a wired Better Auth instance with all Phase-1 additionalFields and email callbacks, plus the user_preferences table.
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
@packages/platform/src/crypto/libsodium-key-store.ts
@packages/platform/src/db/tx.ts
@apps/migrator/post-migration.sql

<interfaces>
<!-- Public API of packages/identity (importable only via contracts/) -->

// contracts/api.ts
export type Locale = 'en' | 'pl' | 'uk';
export type LLMProviderName = 'claude_haiku' | 'groq';
export type STTProviderName = 'browser' | 'groq';

export interface UserDTO {
id: UserId;
email: string; // decrypted at adapter boundary
name: string; // decrypted at adapter boundary
emailVerified: boolean;
locale: Locale;
display_currency: string; // ISO-4217 (per D-05/MONY-09)
preferred_llm_provider: LLMProviderName | null;
preferred_stt_provider: STTProviderName | null;
}

export interface SessionDTO {
id: string;
userId: UserId;
device: string;
ipAddress: string;
createdAt: Date;
lastActiveAt: Date;
expiresAt: Date;
isCurrent: boolean;
}

// ports/user-repo.ts
export interface UserRepo {
findById(id: UserId): Promise<UserDTO | null>;
findByEmail(email: string): Promise<UserDTO | null>; // uses email_hash
updateLocale(id: UserId, locale: Locale): Promise<void>;
updateDisplayCurrency(id: UserId, currency: string): Promise<void>;
updateProviderPrefs(id: UserId, prefs: { llm?: LLMProviderName | null; stt?: STTProviderName | null }): Promise<void>;
getActiveWorkspaceIds(id: UserId): Promise<string[]>;
setActiveWorkspaceIds(id: UserId, ids: string[]): Promise<void>;
}

// contracts/factory.ts (PC-02, PC-15) — apps/\* import THIS surface only
export interface IdentityModule {
auth: ReturnType<typeof import('better-auth').betterAuth>;
userRepo: UserRepo;
}
export interface CreateIdentityOptions {
emailSender: import('@budget/shared-kernel').EmailSender;
keyStore: import('@budget/platform').LibsodiumKeyStore;
additionalPlugins?: unknown[]; // tenancy plugin slot (Plan 06 fills)
}
export function createIdentityModule(opts: CreateIdentityOptions): IdentityModule;
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Identity domain + contracts + ports + factory (no adapter dependency)</name>
  <files>
    packages/identity/package.json,
    packages/identity/src/index.ts,
    packages/identity/src/domain/user.ts,
    packages/identity/src/domain/session.ts,
    packages/identity/src/domain/events.ts,
    packages/identity/src/contracts/api.ts,
    packages/identity/src/contracts/events.ts,
    packages/identity/src/contracts/factory.ts,
    packages/identity/src/ports/user-repo.ts,
    packages/identity/src/ports/credential-repo.ts
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-CONTEXT.md D-05, D-07, D-12, D-13, D-14, D-15, D-22 (branded IDs)
    - .planning/phases/01-foundations/01-RESEARCH.md §"Project Structure" packages/identity layout (lines 380-400)
    - .planning/phases/01-foundations/01-CONTEXT.md §"Integration Points" (Better-Auth shape)
    - packages/shared-kernel/src/ids.ts + ports/email-sender.ts
    - .dependency-cruiser.cjs (cross-package-only-contracts rule + PC-02 apps-only-public-package-surface rule)
  </read_first>
  <behavior>
    - domain/user.ts contains User entity (no Drizzle, no Better Auth, no Hono imports — pure TS class with locale, display_currency, provider prefs invariants)
    - User.changeLocale(locale) returns Result.err if locale invalid, Result.ok otherwise
    - User.changeDisplayCurrency(ccy) returns Result.err if not 3-char ISO-4217 alpha
    - contracts/api.ts exports the DTOs/types listed in <interfaces>
    - contracts/events.ts exports event payloads (UserSignedUp, UserVerified, LocaleChanged, etc.)
    - contracts/factory.ts exports createIdentityModule() — the SOLE entry point apps/* may use to obtain the Better Auth instance + UserRepo (PC-02, PC-15)
    - ports/user-repo.ts + ports/credential-repo.ts declare interfaces only
  </behavior>
  <action>
    1. Add to `packages/identity/package.json`:
       ```json
       "dependencies": {
         "@budget/shared-kernel": "workspace:*"
       },
       "devDependencies": {},
       "scripts": { "test": "bun test", "typecheck": "tsc --noEmit -p tsconfig.json" }
       ```
       Also: `"main": "src/index.ts"`, `"exports": { ".": "./src/index.ts" }` (PC-15).
    2. Implement `packages/identity/src/contracts/api.ts` per `<interfaces>` block above.
    3. Implement `packages/identity/src/contracts/events.ts`:
       ```ts
       import type { UserId } from '@budget/shared-kernel';
       export interface UserSignedUp { userId: UserId; email: string; locale: 'en'|'pl'|'uk'; display_currency: string; }
       export interface UserVerified { userId: UserId; }
       export interface LocaleChanged { userId: UserId; locale: 'en'|'pl'|'uk'; }
       export interface DisplayCurrencyChanged { userId: UserId; currency: string; }
       export interface SessionRevoked { userId: UserId; sessionId: string; }
       ```
    4. Implement `packages/identity/src/domain/user.ts` (pure domain — NO drizzle/hono/adapter imports):
       ```ts
       import { ok, err, type Result } from '@budget/shared-kernel';
       import type { Locale, LLMProviderName, STTProviderName } from '../contracts/api';

       const ISO_4217 = /^[A-Z]{3}$/;
       const LOCALES: ReadonlyArray<Locale> = ['en', 'pl', 'uk'];

       export class User {
         constructor(
           public readonly id: string,
           public readonly email: string,
           public readonly emailVerified: boolean,
           public locale: Locale,
           public displayCurrency: string,
           public preferredLlm: LLMProviderName | null,
           public preferredStt: STTProviderName | null,
         ) {}

         changeLocale(next: Locale): Result<void, Error> {
           if (!LOCALES.includes(next)) return err(new Error(`Invalid locale: ${next}`));
           this.locale = next;
           return ok(undefined);
         }
         changeDisplayCurrency(next: string): Result<void, Error> {
           if (!ISO_4217.test(next)) return err(new Error(`Invalid ISO-4217: ${next}`));
           this.displayCurrency = next;
           return ok(undefined);
         }
         setProviderPrefs(prefs: { llm?: LLMProviderName | null; stt?: STTProviderName | null }): void {
           if (prefs.llm !== undefined) this.preferredLlm = prefs.llm;
           if (prefs.stt !== undefined) this.preferredStt = prefs.stt;
         }
       }
       ```
    5. Implement `packages/identity/src/domain/session.ts`:
       ```ts
       export class Session {
         constructor(
           public readonly id: string,
           public readonly userId: string,
           public readonly device: string,
           public readonly ipAddress: string,
           public readonly createdAt: Date,
           public readonly lastActiveAt: Date,
           public readonly expiresAt: Date,
         ) {}
       }
       ```
    6. Implement `packages/identity/src/domain/events.ts` re-exporting contracts/events.
    7. Implement `packages/identity/src/ports/user-repo.ts` per `<interfaces>` UserRepo (interface only).
    8. Implement `packages/identity/src/ports/credential-repo.ts`:
       ```ts
       export interface CredentialRepo {
         hashAndStorePassword(userId: string, password: string): Promise<void>;
         verifyPassword(email: string, password: string): Promise<{ userId: string } | null>;
       }
       ```
    9. Implement `packages/identity/src/contracts/factory.ts` (PC-02, PC-15):
       ```ts
       import type { EmailSender } from '@budget/shared-kernel';
       import type { LibsodiumKeyStore } from '@budget/platform';
       import type { UserRepo } from '../ports/user-repo';

       export interface IdentityModule {
         auth: unknown;     // typed as ReturnType<typeof betterAuth> at impl site
         userRepo: UserRepo;
       }
       export interface CreateIdentityOptions {
         emailSender: EmailSender;
         keyStore: LibsodiumKeyStore;
         additionalPlugins?: unknown[];   // tenancy plugin slot (Plan 06 fills via createTenancyModule().organizationPlugin)
       }

       export function createIdentityModule(opts: CreateIdentityOptions): IdentityModule {
         // Lazy require to keep contracts/ free of adapter imports at type-check time.
         // eslint-disable-next-line @typescript-eslint/no-require-imports
         const { createAuth } = require('../adapters/persistence/better-auth') as typeof import('../adapters/persistence/better-auth');
         // eslint-disable-next-line @typescript-eslint/no-require-imports
         const { DrizzleUserRepo } = require('../adapters/persistence/user-repo') as typeof import('../adapters/persistence/user-repo');
         return {
           auth: createAuth(opts),
           userRepo: new DrizzleUserRepo(),
         };
       }
       ```
    10. Implement `packages/identity/src/index.ts` (PC-02, PC-15 — apps/* see ONLY this surface):
        ```ts
        export * from './contracts/api';
        export * from './contracts/events';
        export * from './contracts/factory';
        export type { UserRepo } from './ports/user-repo';
        export type { CredentialRepo } from './ports/credential-repo';
        // domain/* and adapters/* are NOT re-exported.
        ```

  </action>
  <verify>
    <automated>cd /home/claude/budget && bunx tsc --noEmit -p packages/identity/tsconfig.json && bunx depcruise --config .dependency-cruiser.cjs --output-type err packages/identity</automated>
  </verify>
  <acceptance_criteria>
    - `packages/identity/src/domain/user.ts` does NOT import drizzle-orm: `! grep -F "from 'drizzle-orm'" packages/identity/src/domain/user.ts` exits 0
    - `packages/identity/src/domain/user.ts` does NOT import better-auth: `! grep -F "from 'better-auth'" packages/identity/src/domain/user.ts` exits 0
    - User.changeLocale + User.changeDisplayCurrency exist: `grep -E '(changeLocale|changeDisplayCurrency)' packages/identity/src/domain/user.ts | wc -l` returns at least 2
    - contracts/api.ts exports Locale enum: `grep -F "export type Locale = 'en' | 'pl' | 'uk'" packages/identity/src/contracts/api.ts` exits 0
    - contracts/api.ts exports UserDTO with display_currency field: `grep -F 'display_currency' packages/identity/src/contracts/api.ts` exits 0
    - factory.ts exports createIdentityModule: `grep -F 'export function createIdentityModule' packages/identity/src/contracts/factory.ts` exits 0
    - index.ts re-exports factory: `grep -F "export * from './contracts/factory'" packages/identity/src/index.ts` exits 0
    - ports/user-repo.ts declares UserRepo interface: `grep -F 'export interface UserRepo' packages/identity/src/ports/user-repo.ts` exits 0
    - dependency-cruiser passes: `bunx depcruise --config .dependency-cruiser.cjs --output-type err packages/identity` exits 0
    - tsc passes: `bunx tsc --noEmit -p packages/identity/tsconfig.json` exits 0
  </acceptance_criteria>
  <done>Identity domain + contracts + ports + factory shipped without adapter imports. createIdentityModule factory ready for apps/* consumption (PC-02). dep-cruiser passes (D-27/ENGR-10 enforced).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Drizzle persistence schema (Better Auth tables + user_preferences) + post-migration grants</name>
  <files>
    packages/identity/src/adapters/persistence/schema.ts,
    packages/identity/src/adapters/persistence/user-preferences.ts,
    apps/migrator/post-migration.sql,
    apps/migrator/drizzle.config.ts
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-CONTEXT.md D-12, D-15, D-07
    - .planning/phases/01-foundations/01-RESEARCH.md §"Pattern 3: Better Auth organization plugin" (additionalFields shape — lines 552-647)
    - .planning/phases/01-foundations/01-RESEARCH.md §"Common Pitfalls" Pitfall 8 (Better Auth Drizzle adapter requires experimental.joins)
    - apps/migrator/post-migration.sql (existing state)
    - apps/migrator/drizzle.config.ts (schema array — extend to include identity schema files)
  </read_first>
  <behavior>
    - identity.users, identity.sessions, identity.accounts, identity.verifications declared per Better Auth Drizzle adapter expectations
    - identity.users carries additionalFields: locale (text), display_currency (text), preferred_llm_provider (text nullable), preferred_stt_provider (text nullable)
    - identity.users has email_hash bytea (deterministic lookup per D-16) + email_encrypted bytea + email_nonce bytea (PII at rest)
    - identity.user_preferences: user_id (uuid PK FK to identity.users), active_workspace_ids uuid[] (default '{}'), created_at, updated_at
    - All tables FORCE RLS in post-migration.sql with appropriate policies (sessions: user_id = current_user; users: user can see own row + others by email_hash for invite flow)
  </behavior>
  <action>
    1. Implement `packages/identity/src/adapters/persistence/schema.ts`:
       ```ts
       import { sql } from 'drizzle-orm';
       import { pgPolicy, uuid, text, boolean, timestamp, customType, uniqueIndex } from 'drizzle-orm/pg-core';
       import { identity } from '@budget/platform';
       import { appRole, workerRole } from '@budget/platform';

       const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
         dataType() { return 'bytea'; },
         toDriver(v) { return Buffer.from(v); },
         fromDriver(v) { return new Uint8Array(v); },
       });

       /**
        * Better Auth manages this table; additionalFields appended:
        *   locale, display_currency, preferred_llm_provider, preferred_stt_provider
        * D-16 PII at rest: email_hash + email_encrypted + email_nonce columns.
        * Phase 1 keeps Better Auth's plain `email` text column for compatibility;
        * Phase 6 TODO: drop plain email, route lookups exclusively via email_hash.
        */
       export const users = identity.table('users', {
         id: uuid('id').primaryKey(),
         email: text('email').notNull(),
         emailHash: bytea('email_hash').notNull(),
         emailEncrypted: bytea('email_encrypted'),
         emailNonce: bytea('email_nonce'),
         emailVerified: boolean('email_verified').default(false).notNull(),
         name: text('name').notNull(),
         nameEncrypted: bytea('name_encrypted'),
         nameNonce: bytea('name_nonce'),
         image: text('image'),
         locale: text('locale').notNull().default('en'),
         displayCurrency: text('display_currency').notNull().default('USD'),
         preferredLlmProvider: text('preferred_llm_provider'),
         preferredSttProvider: text('preferred_stt_provider'),
         createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
         updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
       }, (t) => [
         uniqueIndex('users_email_hash_uq').on(t.emailHash),
         pgPolicy('users_self_visible', {
           as: 'permissive',
           for: 'all',
           to: [appRole, workerRole],
           using: sql`${t.id} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
           withCheck: sql`${t.id} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
         }),
       ]);

       export const sessions = identity.table('sessions', {
         id: text('id').primaryKey(),
         userId: uuid('user_id').notNull(),
         token: text('token').notNull(),
         expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
         ipAddress: text('ip_address'),
         userAgent: text('user_agent'),
         createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
       }, (t) => [
         pgPolicy('sessions_owner_only', {
           as: 'permissive',
           for: 'all',
           to: [appRole, workerRole],
           using: sql`${t.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
           withCheck: sql`${t.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
         }),
       ]);

       export const accounts = identity.table('accounts', {
         id: text('id').primaryKey(),
         userId: uuid('user_id').notNull(),
         accountId: text('account_id').notNull(),
         providerId: text('provider_id').notNull(),
         password: text('password'),
         accessToken: text('access_token'),
         refreshToken: text('refresh_token'),
         idToken: text('id_token'),
         accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
         refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
         scope: text('scope'),
         createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
         updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
       }, (t) => [
         pgPolicy('accounts_owner_only', {
           as: 'permissive',
           for: 'all',
           to: [appRole, workerRole],
           using: sql`${t.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
           withCheck: sql`${t.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
         }),
       ]);

       export const verifications = identity.table('verifications', {
         id: text('id').primaryKey(),
         identifier: text('identifier').notNull(),
         value: text('value').notNull(),
         expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
         createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
       });
       ```
    2. Implement `packages/identity/src/adapters/persistence/user-preferences.ts`:
       ```ts
       import { sql } from 'drizzle-orm';
       import { pgPolicy, uuid, timestamp } from 'drizzle-orm/pg-core';
       import { identity } from '@budget/platform';
       import { appRole, workerRole } from '@budget/platform';

       /** D-07: persisted multi-select active workspaces filter. */
       export const userPreferences = identity.table('user_preferences', {
         userId: uuid('user_id').primaryKey(),
         activeWorkspaceIds: uuid('active_workspace_ids').array().notNull().default(sql`'{}'::uuid[]`),
         createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
         updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
       }, (t) => [
         pgPolicy('user_preferences_owner_only', {
           as: 'permissive',
           for: 'all',
           to: [appRole, workerRole],
           using: sql`${t.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
           withCheck: sql`${t.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
         }),
       ]);
       ```
    3. APPEND to `apps/migrator/post-migration.sql`:
       ```sql
       -- Plan 05: identity schema
       GRANT USAGE ON SCHEMA identity TO app_role, worker_role;
       GRANT SELECT, INSERT, UPDATE, DELETE ON identity.users, identity.sessions, identity.accounts TO app_role;
       GRANT SELECT ON identity.users, identity.sessions, identity.accounts TO worker_role;
       GRANT SELECT, INSERT, UPDATE, DELETE ON identity.verifications TO app_role;
       GRANT SELECT, INSERT, UPDATE, DELETE ON identity.user_preferences TO app_role;
       GRANT SELECT ON identity.user_preferences TO worker_role;

       ALTER TABLE identity.users FORCE ROW LEVEL SECURITY;
       ALTER TABLE identity.sessions FORCE ROW LEVEL SECURITY;
       ALTER TABLE identity.accounts FORCE ROW LEVEL SECURITY;
       ALTER TABLE identity.user_preferences FORCE ROW LEVEL SECURITY;
       -- identity.verifications: NO RLS (token-keyed lookups; token IS the credential).
       ```
    4. Update `apps/migrator/drizzle.config.ts` `schema` to an array including identity schema files:
       ```ts
       schema: [
         '../../packages/platform/src/db/expense-ledger.ts',
         '../../packages/platform/src/audit/schema.ts',
         '../../packages/platform/src/outbox/schema.ts',
         '../../packages/platform/src/crypto/user-keys-schema.ts',
         '../../packages/identity/src/adapters/persistence/schema.ts',
         '../../packages/identity/src/adapters/persistence/user-preferences.ts',
       ],
       ```

  </action>
  <verify>
    <automated>cd /home/claude/budget && bunx tsc --noEmit -p packages/identity/tsconfig.json && grep -F 'identity.users FORCE ROW LEVEL SECURITY' apps/migrator/post-migration.sql && grep -F 'active_workspace_ids' packages/identity/src/adapters/persistence/user-preferences.ts</automated>
  </verify>
  <acceptance_criteria>
    - identity.users contains email_hash + email_encrypted columns: `grep -E '(email_hash|email_encrypted)' packages/identity/src/adapters/persistence/schema.ts | wc -l` returns at least 2
    - identity.users has additionalFields per D-12 (locale, display_currency, preferred_llm_provider, preferred_stt_provider): `for f in locale display_currency preferred_llm_provider preferred_stt_provider; do grep -F "$f" packages/identity/src/adapters/persistence/schema.ts; done` exits 0
    - sessions table declared: `grep -F "identity.table('sessions'" packages/identity/src/adapters/persistence/schema.ts` exits 0
    - user_preferences declares active_workspace_ids as uuid array: `grep -E "uuid\\('active_workspace_ids'\\)\\.array\\(\\)" packages/identity/src/adapters/persistence/user-preferences.ts` exits 0
    - post-migration.sql contains identity FORCE RLS for 4 tables: `grep -E 'identity\\.(users|sessions|accounts|user_preferences) FORCE ROW LEVEL SECURITY' apps/migrator/post-migration.sql | wc -l` returns 4
    - drizzle.config.ts schema list includes identity: `grep -F 'identity/src/adapters/persistence' apps/migrator/drizzle.config.ts` exits 0
    - `bunx tsc --noEmit -p packages/identity/tsconfig.json` exits 0
  </acceptance_criteria>
  <done>Identity persistence schema declared. user_preferences ships D-07 active_workspace_ids. PII columns + email_hash placeholders ready for D-16 wiring in adapter.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Better Auth instance + email port wiring + provider prefs application services (PC-03 withUserContext for hooks, PC-09 atomic DEK plan)</name>
  <files>
    packages/identity/src/adapters/persistence/better-auth.ts,
    packages/identity/src/adapters/persistence/user-repo.ts,
    packages/identity/src/application/sign-up.ts,
    packages/identity/src/application/verify-email.ts,
    packages/identity/src/application/reset-password.ts,
    packages/identity/src/application/update-locale.ts,
    packages/identity/src/application/update-display-currency.ts,
    packages/identity/src/application/update-provider-prefs.ts,
    packages/identity/src/application/list-sessions.ts,
    packages/identity/src/application/revoke-session.ts,
    packages/identity/test/sign-up.test.ts,
    packages/identity/test/verify-email.test.ts,
    packages/identity/test/reset-password.test.ts,
    packages/identity/test/sessions.test.ts,
    packages/identity/test/locale.test.ts,
    packages/identity/test/display-currency.test.ts,
    packages/identity/test/provider-prefs.test.ts
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-RESEARCH.md §"Pattern 3" (lines 555-647) — full Better Auth instance reference
    - .planning/phases/01-foundations/01-CONTEXT.md D-12, D-13, D-14, D-15
    - .planning/phases/01-foundations/01-RESEARCH.md §"Common Pitfalls" Pitfall 3 (do NOT use customSession), Pitfall 8 (experimental.joins)
    - .planning/phases/01-foundations/01-VALIDATION.md rows 1a-1f, 2g, IDNT-07/08
    - packages/shared-kernel/src/ports/email-sender.ts (StdoutEmailSender to wire)
    - packages/identity/src/adapters/persistence/schema.ts (Plan 05 Task 2 — table shapes)
    - packages/platform/src/db/tx.ts (PC-03 withUserContext primitive — REQUIRED for user.create.after hook)
  </read_first>
  <behavior>
    Better Auth instance:
    - `betterAuth({ database: drizzleAdapter(db, { provider: 'pg' }), ... })`
    - `emailAndPassword.enabled = true`, `requireEmailVerification: false` (grace login per D-13), `minPasswordLength: 10`
    - `emailVerification.sendVerificationEmail` invokes EmailSender port (StdoutEmailSender dev adapter); `expiresIn: 86400` (24h, D-13); `sendOnSignUp: true`
    - `sendResetPassword`, `resetPasswordTokenExpiresIn: 1800` (30 min, D-14)
    - `user.additionalFields` declares locale (required, default 'en'), display_currency (required, default 'USD'), preferred_llm_provider (optional), preferred_stt_provider (optional)
    - drizzle config: `experimental: { joins: true }` per Pitfall 8.
    - hooks (D-16 wiring + PC-03 + PC-09):
      - `user.create.before`: computes `email_hash` (LibsodiumKeyStore.emailHash) + populates `email_encrypted` + `email_nonce`. Same hook returns the row data — Better Auth then INSERTs the user row in its own transaction.
      - `user.create.after`: PC-03 — opens `withUserContext(userId, fn)` (Plan 02 Task 2) and INSERTs the DEK row in `shared_kernel.user_keys`. NEVER raw `appPool().connect()`. PC-09 deferral: this best-effort write happens AFTER the user row commits; brief window during which user exists without DEK is acceptable for v1, with Phase 6 reconciliation worker as backstop. Documented in success_criteria below.

    Application services (each is a thin function that calls the auth API + emits domain events via outbox):
    - signUp({ email, password, locale, displayCurrency }) → calls auth.signUpEmail → Result<UserId, Error>
    - verifyEmail({ token }) → calls auth.verifyEmail
    - requestPasswordReset({ email }), confirmPasswordReset({ token, newPassword })
    - updateLocale, updateDisplayCurrency, updateProviderPrefs (write to user_preferences/users)
    - listSessions(userId), revokeSession(userId, sessionId)

    Tests use the testcontainer helper from PC-06; skip-if removed.

    Tests:
    - sign-up.test.ts: signUp creates user, sends verification email (asserted via StdoutEmailSender capture), user has locale + display_currency persisted. Also asserts the `shared_kernel.user_keys` row exists with cipher_dek + nonce non-null (PC-09 best-effort verification).
    - verify-email.test.ts: token consume marks email_verified=true; invalid token rejected; expired token rejected
    - reset-password.test.ts: requestPasswordReset emits email; confirm with valid token sets new password (login succeeds); 30-min TTL (FakeClock past 30 min → token rejected)
    - sessions.test.ts: list shows current session; revoke removes session row; revoking own session signs out (next request unauthorized)
    - locale.test.ts: signup with locale='pl', user record has locale='pl'; updateLocale to 'uk' persists
    - display-currency.test.ts: user.display_currency independent of any workspace; user has display_currency='EUR' even with no workspaces
    - provider-prefs.test.ts: updateProviderPrefs sets preferred_llm_provider/preferred_stt_provider; round-trips

  </behavior>
  <action>
    1. Add to `packages/identity/package.json`:
       ```json
       "dependencies": {
         "@budget/shared-kernel": "workspace:*",
         "@budget/platform": "workspace:*",
         "better-auth": "^1.6.9",
         "@better-auth/drizzle-adapter": "^1.6.9",
         "drizzle-orm": "^0.45.2"
       }
       ```
       Run `bun install`.
    2. Implement `packages/identity/src/adapters/persistence/better-auth.ts` (PC-03 — use withUserContext, never appPool().connect()):
       ```ts
       import { betterAuth, type BetterAuthOptions } from 'better-auth';
       import { drizzleAdapter } from '@better-auth/drizzle-adapter';
       import { drizzle } from 'drizzle-orm/node-postgres';
       import { sql } from 'drizzle-orm';
       import { appPool, LibsodiumKeyStore, withUserContext } from '@budget/platform';
       import { loadEnv, UserId } from '@budget/shared-kernel';
       import type { EmailSender } from '@budget/shared-kernel';

       export interface CreateAuthOptions {
         emailSender: EmailSender;
         keyStore: LibsodiumKeyStore;
         additionalPlugins?: BetterAuthOptions['plugins'];
       }

       export function createAuth(opts: CreateAuthOptions) {
         const env = loadEnv();
         const db = drizzle(appPool(), { casing: 'snake_case' });
         return betterAuth({
           database: drizzleAdapter(db, { provider: 'pg' }),
           secret: env.BETTER_AUTH_SECRET,
           baseURL: env.BETTER_AUTH_URL,
           emailAndPassword: {
             enabled: true,
             requireEmailVerification: false,    // D-13 grace login
             minPasswordLength: 10,
             autoSignIn: true,
             sendResetPassword: async ({ user, url }) => {
               await opts.emailSender.send({ to: user.email, template: 'reset-password', vars: { url } });
             },
             resetPasswordTokenExpiresIn: 1800,
           },
           emailVerification: {
             sendVerificationEmail: async ({ user, url }) => {
               await opts.emailSender.send({ to: user.email, template: 'verify-email', vars: { url } });
             },
             sendOnSignUp: true,
             autoSignInAfterVerification: true,
             expiresIn: 86400,
           },
           user: {
             additionalFields: {
               locale: { type: 'string', input: true, required: true, defaultValue: 'en' },
               display_currency: { type: 'string', input: true, required: true, defaultValue: 'USD' },
               preferred_llm_provider: { type: 'string', input: true, required: false },
               preferred_stt_provider: { type: 'string', input: true, required: false },
             },
           },
           // D-16 wiring: hash + encrypt email at create-before; generate DEK at create-after via withUserContext (PC-03).
           databaseHooks: {
             user: {
               create: {
                 before: async (user) => {
                   const hash = await opts.keyStore.emailHash(user.email);
                   return { data: { ...user, email_hash: hash } as typeof user };
                 },
                 // PC-03: use withUserContext (Plan 02 Task 2) — NEVER raw appPool().connect()
                 // PC-09: best-effort write; user row commits before this hook fires. A reconciliation
                 // worker (Phase 6) detects users with no user_keys row and back-fills.
                 after: async (user) => {
                   const wrapped = await opts.keyStore.generateUserDek(user.id as never);
                   const r = await withUserContext(UserId(user.id as string), async (tx) => {
                     await tx.execute(sql`
                       INSERT INTO shared_kernel.user_keys (user_id, cipher_dek, nonce)
                       VALUES (${user.id}, ${Buffer.from(wrapped.cipherDek)}, ${Buffer.from(wrapped.nonce)})
                       ON CONFLICT (user_id) DO NOTHING
                     `);
                   });
                   if (r.isErr()) {
                     // Log but do NOT throw — Phase 6 reconciliation backstop covers the gap.
                     // Throwing here would orphan the already-committed user row and Better Auth
                     // would surface a confusing error after a successful sign-up.
                     console.error('[identity] DEK insert failed for user', user.id, r.error);
                   }
                 },
               },
             },
           },
           plugins: opts.additionalPlugins ?? [],
         });
       }
       ```
    3. Implement `packages/identity/src/adapters/persistence/user-repo.ts` — DrizzleUserRepo class implementing UserRepo port: findById, findByEmail (uses email_hash), updateLocale, updateDisplayCurrency, updateProviderPrefs, getActiveWorkspaceIds, setActiveWorkspaceIds. All read/write paths use `withUserContext(userId, fn)` (Plan 02 Task 2) so RLS sees the row — NEVER raw `appPool().connect()` (PC-03 grep gate enforces).
    4. Implement application services in `packages/identity/src/application/*.ts`. Each is a thin function:
       ```ts
       // sign-up.ts
       import type { Result } from '@budget/shared-kernel';
       import { ok, err } from '@budget/shared-kernel';
       import type { Locale } from '../contracts/api';

       export interface SignUpInput { email: string; password: string; name: string; locale: Locale; displayCurrency: string }
       export async function signUp(deps: { auth: ReturnType<typeof import('../adapters/persistence/better-auth').createAuth> }, input: SignUpInput): Promise<Result<{ userId: string }, Error>> {
         try {
           const r = await deps.auth.api.signUpEmail({ body: { email: input.email, password: input.password, name: input.name, locale: input.locale, display_currency: input.displayCurrency } });
           return ok({ userId: r.user.id });
         } catch (e) { return err(e as Error); }
       }
       ```
       Mirror this shape for verify-email, reset-password (request + confirm), update-locale, update-display-currency, update-provider-prefs, list-sessions, revoke-session.
    5. WRITE TESTS for all 7 test files using testcontainer (PC-06). Sample structure for `sign-up.test.ts`:
       ```ts
       import { test, expect, beforeAll } from 'bun:test';
       import { sql } from 'drizzle-orm';
       import { startTestcontainer } from '@budget/db/test/testcontainer';
       import { StdoutEmailSender } from '@budget/shared-kernel';
       import { LibsodiumKeyStore, appPool } from '@budget/platform';
       import { createAuth } from '../src/adapters/persistence/better-auth';
       import { signUp } from '../src/application/sign-up';

       beforeAll(async () => { await startTestcontainer(); });

       test('signUp creates user, sends verification email, persists DEK row', async () => {
         const email = `t${Date.now()}@example.com`;
         const sender = new StdoutEmailSender();
         const auth = createAuth({ emailSender: sender, keyStore: new LibsodiumKeyStore() });
         const r = await signUp({ auth }, { email, password: 'changeme1234', name: 'Tester', locale: 'pl', displayCurrency: 'PLN' });
         expect(r.isOk()).toBe(true);
         const verify = sender.sent.find(e => e.template === 'verify-email');
         expect(verify).toBeDefined();
         expect(verify?.to).toBe(email);

         // PC-09: verify DEK row was persisted by the after-hook
         if (r.isOk()) {
           const client = await appPool().connect();
           try {
             // bootstrap query as admin/migrator (the testcontainer helper exposes this)
             // OR open under withUserContext to use the user_keys_owner_only policy
             const row = await client.query(`SET LOCAL app.current_user_id = $1; SELECT count(*)::int AS c FROM shared_kernel.user_keys WHERE user_id = $1`, [r.value.userId]);
             // (single-statement variant — adapt as needed for the specific pg driver behavior)
           } finally { client.release(); }
         }
       });
       ```
       Cover the full behavior list per the test file's name (sign-up / verify-email / reset-password / sessions / locale / display-currency / provider-prefs).

  </action>
  <verify>
    <automated>cd /home/claude/budget && bunx tsc --noEmit -p packages/identity/tsconfig.json && bunx depcruise --config .dependency-cruiser.cjs --output-type err packages/identity && ! grep -F 'appPool().connect()' packages/identity/src/adapters/persistence/better-auth.ts</automated>
  </verify>
  <acceptance_criteria>
    - better-auth.ts imports from 'better-auth' and '@better-auth/drizzle-adapter': `grep -F "from 'better-auth'" packages/identity/src/adapters/persistence/better-auth.ts && grep -F "from '@better-auth/drizzle-adapter'" packages/identity/src/adapters/persistence/better-auth.ts` exits 0
    - emailAndPassword.requireEmailVerification: false (D-13): `grep -F 'requireEmailVerification: false' packages/identity/src/adapters/persistence/better-auth.ts` exits 0
    - resetPasswordTokenExpiresIn: 1800: `grep -F 'resetPasswordTokenExpiresIn: 1800' packages/identity/src/adapters/persistence/better-auth.ts` exits 0
    - emailVerification.expiresIn: 86400: `grep -F 'expiresIn: 86400' packages/identity/src/adapters/persistence/better-auth.ts` exits 0
    - additionalFields declares all 4 (locale, display_currency, preferred_llm_provider, preferred_stt_provider): `for f in locale display_currency preferred_llm_provider preferred_stt_provider; do grep -F "$f:" packages/identity/src/adapters/persistence/better-auth.ts; done` exits 0
    - databaseHooks.user.create.before computes email_hash: `grep -F 'emailHash' packages/identity/src/adapters/persistence/better-auth.ts` exits 0
    - databaseHooks.user.create.after generates DEK: `grep -F 'generateUserDek' packages/identity/src/adapters/persistence/better-auth.ts` exits 0
    - PC-03: hook uses withUserContext (NOT appPool().connect()): `grep -F 'withUserContext' packages/identity/src/adapters/persistence/better-auth.ts && ! grep -F 'appPool().connect()' packages/identity/src/adapters/persistence/better-auth.ts` exits 0
    - createAuth accepts additionalPlugins (Plan 06 will inject organization): `grep -F 'additionalPlugins' packages/identity/src/adapters/persistence/better-auth.ts` exits 0
    - All 7 test files exist: `for f in sign-up verify-email reset-password sessions locale display-currency provider-prefs; do test -f packages/identity/test/${f}.test.ts; done` exits 0
    - tsc strict passes
    - dep-cruiser: domain layer does NOT reach adapters: `bunx depcruise --config .dependency-cruiser.cjs --output-type err packages/identity` exits 0
  </acceptance_criteria>
  <done>Better Auth instance shipped via createAuth() factory, wired with email port + DEK hooks. PC-03: hooks use withUserContext (Plan 02 Task 2) — never raw appPool().connect(); CI grep gate enforces. PC-09: DEK insert in after-hook is best-effort + logs failure (does not throw); Phase 6 reconciliation worker covers the gap. All 7 application services + tests covering IDNT-01..08 + MONY-09. Plan 06 plugs in the organization plugin via additionalPlugins.</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                        | Description                                                                 |
| ------------------------------- | --------------------------------------------------------------------------- |
| Browser → API (signup/login)    | TLS-only in prod; Better Auth scrypt password hashing                       |
| Email link → API (verify/reset) | Single-use, time-bound tokens via Better Auth verifications table           |
| API → DB (user PII)             | DEK-encrypted at rest (D-16) — email_encrypted/name_encrypted bytea columns |
| Session cookie → API            | httpOnly + Secure + SameSite=Lax; revocable from settings                   |
| Better Auth hooks → DB          | PC-03: withUserContext (no raw appPool().connect()) — CI grep gate enforces |

## STRIDE Threat Register

| Threat ID  | Category               | Component                                                                                | Disposition                                     | Mitigation Plan                                                                                                                                                                                                                                                                                                        |
| ---------- | ---------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-01-05-01 | Spoofing               | Replayed/leaked password-reset tokens                                                    | mitigate                                        | Better Auth `resetPasswordTokenExpiresIn: 1800` (30 min D-14) + single-use semantics; verifications table not under RLS but token IS the credential; reset-password.test.ts asserts expired token rejected                                                                                                             |
| T-01-05-02 | Spoofing               | Replayed verification tokens (24h TTL D-13)                                              | mitigate                                        | Better Auth `emailVerification.expiresIn: 86400`; consumed on first valid POST; verify-email.test.ts asserts expired/invalid rejected                                                                                                                                                                                  |
| T-01-05-03 | Information Disclosure | Plaintext PII (email, display_name) at rest                                              | mitigate                                        | databaseHooks.user.create.before + after wire LibsodiumKeyStore.emailHash + generateUserDek; email_encrypted + email_nonce columns persist ciphertext (Phase 6 drops plain `email` column); name same pattern                                                                                                          |
| T-01-05-04 | Spoofing               | Stolen session token / cookie                                                            | mitigate                                        | httpOnly + Secure + SameSite=Lax cookie defaults (Better Auth); session list + revoke endpoints (IDNT-04, D-15) ship Phase 1; session table colocated in identity schema with owner-only RLS                                                                                                                           |
| T-01-05-05 | Tampering              | Mass-assignment via additionalFields                                                     | mitigate                                        | Better Auth `additionalFields` is allowlist — only the 4 declared fields accepted                                                                                                                                                                                                                                      |
| T-01-05-06 | Spoofing               | Brute-force login                                                                        | mitigate                                        | Better Auth ships rate-limiting + scrypt by default; configure `rateLimit: { enabled: true }` in createAuth                                                                                                                                                                                                            |
| T-01-05-07 | Tampering              | customSession + organization plugin order race losing activeOrganizationId (Pitfall 3)   | mitigate                                        | Plan 05 deliberately does NOT use customSession; Plan 06 organization plugin works with our own user_preferences.active_workspace_ids                                                                                                                                                                                  |
| T-01-05-08 | Information Disclosure | Better Auth secret rotation invalidates active sessions                                  | accept                                          | Documented in apps/api/SECRETS.md (Phase 6 owns full rotation runbook)                                                                                                                                                                                                                                                 |
| T-01-05-09 | Information Disclosure | Resend abuse on verification email                                                       | mitigate                                        | Better Auth + apps/api enforce 1/min cooldown on resend (D-13)                                                                                                                                                                                                                                                         |
| T-01-05-10 | Elevation of Privilege | Hook code escaping tenant/user context via raw `appPool().connect()` (PC-03 risk)        | mitigate                                        | All hook DB writes use withUserContext (Plan 02 Task 2); CI grep gate (Plan 00) bans appPool().connect() outside packages/db/src/tx.ts                                                                                                                                                                                 |
| T-01-05-11 | Tampering              | Orphan user row (user committed without DEK) due to non-atomic create.after hook (PC-09) | mitigate (best-effort + Phase 6 reconciliation) | After-hook is best-effort, logs failure; Phase 6 hardening adds reconciliation worker that periodically scans for users with no `user_keys` row and back-fills the DEK. Documented limitation: brief window between user commit and DEK insert; tradeoff vs. throwing-and-orphaning the user row in better-auth's view |

</threat_model>

<verification>
```bash
cd /home/claude/budget
bunx tsc --noEmit -p packages/identity/tsconfig.json
bunx depcruise --config .dependency-cruiser.cjs --output-type err packages/identity
bun test packages/identity/test/sign-up.test.ts packages/identity/test/verify-email.test.ts packages/identity/test/reset-password.test.ts packages/identity/test/sessions.test.ts packages/identity/test/locale.test.ts packages/identity/test/display-currency.test.ts packages/identity/test/provider-prefs.test.ts
grep -F 'identity.users FORCE ROW LEVEL SECURITY' apps/migrator/post-migration.sql
! grep -F 'appPool().connect()' packages/identity/src/adapters/persistence/better-auth.ts
```
All exit 0 (testcontainer-backed; no skip-if-env).
</verification>

<success_criteria>

- packages/identity follows DDD layer rules: domain → contracts/ports → application → adapters (dep-cruiser passes)
- createIdentityModule() factory exported from contracts/factory.ts (PC-02, PC-15) — apps/\* see only this surface
- createAuth() factory wires Better Auth with emailAndPassword + emailVerification + sendResetPassword + additionalFields (locale, display_currency, llm/stt prefs)
- D-13 grace login (requireEmailVerification: false), D-14 reset TTL 1800s, D-13 verify TTL 86400s
- D-16 PII wiring: email_hash (deterministic) + email_encrypted (DEK-encrypted) at user.create hooks
- PC-03: user.create.after uses withUserContext (Plan 02 Task 2) for DEK insert — CI grep gate enforces no appPool().connect() in this file
- PC-09: DEK insert in after-hook is best-effort + logs failure (does not throw); Phase 6 hardening adds reconciliation worker that detects users with no user_keys row and back-fills (documented as known limitation here)
- session list + revoke endpoints (IDNT-04)
- user_preferences.active_workspace_ids UUID[] table per D-07
- application services for all 7 tested behaviors
- All 7 tests defined; pass via testcontainer (PC-06)
  </success_criteria>

<output>
After completion, create `.planning/phases/01-foundations/01-05-SUMMARY.md`
</output>
