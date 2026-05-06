---
phase: 01-foundations
plan: 02
plan_id: 01.02
type: execute
wave: 1
depends_on: ['01.00']
files_modified:
  - packages/platform/package.json
  - packages/platform/src/index.ts
  - packages/platform/src/db/pool.ts
  - packages/platform/src/db/tx.ts
  - packages/platform/src/db/rls.ts
  - packages/platform/src/db/numeric-parser.ts
  - packages/platform/src/db/schemas.ts
  - packages/platform/src/db/roles.ts
  - packages/platform/src/db/expense-ledger.ts
  - packages/platform/test/tx.test.ts
  - packages/platform/test/numeric-parser.test.ts
  - packages/platform/test/ledger-revoke.test.ts
  - packages/platform/test/with-user-context.test.ts
  - packages/platform/test/with-bootstrap-user-context.test.ts
  - packages/db/test/testcontainer.ts
  - packages/db/test/index.ts
  - packages/db/package.json
  - apps/migrator/package.json
  - apps/migrator/src/migrate.ts
  - apps/migrator/Dockerfile
  - apps/migrator/drizzle.config.ts
  - apps/migrator/post-migration.sql
  - tests/migrator-role.test.ts
  - drizzle/.gitkeep
autonomous: true
requirements: [TENT-07, TENT-08, ENGR-04, ENGR-06, ENGR-10, MONY-07, PLAT-12]
must_haves:
  truths:
    - "withTenantTx is the only writable tenant-scoped transaction primitive (D-09); enforced by dep-cruiser. Canonical file path: packages/platform/src/db/tx.ts (PC-26)"
    - "withTenantTx EXTENDED SIGNATURE: withTenantTx(tenantId, userId, fn) — sets BOTH app.tenant_ids AND app.current_user_id GUCs in same SET LOCAL pair (PC-03)"
    - "withTenantTxRead(tenantIds, userId, fn) accepts an array of TenantId; sets app.tenant_ids GUC via SET LOCAL plus app.current_user_id"
    - "withTenantTx (single-tenant write) errors before DB read when tenantIds is empty"
    - "withUserContext(userId, fn) — user-scoped tx primitive; sets ONLY app.current_user_id GUC; for user-scoped tables (user_keys, sessions, accounts, user_preferences) — never tenant-scoped (PC-03, PC-07)"
    - "withInfraTx(fn) — INFRASTRUCTURE-ONLY tx primitive; sets NEITHER GUC; carve-out for outbox dispatch + migration runner (PC-04). NEVER call from tenant-scoped code paths."
    - "withBootstrapUserContext(userId, fn) — BOOTSTRAP carve-out (PC-27): identical mechanics to withUserContext (BEGIN + SET LOCAL app.current_user_id + body + COMMIT) but documented as the SOLE legitimate primitive used by apps/api/src/middleware/tenant-guard.ts to query tenancy.workspace_members BEFORE app.tenant_ids is set. Honors workspace_members_self RLS policy (Plan 06)."
    - "Postgres roles app_role + worker_role + migrator declared NOBYPASSRLS via pgRole + post-migration SQL (D-18)"
    - "Postgres schemas identity, tenancy, shared_kernel, comparison declared via pgSchema (D-17)"
    - "expense_ledger table created in Phase 1 with full MONY-06 column shape (D-23) — populated Phase 2"
    - "REVOKE UPDATE, DELETE on expense_ledger from app_role + worker_role (D-23, ENGR-06)"
    - "FORCE ROW LEVEL SECURITY emitted on every user-data table via post-migration.sql (Pitfall 6)"
    - "pg-types parser keeps NUMERIC as string; BIGINT cast to bigint (Pitfall 2)"
    - "Migrator uses pg_advisory_lock(hashtext('budget-migrations')) (D-18)"
    - "Migrator runs as migrator role; app_role + worker_role have DML only"
    - "PC-06: @testcontainers/postgresql helper at packages/db/test/testcontainer.ts — Wave-1+2 integration tests no longer skip-if-env; container provides DATABASE_URL_APP at test time"
    - "PC-28: testcontainer.ts is the SOLE approved raw-client call site within tests/; whitelisted by --exclude-dir=test in Plan 00 grep gates. Plan 02 ledger-revoke test and Plan 05 sign-up test use withUserContext / withInfraTx where possible."
    - "PC-29: testcontainer reads the migration files at TEST TIME (during beforeAll). Migration GENERATION is owned by Plan 06 close-out task (last Wave-2 plan). Plan 02's testcontainer does NOT generate migrations — it consumes them."
  artifacts:
    - path: packages/platform/src/db/pool.ts
      provides: "Role-aware pg Pool factories: appPool, workerPool, migratorPool"
      contains: "Pool"
    - path: packages/platform/src/db/tx.ts
      provides: "withTenantTx + withTenantTxRead + withUserContext + withInfraTx + withBootstrapUserContext — only writable tx primitives (D-09, PC-03, PC-04, PC-27)"
      contains: "export async function withTenantTx"
    - path: packages/platform/src/db/numeric-parser.ts
      provides: "pg-types config: BIGINT→bigint, NUMERIC→string passthrough (Pitfall 2)"
      contains: "setTypeParser"
    - path: packages/platform/src/db/schemas.ts
      provides: "pgSchema declarations: identity, tenancy, shared_kernel, comparison (D-17)"
      contains: "pgSchema('identity')"
    - path: packages/platform/src/db/roles.ts
      provides: "pgRole declarations: app_role, worker_role, migrator (all NOBYPASSRLS, D-18)"
      contains: "pgRole"
    - path: packages/platform/src/db/expense-ledger.ts
      provides: "expense_ledger table primitive (D-23) — MONY-06 column shape"
      contains: "expense_ledger"
    - path: packages/db/test/testcontainer.ts
      provides: "PC-06 Postgres testcontainer + migrator runner; sets DATABASE_URL_APP for in-process tests; PC-28 sole raw-client carve-out within test/; PC-29 reads generated migrations at TEST TIME (Plan 06 owns generation)"
      contains: "PostgreSqlContainer"
    - path: apps/migrator/src/migrate.ts
      provides: "Migrator with pg_advisory_lock + drizzle-kit + post-migration SQL"
      contains: "pg_advisory_lock"
    - path: apps/migrator/post-migration.sql
      provides: "FORCE RLS + REVOKE statements drizzle-kit doesn't emit (Pitfall 6, D-23)"
      contains: "FORCE ROW LEVEL SECURITY"
  key_links:
    - from: "packages/platform/src/db/tx.ts"
      to: "Postgres SET LOCAL app.tenant_ids + app.current_user_id"
      via: "tx.execute(sql`SET LOCAL ...`)"
      pattern: "SET LOCAL app.tenant_ids"
    - from: "apps/migrator/src/migrate.ts"
      to: "Postgres pg_advisory_lock"
      via: "lock during migrate"
      pattern: "pg_advisory_lock"
    - from: "apps/migrator/post-migration.sql"
      to: "expense_ledger immutability + FORCE RLS"
      via: "raw SQL applied after drizzle migrations"
      pattern: "REVOKE UPDATE, DELETE"
---

<objective>
Establish the database substrate: pgRoles, pgSchemas, FIVE transaction primitives (withTenantTx, withTenantTxRead, withUserContext, withInfraTx, withBootstrapUserContext), NUMERIC parsers, expense_ledger immutability, the migrator runner with advisory lock, and the testcontainer helper for Wave-1/2 integration tests.

Purpose: Wave-1 parallel plan covering D-08 (GUC), D-09 (withTenantTx), D-17 (per-context schemas), D-18 (migrator role + advisory lock), D-23 (expense_ledger primitive), Pitfalls 1+2+6+10, plus PC-03 (withUserContext for user-scoped tables), PC-04 (withInfraTx for outbox dispatch + migration), PC-06 (testcontainer helper), PC-26 (canonical tx.ts location at packages/platform/src/db/tx.ts), PC-27 (withBootstrapUserContext primitive consumed by Plan 07 tenant-guard), PC-28 (testcontainer is the sole approved raw-client call site within tests/, whitelisted by --exclude-dir=test), PC-29 (testcontainer reads migrations at TEST TIME — generation owned by Plan 06 close-out). This is the foundation Plans 3, 4, 5, 6, 10 all consume — they import from `@budget/platform`.

Output: A `packages/platform` module with FIVE writable tx primitives, plus an `apps/migrator` one-shot Bun runner, plus a `packages/db/test/testcontainer.ts` helper used by Wave-1/2 integration tests.
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
@.dependency-cruiser.cjs
@packages/shared-kernel/src/index.ts

<interfaces>
<!-- Public API of packages/platform/src/db/* -->

// pool.ts
import type { Pool } from 'pg';
export function appPool(): Pool;        // uses DATABASE_URL_APP (app_role, NOBYPASSRLS)
export function workerPool(): Pool;     // uses DATABASE_URL_WORKER (worker_role, NOBYPASSRLS)
export function migratorPool(): Pool;   // uses DATABASE_URL_MIGRATOR (migrator role)
export const appDb;                     // drizzle(appPool())
export const workerDb;                  // drizzle(workerPool())

// tx.ts — D-09 + PC-03 + PC-04 + PC-27 — the FIVE writable transaction primitives
// CANONICAL FILE: packages/platform/src/db/tx.ts (PC-26 reconciled location).
// CI grep gates exclude this filename via --exclude=tx.ts (PC-26).
import type { TenantId, UserId } from '@budget/shared-kernel';
import { Result } from '@budget/shared-kernel';

export class TenantContextError extends Error {}
export class UserContextError extends Error {}

// (1) Single-tenant WRITE (extended signature: tenantId + userId in same SET LOCAL)
export function withTenantTx<T>(
  tenantId: TenantId,
  userId: UserId,
  fn: (tx: Tx) => Promise<T>,
): Promise<Result<T, Error>>;

// (2) Multi-tenant READ (cross-workspace dashboard) — userId still required for user-scoped joins
export function withTenantTxRead<T>(
  tenantIds: readonly TenantId[],
  userId: UserId,
  fn: (tx: Tx) => Promise<T>,
): Promise<Result<T, Error>>;

// (3) PC-03: USER-scoped tx (no tenant context). For user_keys, sessions, accounts, user_preferences.
export function withUserContext<T>(
  userId: UserId,
  fn: (tx: Tx) => Promise<T>,
): Promise<Result<T, Error>>;

// (4) PC-04: INFRASTRUCTURE-ONLY tx (no GUC). For outbox dispatch, migration runner.
//     CI grep gate ensures only one .transaction( call site exists in the entire repo.
//     NEVER call from tenant-scoped code paths.
export function withInfraTx<T>(
  fn: (tx: Tx) => Promise<T>,
): Promise<Result<T, Error>>;

// (5) PC-27: BOOTSTRAP carve-out — used ONLY by tenant-guard middleware (Plan 07) to query
//     workspace_members for active_workspace_ids ∩ membership intersection BEFORE app.tenant_ids
//     GUC is set. Mechanically identical to withUserContext (BEGIN + SET LOCAL app.current_user_id +
//     body + COMMIT). Honors the workspace_members_self RLS policy keyed off app.current_user_id
//     (Plan 06). Documented as the legitimate replacement for raw appPool().connect() in tenant-guard.
export function withBootstrapUserContext<T>(
  userId: UserId,
  fn: (tx: Tx) => Promise<T>,
): Promise<Result<T, Error>>;

// schemas.ts — D-17
export const identity = pgSchema('identity');
export const tenancy = pgSchema('tenancy');
export const sharedKernel = pgSchema('shared_kernel');
export const comparison = pgSchema('comparison');

// roles.ts — D-18
export const appRole = pgRole('app_role', { createRole: false, inherit: true });
export const workerRole = pgRole('worker_role', { createRole: false, inherit: true });
export const migratorRole = pgRole('migrator', { createRole: false, inherit: true });
// All explicitly NOT BYPASSRLS — set in post-migration.sql via ALTER ROLE ... NOBYPASSRLS
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pool + numeric-parser + pg-types config (Pitfall 2)</name>
  <files>
    packages/platform/package.json,
    packages/platform/src/db/pool.ts,
    packages/platform/src/db/numeric-parser.ts,
    packages/platform/src/index.ts,
    packages/platform/test/numeric-parser.test.ts
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-RESEARCH.md §"Common Pitfalls" Pitfall 2 (NUMERIC arrives as string)
    - .planning/phases/01-foundations/01-RESEARCH.md §"Pattern 1" (pgPolicy + pgSchema RLS GUC) for connection layout
    - packages/shared-kernel/src/env.ts (DATABASE_URL_* keys)
    - .planning/phases/01-foundations/01-CONTEXT.md D-18 (role separation)
  </read_first>
  <behavior>
    - configureNumericParsers() invokes pg.types.setTypeParser:
        - OID 20 (BIGINT/INT8) → BigInt
        - OID 1700 (NUMERIC) → string passthrough (no parser change — confirm string)
    - appPool() returns a Pool with connectionString === env.DATABASE_URL_APP
    - workerPool() and migratorPool() use their respective DSN env vars
    - Calling appPool() twice returns the same Pool instance (singleton-per-role)
  </behavior>
  <action>
    1. Add to `packages/platform/package.json`:
       ```json
       "dependencies": {
         "@budget/shared-kernel": "workspace:*",
         "drizzle-orm": "^0.45.2",
         "pg": "^8.13.0"
       },
       "devDependencies": {
         "drizzle-kit": "^0.31.10",
         "@types/pg": "^8.11.0"
       }
       ```
       Run `bun install`.
    2. WRITE TEST `packages/platform/test/numeric-parser.test.ts` FIRST:
       ```ts
       import { test, expect } from 'bun:test';
       import { types } from 'pg';
       import { configureNumericParsers } from '../src/db/numeric-parser';

       test('configureNumericParsers casts BIGINT to bigint', () => {
         configureNumericParsers();
         const parser = types.getTypeParser(20);
         expect(parser('123456789012345')).toBe(123456789012345n);
       });
       test('NUMERIC stays string (no parser override)', () => {
         configureNumericParsers();
         const parser = types.getTypeParser(1700);
         // Default pg-types parser for NUMERIC returns string; we ASSERT we did NOT change it
         expect(typeof parser('1.99')).toBe('string');
         expect(parser('1.99')).toBe('1.99');
       });
       ```
       Confirm RED.
    3. Implement `packages/platform/src/db/numeric-parser.ts`:
       ```ts
       import { types } from 'pg';
       /**
        * Pitfall 2: pg returns NUMERIC (OID 1700) as string AND BIGINT (OID 20) as string.
        * - We KEEP NUMERIC as string (Money.fromDb consumes string for big.js precision).
        * - We CAST BIGINT to bigint (callers expect a numeric primitive type).
        * Idempotent — safe to call multiple times.
        */
       export function configureNumericParsers(): void {
         types.setTypeParser(20, (v: string) => BigInt(v));
         // OID 1700 (NUMERIC): leave default string parser
       }
       ```
    4. Implement `packages/platform/src/db/pool.ts`:
       ```ts
       import { Pool } from 'pg';
       import { drizzle } from 'drizzle-orm/node-postgres';
       import { loadEnv } from '@budget/shared-kernel';
       import { configureNumericParsers } from './numeric-parser';

       configureNumericParsers();
       const env = loadEnv();

       let _appPool: Pool | undefined;
       let _workerPool: Pool | undefined;
       let _migratorPool: Pool | undefined;

       export function appPool(): Pool {
         if (!_appPool) _appPool = new Pool({ connectionString: env.DATABASE_URL_APP, application_name: 'budget-api' });
         return _appPool;
       }
       export function workerPool(): Pool {
         if (!_workerPool) _workerPool = new Pool({ connectionString: env.DATABASE_URL_WORKER, application_name: 'budget-worker' });
         return _workerPool;
       }
       export function migratorPool(): Pool {
         if (!_migratorPool) _migratorPool = new Pool({ connectionString: env.DATABASE_URL_MIGRATOR, application_name: 'budget-migrator' });
         return _migratorPool;
       }

       export const appDb = () => drizzle(appPool(), { casing: 'snake_case' });
       export const workerDb = () => drizzle(workerPool(), { casing: 'snake_case' });
       ```
    5. Create `packages/platform/src/index.ts`:
       ```ts
       export * from './db/pool';
       export * from './db/numeric-parser';
       export * from './db/tx';
       export * from './db/rls';
       export * from './db/schemas';
       export * from './db/roles';
       export * from './db/expense-ledger';
       ```
    6. Run tests — confirm GREEN.
  </action>
  <verify>
    <automated>cd /home/claude/budget && bun test packages/platform/test/numeric-parser.test.ts && bunx tsc --noEmit -p packages/platform/tsconfig.json</automated>
  </verify>
  <acceptance_criteria>
    - File `packages/platform/src/db/numeric-parser.ts` calls setTypeParser(20: `grep -E "setTypeParser\\(20" packages/platform/src/db/numeric-parser.ts` exits 0
    - File `packages/platform/src/db/pool.ts` exports appPool, workerPool, migratorPool: `grep -E 'export function (appPool|workerPool|migratorPool)' packages/platform/src/db/pool.ts | wc -l` returns 3
    - Pool reads DATABASE_URL_APP from env: `grep -F 'DATABASE_URL_APP' packages/platform/src/db/pool.ts` exits 0
    - `bun test packages/platform/test/numeric-parser.test.ts` exits 0
    - `bunx tsc --noEmit -p packages/platform/tsconfig.json` exits 0
  </acceptance_criteria>
  <done>Role-separated pool + NUMERIC/BIGINT pg-types config. Money string round-trip safe.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: FIVE tx primitives (withTenantTx, withTenantTxRead, withUserContext, withInfraTx, withBootstrapUserContext) + RLS GUC primitive (D-08, D-09, PC-03, PC-04, PC-07, PC-26, PC-27)</name>
  <files>
    packages/platform/src/db/tx.ts,
    packages/platform/src/db/rls.ts,
    packages/platform/test/tx.test.ts,
    packages/platform/test/with-user-context.test.ts,
    packages/platform/test/with-bootstrap-user-context.test.ts
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-RESEARCH.md §"Pattern 2: withTenantTx" (lines 512-547) — full reference impl
    - .planning/phases/01-foundations/01-CONTEXT.md D-08 (array GUC), D-09 (only tx primitive), D-10 (worker propagation), CHG-2026-05-06-A (FIVE primitives, canonical path packages/platform/src/db/tx.ts)
    - .planning/phases/01-foundations/01-RESEARCH.md §"Common Pitfalls" Pitfall 4 (SET vs SET LOCAL — never SET without LOCAL)
    - .dependency-cruiser.cjs (Plan 0) — `no-direct-db-transaction` rule restricts this file (canonical at packages/platform/src/db/tx.ts per PC-26)
  </read_first>
  <behavior>
    Tests use the testcontainer helper from Task 5 (PC-06). All integration tests are real (no skip-if).
    PC-26: this file's canonical path is `packages/platform/src/db/tx.ts`. Plan 00 grep gates use `--exclude=tx.ts` (file-level). PC-28 also adds `--exclude-dir=test` so tests do not need raw-client calls.
    - `withTenantTx(TenantId, UserId, async (tx) => { ... })` returns Result.ok with the inner value; sets BOTH app.tenant_ids AND app.current_user_id GUCs in same SET LOCAL pair (PC-03)
    - `withTenantTxRead([], userId, fn)` returns Result.err(TenantContextError) — empty array rejected before any DB call
    - `withUserContext(UserId, async (tx) => { ... })` sets ONLY app.current_user_id; for user-scoped tables (user_keys, sessions, accounts, user_preferences) per PC-03/PC-07
    - `withInfraTx(async (tx) => { ... })` sets NEITHER GUC; CI grep gate (Plan 00) bans `.transaction(` outside this file (PC-04)
    - `withBootstrapUserContext(UserId, async (tx) => { ... })` (PC-27): mechanically identical to `withUserContext` (BEGIN + `SET LOCAL app.current_user_id` + body + COMMIT) — exists as a NAMED primitive so the bootstrap call site (tenant-guard middleware in Plan 07) is greppable and self-documenting. Honors the `workspace_members_self` RLS policy added in Plan 06.
    - tx commits on success; rolls back on thrown error
    - RLS helper `setTenantContext(tx, tenantIds, userId)` formats array literal correctly for Postgres uuid[] cast and emits both SET LOCALs in one statement
  </behavior>
  <action>
    1. WRITE TEST `packages/platform/test/tx.test.ts` FIRST (uses testcontainer from Task 5):
       ```ts
       import { test, expect, beforeAll } from 'bun:test';
       import { sql } from 'drizzle-orm';
       import { startTestcontainer } from '@budget/db/test/testcontainer';
       import { withTenantTx, withTenantTxRead, withInfraTx, TenantContextError } from '../src/db/tx';
       import { TenantId, UserId } from '@budget/shared-kernel';

       beforeAll(async () => { await startTestcontainer(); });

       test('withTenantTxRead empty array → TenantContextError', async () => {
         const r = await withTenantTxRead([], UserId('00000000-0000-0000-0000-000000000099'), async () => 1);
         expect(r.isErr()).toBe(true);
         if (r.isErr()) expect(r.error).toBeInstanceOf(TenantContextError);
       });

       test('withTenantTx sets BOTH app.tenant_ids AND app.current_user_id GUCs inside tx', async () => {
         const tid = TenantId('00000000-0000-0000-0000-000000000001');
         const uid = UserId('00000000-0000-0000-0000-000000000099');
         const r = await withTenantTx(tid, uid, async (tx) => {
           const rows = await tx.execute(sql`SELECT current_setting('app.tenant_ids', true) AS t, current_setting('app.current_user_id', true) AS u`);
           return rows.rows[0] as { t: string; u: string };
         });
         expect(r.isOk()).toBe(true);
         if (r.isOk()) {
           expect(r.value.t).toContain('00000000-0000-0000-0000-000000000001');
           expect(r.value.u).toBe('00000000-0000-0000-0000-000000000099');
         }
       });

       test('withTenantTx commits on success', async () => {
         const tid = TenantId('00000000-0000-0000-0000-000000000002');
         const uid = UserId('00000000-0000-0000-0000-000000000099');
         const r = await withTenantTx(tid, uid, async () => 42);
         expect(r.isOk()).toBe(true);
         if (r.isOk()) expect(r.value).toBe(42);
       });

       test('withTenantTx wraps thrown errors as Result.err', async () => {
         const tid = TenantId('00000000-0000-0000-0000-000000000003');
         const uid = UserId('00000000-0000-0000-0000-000000000099');
         const r = await withTenantTx(tid, uid, async () => { throw new Error('boom'); });
         expect(r.isErr()).toBe(true);
       });

       test('withInfraTx opens raw tx WITHOUT GUCs (PC-04)', async () => {
         const r = await withInfraTx(async (tx) => {
           const rows = await tx.execute(sql`SELECT current_setting('app.tenant_ids', true) AS t, current_setting('app.current_user_id', true) AS u`);
           return rows.rows[0] as { t: string | null; u: string | null };
         });
         expect(r.isOk()).toBe(true);
         if (r.isOk()) {
           // Neither GUC was set
           expect(r.value.t === null || r.value.t === '').toBe(true);
           expect(r.value.u === null || r.value.u === '').toBe(true);
         }
       });
       ```
       Confirm RED.
    2. Implement `packages/platform/src/db/rls.ts`:
       ```ts
       import { sql } from 'drizzle-orm';
       import type { TenantId, UserId } from '@budget/shared-kernel';

       /**
        * D-08 + Pitfall 4: ALWAYS SET LOCAL inside an explicit transaction.
        * Postgres array literal: '{uuid1,uuid2,...}' cast to uuid[].
        * PC-03: extended to also set app.current_user_id in the same SET LOCAL pair.
        */
       export function tenantContextSql(tenantIds: readonly TenantId[], userId: UserId) {
         const literal = `{${tenantIds.join(',')}}`;
         return [
           sql`SET LOCAL app.tenant_ids = ${literal}`,
           sql`SET LOCAL app.current_user_id = ${userId}`,
         ];
       }

       /** PC-03: user-only context (no tenant_ids). For user-scoped tables. */
       export function userContextSql(userId: UserId) {
         return sql`SET LOCAL app.current_user_id = ${userId}`;
       }
       ```
    3. Implement `packages/platform/src/db/tx.ts`:
       ```ts
       import { ok, err, type Result, type TenantId, type UserId } from '@budget/shared-kernel';
       import { appDb, workerDb } from './pool';
       import { tenantContextSql, userContextSql } from './rls';

       export class TenantContextError extends Error {
         constructor(msg: string) { super(msg); this.name = 'TenantContextError'; }
       }
       export class UserContextError extends Error {
         constructor(msg: string) { super(msg); this.name = 'UserContextError'; }
       }

       type Tx = Parameters<Parameters<ReturnType<typeof appDb>['transaction']>[0]>[0];

       /**
        * D-09: ONLY writable tenant-scoped tx primitive. dependency-cruiser bans direct
        * db.transaction calls; CI grep gate (Plan 00, PC-26) verifies only this file calls .transaction(.
        * PC-03: extended signature accepts userId so all writes set BOTH GUCs atomically.
        */
       export async function withTenantTxRead<T>(
         tenantIds: readonly TenantId[],
         userId: UserId,
         fn: (tx: Tx) => Promise<T>,
       ): Promise<Result<T, Error>> {
         if (tenantIds.length === 0) {
           return err(new TenantContextError('withTenantTxRead requires ≥1 tenant id (D-10)'));
         }
         try {
           const value = await appDb().transaction(async (tx) => {
             for (const stmt of tenantContextSql(tenantIds, userId)) await tx.execute(stmt);
             return await fn(tx);
           });
           return ok(value);
         } catch (e) {
           return err(e as Error);
         }
       }

       /** Single-tenant write per D-09 + PC-03 (extended with userId). */
       export async function withTenantTx<T>(
         tenantId: TenantId,
         userId: UserId,
         fn: (tx: Tx) => Promise<T>,
       ): Promise<Result<T, Error>> {
         return withTenantTxRead([tenantId], userId, fn);
       }

       /**
        * PC-03: user-scoped tx (sets ONLY app.current_user_id). For user-scoped tables:
        * shared_kernel.user_keys, identity.sessions, identity.accounts, identity.user_preferences.
        * Do NOT use for tenant-scoped data.
        */
       export async function withUserContext<T>(
         userId: UserId,
         fn: (tx: Tx) => Promise<T>,
       ): Promise<Result<T, Error>> {
         if (!userId) return err(new UserContextError('withUserContext requires a userId'));
         try {
           const value = await appDb().transaction(async (tx) => {
             await tx.execute(userContextSql(userId));
             return await fn(tx);
           });
           return ok(value);
         } catch (e) {
           return err(e as Error);
         }
       }

       /**
        * PC-04: INFRASTRUCTURE-ONLY tx (sets NEITHER GUC).
        * Carve-out for outbox dispatch + migration runner.
        * NEVER call from tenant-scoped code paths. CI grep gate (Plan 00, PC-26) ensures only this
        * file invokes `.transaction(` repo-wide (outside test/ directories).
        */
       export async function withInfraTx<T>(
         fn: (tx: Tx) => Promise<T>,
       ): Promise<Result<T, Error>> {
         try {
           const value = await workerDb().transaction(async (tx) => fn(tx));
           return ok(value);
         } catch (e) {
           return err(e as Error);
         }
       }

       /**
        * PC-27: BOOTSTRAP carve-out — used ONLY by tenant-guard middleware (apps/api/src/middleware/tenant-guard.ts)
        * to query `tenancy.workspace_members` for the active_workspace_ids ∩ membership intersection
        * BEFORE `app.tenant_ids` GUC is set (chicken-and-egg: the GUC is built from this very query).
        *
        * Mechanically identical to `withUserContext`: opens a tx, SET LOCAL app.current_user_id, runs fn,
        * COMMITs. Exists as a separately NAMED primitive so:
        *   (a) the legitimate bootstrap call site is self-documenting and greppable,
        *   (b) tenant-guard does not need raw `appPool().connect()` (PC-03 grep gate stays clean),
        *   (c) future readers see immediately why this tx has only the user GUC and no tenant GUC.
        *
        * Honors the `workspace_members_self` RLS policy added in Plan 06's tenancy.workspace_members
        * schema (`user_id = nullif(current_setting('app.current_user_id', true), '')::uuid`). The policy
        * permits the user to SELECT their own membership rows even before app.tenant_ids is set.
        */
       export async function withBootstrapUserContext<T>(
         userId: UserId,
         fn: (tx: Tx) => Promise<T>,
       ): Promise<Result<T, Error>> {
         if (!userId) return err(new UserContextError('withBootstrapUserContext requires a userId'));
         try {
           const value = await appDb().transaction(async (tx) => {
             await tx.execute(userContextSql(userId));
             return await fn(tx);
           });
           return ok(value);
         } catch (e) {
           return err(e as Error);
         }
       }
       ```
    4. WRITE TEST `packages/platform/test/with-user-context.test.ts`:
       ```ts
       import { test, expect, beforeAll } from 'bun:test';
       import { sql } from 'drizzle-orm';
       import { startTestcontainer } from '@budget/db/test/testcontainer';
       import { withUserContext } from '../src/db/tx';
       import { UserId } from '@budget/shared-kernel';

       beforeAll(async () => { await startTestcontainer(); });

       test('withUserContext sets app.current_user_id only', async () => {
         const uid = UserId('00000000-0000-0000-0000-0000000000aa');
         const r = await withUserContext(uid, async (tx) => {
           const rows = await tx.execute(sql`SELECT current_setting('app.current_user_id', true) AS u, current_setting('app.tenant_ids', true) AS t`);
           return rows.rows[0] as { u: string; t: string | null };
         });
         expect(r.isOk()).toBe(true);
         if (r.isOk()) {
           expect(r.value.u).toBe('00000000-0000-0000-0000-0000000000aa');
           expect(r.value.t === null || r.value.t === '').toBe(true);
         }
       });
       ```
    5. WRITE TEST `packages/platform/test/with-bootstrap-user-context.test.ts` (PC-27):
       ```ts
       import { test, expect, beforeAll } from 'bun:test';
       import { sql } from 'drizzle-orm';
       import { startTestcontainer } from '@budget/db/test/testcontainer';
       import { withBootstrapUserContext } from '../src/db/tx';
       import { UserId } from '@budget/shared-kernel';

       beforeAll(async () => { await startTestcontainer(); });

       test('withBootstrapUserContext sets app.current_user_id and no tenant_ids', async () => {
         const uid = UserId('00000000-0000-0000-0000-0000000000bb');
         const r = await withBootstrapUserContext(uid, async (tx) => {
           const rows = await tx.execute(sql`SELECT current_setting('app.current_user_id', true) AS u, current_setting('app.tenant_ids', true) AS t`);
           return rows.rows[0] as { u: string; t: string | null };
         });
         expect(r.isOk()).toBe(true);
         if (r.isOk()) {
           expect(r.value.u).toBe('00000000-0000-0000-0000-0000000000bb');
           expect(r.value.t === null || r.value.t === '').toBe(true);
         }
       });
       ```
    6. Run tests. Tests run real against the testcontainer DB.
  </action>
  <verify>
    <automated>cd /home/claude/budget && bun test packages/platform/test/tx.test.ts packages/platform/test/with-user-context.test.ts packages/platform/test/with-bootstrap-user-context.test.ts && bunx tsc --noEmit -p packages/platform/tsconfig.json && bunx depcruise --config .dependency-cruiser.cjs --output-type err packages/platform</automated>
  </verify>
  <acceptance_criteria>
    - File `packages/platform/src/db/tx.ts` exports all FIVE tx primitives (PC-03, PC-04, PC-27): `grep -E 'export async function (withTenantTx|withTenantTxRead|withUserContext|withInfraTx|withBootstrapUserContext)' packages/platform/src/db/tx.ts | wc -l` returns 5
    - tx.ts uses SET LOCAL not bare SET: `grep -F 'SET LOCAL app.tenant_ids' packages/platform/src/db/rls.ts && grep -F 'SET LOCAL app.current_user_id' packages/platform/src/db/rls.ts` exits 0
    - withTenantTx accepts userId (PC-03): `grep -E 'withTenantTx<T>\\(\\s*tenantId.*userId' packages/platform/src/db/tx.ts` exits 0
    - tx.ts rejects empty tenantIds: `grep -F "TenantContextError" packages/platform/src/db/tx.ts` exits 0
    - withInfraTx documented as INFRASTRUCTURE-ONLY (PC-04): `grep -F 'INFRASTRUCTURE-ONLY' packages/platform/src/db/tx.ts` exits 0
    - PC-27: withBootstrapUserContext exists and is documented as the tenant-guard bootstrap primitive: `grep -F 'export async function withBootstrapUserContext' packages/platform/src/db/tx.ts && grep -F 'BOOTSTRAP carve-out' packages/platform/src/db/tx.ts && grep -F 'tenant-guard' packages/platform/src/db/tx.ts && grep -F 'workspace_members_self' packages/platform/src/db/tx.ts` exits 0
    - `packages/platform/src/db/rls.ts` exports tenantContextSql + userContextSql: `grep -E 'export function (tenantContextSql|userContextSql)' packages/platform/src/db/rls.ts | wc -l` returns 2
    - depcruise no-direct-db-transaction rule passes: `bunx depcruise --config .dependency-cruiser.cjs --output-type err packages/platform` exits 0
    - `bun test packages/platform/test/tx.test.ts packages/platform/test/with-user-context.test.ts packages/platform/test/with-bootstrap-user-context.test.ts` exits 0
  </acceptance_criteria>
  <done>FIVE tx primitives implemented (PC-03 + PC-04 + PC-27). withTenantTx + withTenantTxRead set BOTH app.tenant_ids and app.current_user_id GUCs atomically. withUserContext sets only app.current_user_id (user-scoped tables). withInfraTx is the infrastructure carve-out for outbox + migrator. withBootstrapUserContext is the documented bootstrap primitive consumed by Plan 07 tenant-guard middleware (replaces raw appPool().connect() in that file; honors the workspace_members_self policy added in Plan 06). Empty tenantIds error before DB read (TENT-08 underpinning).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: pgRoles + pgSchemas + expense_ledger primitive (D-17, D-18, D-23)</name>
  <files>
    packages/platform/src/db/schemas.ts,
    packages/platform/src/db/roles.ts,
    packages/platform/src/db/expense-ledger.ts,
    packages/platform/test/ledger-revoke.test.ts,
    apps/migrator/post-migration.sql
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-RESEARCH.md §"Pattern 1" (pgPolicy + pgSchema + pgRole declarations)
    - .planning/phases/01-foundations/01-RESEARCH.md §"Pattern 9: Append-Only Ledger primitive" (lines 924-957)
    - .planning/phases/01-foundations/01-CONTEXT.md D-17, D-18, D-23, D-24
    - .planning/phases/01-foundations/01-RESEARCH.md §"Common Pitfalls" Pitfall 6 (FORCE RLS not emitted by drizzle-kit) + Pitfall 1 (push doesn't apply RLS)
  </read_first>
  <behavior>
    PC-05 RESOLVED DECISION: expense_ledger primitive ships in Phase 1 under `pgSchema('budgeting')`. The migrator creates the budgeting schema empty except for this one table. Full Budgeting context schema (categories, periods, limits, etc.) lands in Phase 2. Justification: D-23 (append-only ledger primitive ships now).

    - pgSchema declarations for `identity`, `tenancy`, `shared_kernel`, `comparison`, `budgeting` — five schemas total
    - pgRole declarations: `app_role`, `worker_role`, `migrator` — all `createRole: false` (managed by migrator role/post-migration SQL)
    - expense_ledger table declared in `budgeting` schema per PC-05 resolved decision
    - Full MONY-06 columns: id, tenant_id, amount_orig, currency_orig, amount_default, currency_default, fx_rate, fx_rate_date, fx_provider, corrects_id, corrected_by_id, created_at
    - REVOKE UPDATE, DELETE statement in post-migration.sql
    - FORCE ROW LEVEL SECURITY for every user-data table in post-migration.sql
    - ALTER ROLE ... NOBYPASSRLS for app_role, worker_role, migrator in post-migration.sql
    - PC-28: ledger-revoke test uses withInfraTx (preferred) where it can; only the testcontainer bootstrap helper needs raw client access. The test asserts privilege via `has_table_privilege` which can be queried inside withInfraTx (no GUC needed for catalog reads).
    - Test asserts: `has_table_privilege('app_role', 'budgeting.expense_ledger', 'UPDATE')` returns false; `'INSERT'` returns true
  </behavior>
  <action>
    1. Implement `packages/platform/src/db/schemas.ts`:
       ```ts
       import { pgSchema } from 'drizzle-orm/pg-core';
       export const identity = pgSchema('identity');
       export const tenancy = pgSchema('tenancy');
       export const sharedKernel = pgSchema('shared_kernel');
       export const comparison = pgSchema('comparison');
       export const budgeting = pgSchema('budgeting');  // PC-05: expense_ledger primitive ships here in Phase 1; full Budgeting context lands Phase 2
       ```
    2. Implement `packages/platform/src/db/roles.ts`:
       ```ts
       import { pgRole } from 'drizzle-orm/pg-core';
       /**
        * D-18: roles managed in post-migration SQL (createRole: false here).
        * NOBYPASSRLS enforced via ALTER ROLE in apps/migrator/post-migration.sql.
        */
       export const appRole = pgRole('app_role', { createDbRole: false, inherit: true });
       export const workerRole = pgRole('worker_role', { createDbRole: false, inherit: true });
       export const migratorRole = pgRole('migrator', { createDbRole: false, inherit: true });
       ```
       (If Drizzle pgRole signature differs in 0.45.x, adapt to the documented `{ createRole: false }` form.)
    3. Implement `packages/platform/src/db/expense-ledger.ts`:
       ```ts
       import { sql } from 'drizzle-orm';
       import { uuid, text, numeric, date, timestamp, pgPolicy } from 'drizzle-orm/pg-core';
       import { budgeting } from './schemas';
       import { appRole, workerRole } from './roles';

       /**
        * D-23 (PC-05 resolved): append-only ledger primitive. Phase 1 creates the table + RLS + REVOKE.
        * Phase 2 fills it via the Budgeting context (apps emit INSERTs only).
        */
       export const expenseLedger = budgeting.table('expense_ledger', {
         id: uuid('id').primaryKey().defaultRandom(),
         tenantId: uuid('tenant_id').notNull(),
         amountOrig: numeric('amount_orig', { precision: 19, scale: 4 }).notNull(),
         currencyOrig: text('currency_orig').notNull(),
         amountDefault: numeric('amount_default', { precision: 19, scale: 4 }).notNull(),
         currencyDefault: text('currency_default').notNull(),
         fxRate: numeric('fx_rate', { precision: 19, scale: 8 }).notNull(),
         fxRateDate: date('fx_rate_date').notNull(),
         fxProvider: text('fx_provider').notNull(),
         correctsId: uuid('corrects_id'),
         correctedById: uuid('corrected_by_id'),
         createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
       }, (t) => [
         pgPolicy('expense_ledger_tenant_isolation', {
           as: 'permissive',
           for: 'all',
           to: [appRole, workerRole],
           using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
           withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
         }),
       ]);
       ```
    4. Create `apps/migrator/post-migration.sql` (the file Pitfall 6 requires; drizzle-kit doesn't emit these):
       ```sql
       -- D-18: app + worker + migrator roles must NOT bypass RLS.
       -- Roles are CREATEd by infra (docker-compose init or production provisioning); we ALTER here.
       ALTER ROLE app_role NOBYPASSRLS NOSUPERUSER;
       ALTER ROLE worker_role NOBYPASSRLS NOSUPERUSER;
       ALTER ROLE migrator NOBYPASSRLS NOSUPERUSER;

       -- Schema USAGE grants (D-17). identity + tenancy + shared_kernel + budgeting for app_role + worker_role; comparison reserved for comparison_role (Phase 5).
       GRANT USAGE ON SCHEMA identity, tenancy, shared_kernel, budgeting TO app_role, worker_role;
       -- comparison schema: app_role + worker_role have NO USAGE (Phase 5 introduces comparison_role).

       -- D-23 / ENGR-06: append-only ledger.
       REVOKE UPDATE, DELETE ON budgeting.expense_ledger FROM app_role, worker_role;
       GRANT SELECT, INSERT ON budgeting.expense_ledger TO app_role, worker_role;

       -- Pitfall 6: FORCE RLS on every user-data table. Add new tables here as later plans introduce them.
       ALTER TABLE budgeting.expense_ledger FORCE ROW LEVEL SECURITY;
       -- (Plans 3, 5, 6 append more ALTER TABLE ... FORCE ROW LEVEL SECURITY statements here.)

       -- Pitfall 10: shared_kernel.outbox is INFRASTRUCTURE — RLS is replaced by GRANT-based access control.
       -- (Wired in Plan 3 — leave a comment marker for later append.)
       -- BEGIN OUTBOX_GRANTS_MARKER
       -- END OUTBOX_GRANTS_MARKER

       -- Idempotent retries: every statement above is safe to re-run.
       ```
    5. WRITE TEST `packages/platform/test/ledger-revoke.test.ts` (PC-28: prefer withInfraTx for catalog reads; testcontainer is the sole approved raw-client carve-out within tests/):
       ```ts
       import { test, expect, beforeAll } from 'bun:test';
       import { sql } from 'drizzle-orm';
       import { startTestcontainer } from '@budget/db/test/testcontainer';
       import { withInfraTx } from '../src/db/tx';

       beforeAll(async () => { await startTestcontainer(); });

       // PC-28: pg_catalog reads do not require a tenant or user GUC; use withInfraTx instead of
       // raw migratorPool().connect(). The testcontainer helper is the only raw-client call site
       // in tests/ — whitelisted by Plan 00's --exclude-dir=test grep gate.
       test('app_role has no UPDATE on expense_ledger', async () => {
         const r = await withInfraTx(async (tx) => {
           const rows = await tx.execute(sql`SELECT has_table_privilege('app_role', 'budgeting.expense_ledger', 'UPDATE') AS up`);
           return (rows.rows[0] as { up: boolean }).up;
         });
         expect(r.isOk()).toBe(true);
         if (r.isOk()) expect(r.value).toBe(false);
       });
       test('app_role has no DELETE on expense_ledger', async () => {
         const r = await withInfraTx(async (tx) => {
           const rows = await tx.execute(sql`SELECT has_table_privilege('app_role', 'budgeting.expense_ledger', 'DELETE') AS d`);
           return (rows.rows[0] as { d: boolean }).d;
         });
         expect(r.isOk()).toBe(true);
         if (r.isOk()) expect(r.value).toBe(false);
       });
       test('app_role has INSERT on expense_ledger', async () => {
         const r = await withInfraTx(async (tx) => {
           const rows = await tx.execute(sql`SELECT has_table_privilege('app_role', 'budgeting.expense_ledger', 'INSERT') AS i`);
           return (rows.rows[0] as { i: boolean }).i;
         });
         expect(r.isOk()).toBe(true);
         if (r.isOk()) expect(r.value).toBe(true);
       });
       ```
  </action>
  <verify>
    <automated>cd /home/claude/budget && bunx tsc --noEmit -p packages/platform/tsconfig.json && grep -F 'NOBYPASSRLS' apps/migrator/post-migration.sql && grep -F 'REVOKE UPDATE, DELETE' apps/migrator/post-migration.sql && grep -F 'FORCE ROW LEVEL SECURITY' apps/migrator/post-migration.sql</automated>
  </verify>
  <acceptance_criteria>
    - `packages/platform/src/db/schemas.ts` declares 5 schemas: `grep -E "pgSchema\\('(identity|tenancy|shared_kernel|comparison|budgeting)'\\)" packages/platform/src/db/schemas.ts | wc -l` returns 5
    - `packages/platform/src/db/roles.ts` declares 3 roles: `grep -E "pgRole\\('(app_role|worker_role|migrator)'" packages/platform/src/db/roles.ts | wc -l` returns 3
    - `packages/platform/src/db/expense-ledger.ts` includes all MONY-06 columns: `for col in tenant_id amount_orig currency_orig amount_default currency_default fx_rate fx_rate_date fx_provider corrects_id corrected_by_id; do grep -F "$col" packages/platform/src/db/expense-ledger.ts; done` exits 0
    - expense-ledger declares pgPolicy: `grep -F "pgPolicy('expense_ledger_tenant_isolation'" packages/platform/src/db/expense-ledger.ts` exits 0
    - `apps/migrator/post-migration.sql` contains ALTER ROLE NOBYPASSRLS for all 3 roles: `grep -E 'ALTER ROLE (app_role|worker_role|migrator) NOBYPASSRLS' apps/migrator/post-migration.sql | wc -l` returns 3
    - `apps/migrator/post-migration.sql` contains REVOKE on expense_ledger: `grep -F 'REVOKE UPDATE, DELETE ON budgeting.expense_ledger' apps/migrator/post-migration.sql` exits 0
    - `apps/migrator/post-migration.sql` contains FORCE RLS on expense_ledger: `grep -F 'ALTER TABLE budgeting.expense_ledger FORCE ROW LEVEL SECURITY' apps/migrator/post-migration.sql` exits 0
    - PC-28: ledger-revoke test uses withInfraTx (no raw migratorPool().connect()): `grep -F 'withInfraTx' packages/platform/test/ledger-revoke.test.ts && ! grep -F 'migratorPool().connect()' packages/platform/test/ledger-revoke.test.ts` exits 0
    - `bunx tsc --noEmit -p packages/platform/tsconfig.json` exits 0
  </acceptance_criteria>
  <done>pgRoles + pgSchemas + expense_ledger primitive declared in Drizzle TS schema (PC-05 resolved: budgeting schema with expense_ledger only in Phase 1). Post-migration SQL ships REVOKE + FORCE RLS + NOBYPASSRLS that drizzle-kit cannot emit (Pitfall 6). PC-28: ledger-revoke test uses withInfraTx for catalog reads.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Migrator runner + advisory lock + drizzle.config.ts (D-18, PLAT-12)</name>
  <files>
    apps/migrator/package.json,
    apps/migrator/src/migrate.ts,
    apps/migrator/Dockerfile,
    apps/migrator/drizzle.config.ts,
    apps/migrator/tsconfig.json,
    drizzle/.gitkeep,
    tests/migrator-role.test.ts
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-RESEARCH.md §"Pattern 10: Migration role separation + advisory lock" (lines 959-996)
    - .planning/phases/01-foundations/01-CONTEXT.md D-18 (pg_advisory_lock(hashtext('budget-migrations')))
    - .planning/phases/01-foundations/01-RESEARCH.md §"Common Pitfalls" Pitfall 1 (drizzle-kit push silently skips RLS — use generate + migrate)
    - .planning/phases/01-foundations/01-VALIDATION.md row "Migrations apply via separate role w/ advisory lock"
  </read_first>
  <behavior>
    - migrate.ts reads MIGRATOR_DATABASE_URL (alias of DATABASE_URL_MIGRATOR), opens Pool, acquires pg_advisory_lock(hashtext('budget-migrations'))
    - Runs drizzle-kit migrate (NOT push) against ./drizzle directory
    - After drizzle migrations complete, executes apps/migrator/post-migration.sql in a single transaction
    - Releases advisory lock via pg_advisory_unlock + pool.end + process.exit(0)
    - On error: logs, releases lock, exits non-zero
    - tests/migrator-role.test.ts asserts current_user='migrator' during DDL (uses testcontainer from Task 5)
  </behavior>
  <action>
    1. Add to `apps/migrator/package.json`:
       ```json
       "dependencies": {
         "@budget/platform": "workspace:*",
         "@budget/shared-kernel": "workspace:*",
         "drizzle-orm": "^0.45.2",
         "pg": "^8.13.0"
       },
       "devDependencies": {
         "drizzle-kit": "^0.31.10",
         "@types/pg": "^8.11.0"
       },
       "scripts": {
         "migrate": "bun run src/migrate.ts",
         "generate": "drizzle-kit generate --config=drizzle.config.ts",
         "typecheck": "tsc --noEmit -p tsconfig.json"
       }
       ```
    2. Create `apps/migrator/tsconfig.json` extending `../../tsconfig.base.json` with `"include": ["src/**/*"]`.
    3. Create `apps/migrator/drizzle.config.ts`:
       ```ts
       import { defineConfig } from 'drizzle-kit';
       const url = process.env.DATABASE_URL_MIGRATOR;
       if (!url) throw new Error('DATABASE_URL_MIGRATOR required');
       export default defineConfig({
         dialect: 'postgresql',
         out: '../../drizzle',
         schema: '../../packages/platform/src/db/expense-ledger.ts',  // Plans 3, 5, 6 add more schema files via the schema array below
         dbCredentials: { url },
         casing: 'snake_case',
       });
       ```
       (Later plans extend `schema` to an array as more table files appear.)
    4. Create `apps/migrator/src/migrate.ts`:
       ```ts
       import { drizzle } from 'drizzle-orm/node-postgres';
       import { migrate } from 'drizzle-orm/node-postgres/migrator';
       import { sql } from 'drizzle-orm';
       import { Pool } from 'pg';
       import { readFileSync } from 'node:fs';
       import { resolve } from 'node:path';
       import { loadEnv } from '@budget/shared-kernel';

       async function main() {
         const env = loadEnv();
         const pool = new Pool({ connectionString: env.DATABASE_URL_MIGRATOR, application_name: 'budget-migrator' });
         const db = drizzle(pool);

         console.log('[migrator] acquiring advisory lock...');
         await db.execute(sql`SELECT pg_advisory_lock(hashtext('budget-migrations'))`);
         console.log('[migrator] lock acquired');

         try {
           console.log('[migrator] running drizzle migrations...');
           await migrate(db, { migrationsFolder: resolve(import.meta.dir, '../../../drizzle') });
           console.log('[migrator] applying post-migration.sql (Pitfall 6 — FORCE RLS, REVOKE, NOBYPASSRLS)');
           const post = readFileSync(resolve(import.meta.dir, '../post-migration.sql'), 'utf8');
           // Run as one transaction — fail fast if any statement errors
           await db.execute(sql.raw(post));
           console.log('[migrator] complete');
         } finally {
           await db.execute(sql`SELECT pg_advisory_unlock(hashtext('budget-migrations'))`);
           await pool.end();
         }
       }

       main().then(() => process.exit(0)).catch((e) => { console.error('[migrator] FAILED', e); process.exit(1); });
       ```
    5. Create `apps/migrator/Dockerfile` (multi-stage Bun):
       ```dockerfile
       FROM oven/bun:1.3 AS deps
       WORKDIR /app
       COPY package.json bun.lockb ./
       COPY apps/migrator/package.json apps/migrator/
       COPY packages/platform/package.json packages/platform/
       COPY packages/shared-kernel/package.json packages/shared-kernel/
       RUN bun install --frozen-lockfile

       FROM oven/bun:1.3
       WORKDIR /app
       COPY --from=deps /app/node_modules ./node_modules
       COPY . .
       WORKDIR /app/apps/migrator
       CMD ["bun", "run", "src/migrate.ts"]
       ```
    6. Create `drizzle/.gitkeep` (drizzle-kit migration output dir).
    7. Create `tests/migrator-role.test.ts`:
       ```ts
       import { test, expect, beforeAll } from 'bun:test';
       import { startTestcontainer } from '@budget/db/test/testcontainer';
       import { Pool } from 'pg';

       beforeAll(async () => { await startTestcontainer(); });

       test('migrator role identity', async () => {
         const pool = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATOR });
         const r = await pool.query('SELECT current_user AS who');
         expect(r.rows[0]?.who).toBe('migrator');
         await pool.end();
       });

       test('migrator role does not bypass RLS', async () => {
         const pool = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATOR });
         const r = await pool.query(`SELECT rolbypassrls FROM pg_roles WHERE rolname = 'migrator'`);
         expect(r.rows[0]?.rolbypassrls).toBe(false);
         await pool.end();
       });
       ```
  </action>
  <verify>
    <automated>cd /home/claude/budget && bunx tsc --noEmit -p apps/migrator/tsconfig.json && test -f apps/migrator/Dockerfile && test -f apps/migrator/drizzle.config.ts && test -f apps/migrator/post-migration.sql</automated>
  </verify>
  <acceptance_criteria>
    - `apps/migrator/src/migrate.ts` calls pg_advisory_lock with hashtext('budget-migrations'): `grep -F "pg_advisory_lock(hashtext('budget-migrations'))" apps/migrator/src/migrate.ts` exits 0
    - migrate.ts reads post-migration.sql: `grep -F 'post-migration.sql' apps/migrator/src/migrate.ts` exits 0
    - migrate.ts uses migrate (not push): `grep -F "from 'drizzle-orm/node-postgres/migrator'" apps/migrator/src/migrate.ts` exits 0
    - `apps/migrator/Dockerfile` exists and uses Bun: `grep -F 'FROM oven/bun:1.3' apps/migrator/Dockerfile` exits 0
    - `apps/migrator/drizzle.config.ts` exports defineConfig: `grep -F 'defineConfig' apps/migrator/drizzle.config.ts` exits 0
    - `tests/migrator-role.test.ts` uses testcontainer (PC-06): `grep -F 'startTestcontainer' tests/migrator-role.test.ts` exits 0
    - `bunx tsc --noEmit -p apps/migrator/tsconfig.json` exits 0
  </acceptance_criteria>
  <done>Migrator app ships: advisory-lock + drizzle-kit migrate + post-migration.sql apply. PLAT-12 satisfied. Test asserts current_user=migrator + no BYPASSRLS via testcontainer (PC-06).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 5: PC-06 Bootstrap testcontainer + migrate (replaces former human-action checkpoint)</name>
  <files>
    packages/db/package.json,
    packages/db/test/testcontainer.ts,
    packages/db/test/index.ts
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-VALIDATION.md (Wave-1/2 integration tests)
    - apps/migrator/src/migrate.ts (Task 4 — programmatic migrator entrypoint reused here)
    - https://node.testcontainers.org/modules/postgresql/ (Context7 lookup as needed at exec time)
  </read_first>
  <behavior>
    - PC-06: Wave-2 tests previously needed a real DB but compose stack was Wave 3. Resolution (option b): introduce a Wave-1 standalone task that runs migrations against a Postgres testcontainer using `@testcontainers/postgresql`.
    - PC-28: testcontainer.ts is the SOLE approved raw-client (`new Pool().connect()` / `adminPool.query`) call site within `tests/` and `packages/*/test/`. Plan 00's grep gates `--exclude-dir=test` whitelists this file. The justification: bootstrapping the container — creating roles, schemas, running migrations — has no GUC to set yet (the database is empty pre-migration), so withInfraTx / withUserContext are not applicable. This carve-out is bounded to `packages/db/test/testcontainer.ts`.
    - PC-29: testcontainer DOES NOT generate the migration SQL — Plan 06's close-out task owns `bunx drizzle-kit generate`. The testcontainer READS the generated `drizzle/0000_*.sql` files at TEST TIME (during `beforeAll`) via `migrate()`. If the files do not exist, `migrate()` errors and the test suite fails fast — which is the correct outcome since Wave-2 plans must run AFTER Plan 06's generate task.
    - `packages/db/test/testcontainer.ts` exports `startTestcontainer()` that:
      1. If a container is already running for this test process, return its URL (idempotent).
      2. Spawn `new PostgreSqlContainer('postgres:17-alpine')` and start it.
      3. Create three roles inside (app_role, worker_role, migrator) with NOBYPASSRLS — done via raw admin pool (PC-28 carve-out: this is the pre-migration bootstrap).
      4. Set process.env.DATABASE_URL_APP / DATABASE_URL_WORKER / DATABASE_URL_MIGRATOR to per-role connection strings.
      5. Run drizzle `migrate()` programmatically against the existing `drizzle/` directory (PC-29: files written by Plan 06 close-out task; testcontainer consumes them).
      6. Apply `apps/migrator/post-migration.sql` programmatically.
      7. Yield container connection URL; teardown on test process exit.
    - Used by:
      - Plan 02 Task 2 (tx tests) — replaces skip-if-env
      - Plan 02 Task 3 (ledger-revoke test) — replaces skip-if-env; PC-28 prefers withInfraTx for the catalog reads
      - Plan 02 Task 4 (migrator-role test) — replaces skip-if-env
      - Plan 03 (audit + outbox tests) — replaces skip-if-env
      - Plan 04 (libsodium tests still don't need DB; user_keys schema via testcontainer)
      - Plan 05 (sign-up/verify/etc tests) — replaces skip-if-env; PC-28 sign-up.test.ts uses withUserContext for DEK verification
      - Plan 06 (all 9+1 tenancy tests + close-out generate-migrations task) — replaces skip-if-env
    - Plan 09 (compose stack) retains its role as DEPLOYMENT artifact and end-to-end smoke (Wave 3) — but is no longer a Wave-2 test prerequisite.
  </behavior>
  <action>
    1. Create `packages/db/package.json`:
       ```json
       {
         "name": "@budget/db",
         "version": "0.0.0",
         "private": true,
         "type": "module",
         "main": "src/index.ts",
         "exports": {
           ".": "./src/index.ts",
           "./test/testcontainer": "./test/testcontainer.ts"
         },
         "dependencies": {
           "@budget/shared-kernel": "workspace:*",
           "@budget/platform": "workspace:*"
         },
         "devDependencies": {
           "@testcontainers/postgresql": "^10.0.0",
           "testcontainers": "^10.0.0"
         },
         "scripts": { "typecheck": "tsc --noEmit -p tsconfig.json" }
       }
       ```
       Run `bun add -d @testcontainers/postgresql --filter '@budget/db'` (or root install).
    2. Create `packages/db/test/testcontainer.ts`:
       ```ts
       import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
       import { Pool } from 'pg';
       import { drizzle } from 'drizzle-orm/node-postgres';
       import { migrate } from 'drizzle-orm/node-postgres/migrator';
       import { sql } from 'drizzle-orm';
       import { readFileSync } from 'node:fs';
       import { resolve } from 'node:path';

       let container: StartedPostgreSqlContainer | undefined;
       let bootedPromise: Promise<void> | undefined;

       /**
        * PC-06: Idempotent testcontainer bootstrap. Wave-1 + Wave-2 integration tests call this in
        * beforeAll(); the container starts once per test process. Replaces the former
        * skipIf(!process.env.DATABASE_URL_APP) gate so tests run for real in CI without docker compose.
        *
        * PC-28: This file is the SOLE approved raw-client (`new Pool` + `.query`) call site within
        * tests/ — whitelisted by Plan 00's `--exclude-dir=test` grep gate. Pre-migration bootstrap
        * has no GUC to set, so withInfraTx / withUserContext are not applicable here.
        *
        * PC-29: The drizzle `migrate()` call below READS the generated SQL files in `drizzle/`. Those
        * files are GENERATED by Plan 06's close-out task (`bunx drizzle-kit generate`). The
        * testcontainer is a CONSUMER of generated migrations, not a producer. If the directory is
        * empty, migrate() will run no-op and the post-migration.sql will fail when it tries to GRANT
        * on tables that don't exist — that is the correct fail-fast behavior, surfacing that Wave-2
        * tests were started before Plan 06's generate task ran.
        */
       export async function startTestcontainer(): Promise<{ urlApp: string; urlWorker: string; urlMigrator: string }> {
         if (bootedPromise) {
           await bootedPromise;
         } else {
           bootedPromise = (async () => {
             container = await new PostgreSqlContainer('postgres:17-alpine')
               .withUsername('postgres')
               .withPassword('postgres')
               .withDatabase('budget')
               .start();
             const adminUrl = container.getConnectionUri();
             const adminPool = new Pool({ connectionString: adminUrl });
             // Create the three application roles (NOBYPASSRLS) — PC-28 raw-client carve-out
             try {
               await adminPool.query(`CREATE ROLE app_role LOGIN PASSWORD 'app_pwd' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE`);
               await adminPool.query(`CREATE ROLE worker_role LOGIN PASSWORD 'worker_pwd' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE`);
               await adminPool.query(`CREATE ROLE migrator LOGIN PASSWORD 'migrator_pwd' NOBYPASSRLS NOSUPERUSER CREATEDB NOCREATEROLE`);
               // Schemas (D-17)
               await adminPool.query(`CREATE SCHEMA IF NOT EXISTS identity AUTHORIZATION migrator`);
               await adminPool.query(`CREATE SCHEMA IF NOT EXISTS tenancy AUTHORIZATION migrator`);
               await adminPool.query(`CREATE SCHEMA IF NOT EXISTS shared_kernel AUTHORIZATION migrator`);
               await adminPool.query(`CREATE SCHEMA IF NOT EXISTS comparison AUTHORIZATION migrator`);
               await adminPool.query(`CREATE SCHEMA IF NOT EXISTS budgeting AUTHORIZATION migrator`);
             } finally { await adminPool.end(); }

             const host = container.getHost();
             const port = container.getMappedPort(5432);
             const urlApp = `postgresql://app_role:app_pwd@${host}:${port}/budget`;
             const urlWorker = `postgresql://worker_role:worker_pwd@${host}:${port}/budget`;
             const urlMigrator = `postgresql://migrator:migrator_pwd@${host}:${port}/budget`;
             process.env.DATABASE_URL_APP = urlApp;
             process.env.DATABASE_URL_WORKER = urlWorker;
             process.env.DATABASE_URL_MIGRATOR = urlMigrator;

             // PC-29: Read & apply the migrations that Plan 06's close-out task GENERATED.
             // We do NOT run drizzle-kit generate here — generation is Plan 06's responsibility.
             const migPool = new Pool({ connectionString: urlMigrator });
             const db = drizzle(migPool);
             try {
               await migrate(db, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
               const post = readFileSync(resolve(process.cwd(), 'apps/migrator/post-migration.sql'), 'utf8');
               await db.execute(sql.raw(post));
             } finally { await migPool.end(); }
           })();
           await bootedPromise;
         }
         return {
           urlApp: process.env.DATABASE_URL_APP!,
           urlWorker: process.env.DATABASE_URL_WORKER!,
           urlMigrator: process.env.DATABASE_URL_MIGRATOR!,
         };
       }

       export async function stopTestcontainer(): Promise<void> {
         if (container) {
           await container.stop();
           container = undefined;
           bootedPromise = undefined;
         }
       }
       ```
    3. Create `packages/db/test/index.ts` re-exporting startTestcontainer + stopTestcontainer.
    4. Wire `@budget/db` into Plan 05/06/04 integration test setup files (those plans' Task lists already include `beforeAll(startTestcontainer)`).
  </action>
  <verify>
    <automated>cd /home/claude/budget && bunx tsc --noEmit -p packages/db/tsconfig.json && test -f packages/db/test/testcontainer.ts && grep -F 'PostgreSqlContainer' packages/db/test/testcontainer.ts</automated>
  </verify>
  <acceptance_criteria>
    - testcontainer helper exists: `test -f packages/db/test/testcontainer.ts` exits 0
    - uses @testcontainers/postgresql: `grep -F "from '@testcontainers/postgresql'" packages/db/test/testcontainer.ts` exits 0
    - exports startTestcontainer: `grep -F 'export async function startTestcontainer' packages/db/test/testcontainer.ts` exits 0
    - sets all three DATABASE_URL_* env vars: `for v in DATABASE_URL_APP DATABASE_URL_WORKER DATABASE_URL_MIGRATOR; do grep -F "$v" packages/db/test/testcontainer.ts; done` exits 0
    - creates three NOBYPASSRLS roles: `grep -F 'NOBYPASSRLS' packages/db/test/testcontainer.ts` exits 0
    - applies post-migration.sql programmatically: `grep -F 'post-migration.sql' packages/db/test/testcontainer.ts` exits 0
    - PC-28: testcontainer.ts is documented as the SOLE approved raw-client carve-out within tests/: `grep -F 'PC-28' packages/db/test/testcontainer.ts && grep -F 'sole approved' packages/db/test/testcontainer.ts || grep -F 'SOLE approved' packages/db/test/testcontainer.ts` exits 0
    - PC-29: testcontainer is documented as a CONSUMER of generated migrations (not a generator); reads files at TEST TIME: `grep -F 'PC-29' packages/db/test/testcontainer.ts && grep -F 'GENERATED by Plan 06' packages/db/test/testcontainer.ts` exits 0
    - testcontainer does NOT call bunx drizzle-kit generate (PC-29): `! grep -F 'drizzle-kit generate' packages/db/test/testcontainer.ts` exits 0
    - tsc passes
  </acceptance_criteria>
  <done>PC-06 RESOLVED: Wave-1+2 tests no longer skip-if-env. startTestcontainer() spawns Postgres 17, creates three NOBYPASSRLS roles + five schemas, runs drizzle migrations + post-migration.sql, sets DATABASE_URL_* env vars. PC-28: documented as the SOLE raw-client call site within tests/, whitelisted by Plan 00 grep gate's --exclude-dir=test. PC-29: testcontainer is a CONSUMER of generated migration SQL (not a generator) — Plan 06's close-out task owns generation; testcontainer reads at TEST TIME via drizzle.migrate(). Plan 09 compose stack remains Wave 3 deployment artifact only.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Application code → DB | All writes route through withTenantTx / withUserContext / withBootstrapUserContext (PC-27); withInfraTx is the documented carve-out (PC-04) |
| API request → tenant context | GUC `app.tenant_ids` + `app.current_user_id` set per-tx in same SET LOCAL pair (PC-03) |
| Migrator role → app_role | DDL privileges separated from runtime DML (D-18) |
| Test-only raw-client carve-out | `packages/db/test/testcontainer.ts` is the SOLE legitimate raw-client call site within tests/ (PC-28) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-02-01 | Information Disclosure | Cross-tenant data leak via direct `db.transaction()` bypassing GUC (Phase-1 high-severity) | mitigate | Three-layer: (1) dependency-cruiser `no-direct-db-transaction` rule; (2) grep CI gate (Plan 00, PC-04, PC-26) `! grep -RnE '\.transaction\(' --exclude=tx.ts --exclude-dir=test apps packages` — only one call site allowed repo-wide outside tests; (3) withInfraTx is the only documented infrastructure carve-out and is bounded to outbox dispatch + migration runner |
| T-01-02-02 | Information Disclosure | `SET app.tenant_ids` (without LOCAL) leaking tenant context across pooled connections (Pitfall 4 — CRITICAL) | mitigate | `tenantContextSql` helper exclusively uses `SET LOCAL`; helper is the ONLY producer of that statement; tx.ts always wraps in explicit transaction |
| T-01-02-03 | Elevation of Privilege | App or worker role with BYPASSRLS reading any tenant's rows | mitigate | post-migration.sql executes `ALTER ROLE app_role NOBYPASSRLS` for all 3 roles; tenant-leak CI gate (Plan 10) asserts `pg_roles.rolbypassrls = false` |
| T-01-02-04 | Tampering | UPDATE or DELETE on `expense_ledger` violating append-only invariant (ENGR-06) | mitigate | post-migration.sql: `REVOKE UPDATE, DELETE ON budgeting.expense_ledger FROM app_role, worker_role`; CI gate asserts `has_table_privilege('app_role', 'budgeting.expense_ledger', 'UPDATE') = false` |
| T-01-02-05 | Tampering | drizzle-kit push silently skipping RLS policies in dev (Pitfall 1) → false-positive verification | mitigate | Migrator uses `drizzle-kit generate` + `migrate` exclusively; no `push` script in package.json; post-migration.sql appends FORCE RLS that drizzle-kit cannot emit (Pitfall 6) |
| T-01-02-06 | Denial of Service | Concurrent migrators racing during multi-replica boot | mitigate | `pg_advisory_lock(hashtext('budget-migrations'))` serializes migrator runs; lock auto-releases on connection close (Postgres default) |
| T-01-02-07 | Information Disclosure | NUMERIC float coercion via accidental `Number(row.amount)` (Pitfall 2 — HIGH likelihood) | mitigate | pg-types config keeps NUMERIC as string; ESLint `no-float-money` flags `Number()` near `amount` identifiers; Money.fromDb consumes string |
| T-01-02-08 | Elevation of Privilege | Hook or middleware code escaping tenant context via raw `appPool().connect()` (PC-03 risk) | mitigate | withUserContext + withTenantTx (extended signature) cover the legitimate cases; PC-27 withBootstrapUserContext covers the tenant-guard bootstrap; CI grep gate (Plan 00, PC-26 file-level exclude on tx.ts, PC-28 test exclude) bans `appPool().connect(` outside `packages/platform/src/db/tx.ts`; only legitimate use is internal to tx.ts itself plus the testcontainer carve-out under tests/ |

## PC-21 Trigger Hardening — Phase 6 (Documented Limitation)

PC-21 (deferred): Phase 1 outbox dispatcher uses `SELECT FOR UPDATE SKIP LOCKED` to read pending rows; tenant-aware in-process bus dispatches under the row's tenant context (PC-08). Edge cases requiring stronger guarantees (e.g. transactional retries with backoff, dead-letter queueing) ship in Phase 6 hardening.
</threat_model>

<verification>
```bash
cd /home/claude/budget
bunx tsc --noEmit -p packages/platform/tsconfig.json
bunx tsc --noEmit -p apps/migrator/tsconfig.json
bunx tsc --noEmit -p packages/db/tsconfig.json
bunx depcruise --config .dependency-cruiser.cjs --output-type err packages/platform apps/migrator packages/db
bun test packages/platform/test/numeric-parser.test.ts
bun test packages/platform/test/tx.test.ts                              # uses testcontainer
bun test packages/platform/test/with-user-context.test.ts               # uses testcontainer
bun test packages/platform/test/with-bootstrap-user-context.test.ts     # PC-27 — uses testcontainer
bun test packages/platform/test/ledger-revoke.test.ts                   # uses testcontainer; PC-28 prefers withInfraTx
bun test tests/migrator-role.test.ts                                     # uses testcontainer
grep -F 'NOBYPASSRLS' apps/migrator/post-migration.sql
grep -F 'REVOKE UPDATE, DELETE' apps/migrator/post-migration.sql
grep -F 'FORCE ROW LEVEL SECURITY' apps/migrator/post-migration.sql
```
All static checks must exit 0; integration tests pass via testcontainer (PC-06).
</verification>

<success_criteria>
- packages/platform exposes appPool/workerPool/migratorPool, appDb/workerDb, the FIVE tx primitives (withTenantTx, withTenantTxRead, withUserContext, withInfraTx, withBootstrapUserContext), pgSchemas (5), pgRoles (3), expenseLedger table primitive
- withTenantTx is the only writable tenant-scoped primitive — dep-cruiser blocks direct db.transaction; CI grep gate (Plan 00, PC-26 file-level exclude + PC-28 test exclude) ensures only `packages/platform/src/db/tx.ts` calls `.transaction(` outside tests/
- withTenantTx EXTENDED SIGNATURE (PC-03): accepts userId; sets BOTH app.tenant_ids AND app.current_user_id GUCs in same SET LOCAL pair
- withUserContext (PC-03, PC-07) is the user-scoped tx primitive for user_keys, sessions, accounts, user_preferences
- withInfraTx (PC-04) is the documented carve-out for outbox dispatch + migration runner
- withBootstrapUserContext (PC-27) is the documented bootstrap primitive for Plan 07 tenant-guard middleware (replaces raw appPool().connect() there)
- post-migration.sql ships ALTER ROLE NOBYPASSRLS + REVOKE UPDATE/DELETE on expense_ledger + FORCE RLS markers
- apps/migrator runs drizzle-kit migrate inside pg_advisory_lock, then applies post-migration.sql
- pg-types config: NUMERIC stays string (Money compatible); BIGINT casts to bigint
- No `drizzle-kit push` anywhere in scripts (Pitfall 1)
- PC-06: packages/db/test/testcontainer.ts provides Wave-1+2 tests with a real Postgres without docker compose; skip-if-env removed across the codebase
- PC-28: testcontainer.ts is documented as the SOLE approved raw-client call site within tests/ (whitelisted by Plan 00's --exclude-dir=test); ledger-revoke test uses withInfraTx for catalog reads
- PC-29: testcontainer reads generated migrations at TEST TIME (during beforeAll) — Plan 06's close-out task owns drizzle-kit generate
- Tests green via testcontainer
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundations/01-02-SUMMARY.md`
</output>
</content>
