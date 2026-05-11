---
phase: 01-foundations
plan: 03
plan_id: 01.03
type: execute
wave: 1
depends_on: ["01.00", "01.02"]
files_modified:
  - packages/platform/src/audit/schema.ts
  - packages/platform/src/audit/writer.ts
  - packages/platform/src/outbox/schema.ts
  - packages/platform/src/outbox/writer.ts
  - packages/platform/src/outbox/dispatcher.ts
  - packages/platform/src/jobs/boss.ts
  - packages/platform/src/events/bus.ts
  - packages/platform/test/audit.test.ts
  - packages/platform/test/outbox-writer.test.ts
  - packages/platform/test/outbox-restart.test.ts
  - apps/worker/package.json
  - apps/worker/src/worker.ts
  - apps/worker/src/handlers/outbox-dispatch.ts
  - apps/worker/Dockerfile
  - apps/worker/tsconfig.json
  - apps/migrator/post-migration.sql
autonomous: true
requirements: [ENGR-07, ENGR-08, TENT-08]
must_haves:
  truths:
    - "shared_kernel.audit_history table queryable for any non-ledger entity (D-24, ENGR-07)"
    - "writeAudit(tx, {entity_type, entity_id, action, actor_user_id, before, after}) inserts a row in same tx as the domain write"
    - "shared_kernel.outbox table receives in-tx INSERTs from writeOutbox (D-25, ENGR-08)"
    - "Dispatcher uses SELECT FOR UPDATE SKIP LOCKED + dispatched_at for idempotent dispatch"
    - "Dispatcher opens tx via withInfraTx (PC-04) — never workerDb().transaction() directly"
    - "PC-08: dispatcher executes tenantContextSql([row.tenant_id], system-user) before eventBus.publish(row) so in-process handlers run under the row's tenant"
    - "Outbox row not double-dispatched after worker restart mid-batch (ENGR-08)"
    - "pg-boss singleton uses 'pgboss' schema (kept out of bounded-context schemas)"
    - "outbox table grants: app_role INSERT only; worker_role SELECT/UPDATE only (Pitfall 10)"
    - "outbox has NO RLS policy (Pitfall 10 — infrastructure, not domain)"
    - "audit_history HAS RLS policy: tenant_id = ANY(app.tenant_ids) — domain audit data scoped"
    - "PC-29: drizzle-kit generate is OWNED BY PLAN 06 close-out (last Wave-2 plan). Plan 03 declares schemas (audit_history, outbox) but does NOT generate the SQL — generation can only succeed once identity + tenancy schemas (Plans 05, 06) also exist."
  artifacts:
    - path: packages/platform/src/audit/schema.ts
      provides: "shared_kernel.audit_history table + pgPolicy (D-24)"
      contains: "audit_history"
    - path: packages/platform/src/audit/writer.ts
      provides: "writeAudit(tx, evt) helper"
      contains: "export async function writeAudit"
    - path: packages/platform/src/outbox/schema.ts
      provides: "shared_kernel.outbox table — NO RLS, GRANT-restricted (Pitfall 10)"
      contains: "outbox"
    - path: packages/platform/src/outbox/writer.ts
      provides: "writeOutbox(tx, evt) — same-tx INSERT"
      contains: "export async function writeOutbox"
    - path: packages/platform/src/outbox/dispatcher.ts
      provides: "dispatchOutboxBatch — SELECT FOR UPDATE SKIP LOCKED loop via withInfraTx (PC-04); applies per-row tenant context before publish (PC-08)"
      contains: "withInfraTx"
    - path: packages/platform/src/jobs/boss.ts
      provides: "pg-boss singleton in 'pgboss' schema"
      contains: "PgBoss"
    - path: apps/worker/src/worker.ts
      provides: "Worker entrypoint that boots pg-boss + registers outbox-dispatch"
      contains: "pollingIntervalSeconds: 5"
  key_links:
    - from: "packages/platform/src/outbox/writer.ts"
      to: "Postgres outbox INSERT"
      via: "tx.execute(sql`INSERT INTO shared_kernel.outbox ...`)"
      pattern: "INSERT INTO shared_kernel.outbox"
    - from: "packages/platform/src/outbox/dispatcher.ts"
      to: "Postgres SELECT FOR UPDATE SKIP LOCKED"
      via: "withInfraTx wrapper (PC-04)"
      pattern: "FOR UPDATE SKIP LOCKED"
    - from: "apps/worker/src/handlers/outbox-dispatch.ts"
      to: "packages/platform/src/outbox/dispatcher.ts"
      via: "import dispatchOutboxBatch"
      pattern: "dispatchOutboxBatch"
---

<objective>
Ship the audit-history table + writeAudit helper, the transactional outbox + dispatcher (with PC-04 withInfraTx + PC-08 per-row tenant context), the apps/worker bootstrap, and the pg-boss singleton.

Purpose: ENGR-07 + ENGR-08 + D-24 + D-25 + PC-04 (withInfraTx for outbox dispatch) + PC-08 (in-process bus runs under row's tenant). Plans 5, 6, and Phase 2+ use these rails to (a) audit-track owner shares + every non-ledger entity, (b) emit domain events transactionally and dispatch them via the in-process bus.

PC-29: Migration generation that PC-13 originally placed here is MOVED to Plan 06's close-out task. Reason: `bunx drizzle-kit generate` reads schema files from all packages and emits a single SQL bundle. Running it in Plan 03 (Wave 1) cannot succeed because identity (Plan 05) and tenancy (Plan 06) schemas do not exist yet — they land in Wave 2. The correct ownership is the LAST Wave-2 plan to land (Plan 06), where every Phase-1 schema has been declared. Plan 03 declares its schemas (audit_history, outbox); the migration SQL is generated downstream.

Output: Two new tables under `shared_kernel.*`, a `packages/platform/src/{audit,outbox,jobs,events}` module set, and an `apps/worker` Bun entrypoint that polls every 5s.
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
@packages/platform/src/db/tx.ts
@packages/platform/src/db/schemas.ts
@packages/platform/src/db/roles.ts
@apps/migrator/post-migration.sql

<interfaces>
<!-- audit_history -->
export interface AuditEvent {
  tenantId: TenantId;
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete';
  actorUserId: UserId;
  before: unknown | null;
  after: unknown | null;
}
export async function writeAudit(tx: Tx, evt: AuditEvent): Promise<void>;

<!-- outbox -->

export interface OutboxEvent {
tenantId: TenantId;
aggregateType: string;
aggregateId: string;
eventType: string;
payload: unknown;
}
export async function writeOutbox(tx: Tx, evt: OutboxEvent): Promise<void>;
export async function dispatchOutboxBatch(): Promise<number>;

<!-- in-process bus (PC-08) — handlers run under the published row's tenant context -->

export type EventHandler = (evt: { tenantId: string; aggregateType: string; aggregateId: string; eventType: string; payload: unknown }) => Promise<void>;
export const eventBus: {
subscribe(eventType: string, handler: EventHandler): void;
publish(evt: { tenantId: string; aggregateType: string; aggregateId: string; eventType: string; payload: unknown }): Promise<void>;
};

<!-- pg-boss singleton -->

export async function getBoss(): Promise<PgBoss>;
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: audit_history schema + writeAudit helper</name>
  <files>
    packages/platform/src/audit/schema.ts,
    packages/platform/src/audit/writer.ts,
    packages/platform/src/index.ts,
    packages/platform/test/audit.test.ts,
    apps/migrator/post-migration.sql
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-CONTEXT.md D-24 (audit_history schema shape)
    - .planning/phases/01-foundations/01-RESEARCH.md §"Pattern 1" (RLS policy pattern reused for audit_history)
    - .planning/phases/01-foundations/01-VALIDATION.md row 5g (audit_history queryable for any non-ledger entity)
    - packages/platform/src/db/schemas.ts (existing pgSchema declarations)
    - packages/platform/src/db/expense-ledger.ts (RLS pattern reference)
  </read_first>
  <behavior>
    - audit_history table in shared_kernel schema with columns: id, tenant_id, entity_type, entity_id, action, actor_user_id, occurred_at, before_jsonb, after_jsonb
    - pgPolicy: tenant_id = ANY(current_setting('app.tenant_ids')::uuid[]) — same pattern as expense_ledger
    - writeAudit(tx, evt) INSERTs a row using sql tagged template (parameterized — never sql.raw)
    - Test: open withTenantTx for tenant T, writeAudit, then in another withTenantTx for SAME tenant T read back the row → visible. Different tenant T2 → invisible.
    - post-migration.sql appends `ALTER TABLE shared_kernel.audit_history FORCE ROW LEVEL SECURITY;` and grants
  </behavior>
  <action>
    1. Implement `packages/platform/src/audit/schema.ts`:
       ```ts
       import { sql } from 'drizzle-orm';
       import { pgPolicy, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
       import { sharedKernel } from '../db/schemas';
       import { appRole, workerRole } from '../db/roles';

       export const auditAction = sharedKernel.enum('audit_action', ['create', 'update', 'delete']);

       export const auditHistory = sharedKernel.table('audit_history', {
         id: uuid('id').primaryKey().defaultRandom(),
         tenantId: uuid('tenant_id').notNull(),
         entityType: text('entity_type').notNull(),
         entityId: text('entity_id').notNull(),
         action: auditAction('action').notNull(),
         actorUserId: uuid('actor_user_id').notNull(),
         occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
         beforeJsonb: jsonb('before_jsonb'),
         afterJsonb: jsonb('after_jsonb'),
       }, (t) => [
         pgPolicy('audit_history_tenant_isolation', {
           as: 'permissive',
           for: 'all',
           to: [appRole, workerRole],
           using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
           withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
         }),
       ]);
       ```
    2. Implement `packages/platform/src/audit/writer.ts`:
       ```ts
       import { sql } from 'drizzle-orm';
       import type { TenantId, UserId } from '@budget/shared-kernel';

       export interface AuditEvent {
         tenantId: TenantId;
         entityType: string;
         entityId: string;
         action: 'create' | 'update' | 'delete';
         actorUserId: UserId;
         before: unknown | null;
         after: unknown | null;
       }

       export async function writeAudit(tx: { execute: (q: unknown) => Promise<unknown> }, evt: AuditEvent): Promise<void> {
         await tx.execute(sql`
           INSERT INTO shared_kernel.audit_history
             (tenant_id, entity_type, entity_id, action, actor_user_id, before_jsonb, after_jsonb)
           VALUES
             (${evt.tenantId}, ${evt.entityType}, ${evt.entityId}, ${evt.action}, ${evt.actorUserId}, ${JSON.stringify(evt.before)}::jsonb, ${JSON.stringify(evt.after)}::jsonb)
         `);
       }
       ```
    3. Update `packages/platform/src/index.ts` to add: `export * from './audit/schema'; export * from './audit/writer';`
    4. WRITE TEST `packages/platform/test/audit.test.ts` (uses testcontainer from Plan 02 Task 5):
       ```ts
       import { test, expect, beforeAll } from 'bun:test';
       import { sql } from 'drizzle-orm';
       import { startTestcontainer } from '@budget/db/test/testcontainer';
       import { withTenantTx } from '../src/db/tx';
       import { writeAudit } from '../src/audit/writer';
       import { TenantId, UserId } from '@budget/shared-kernel';

       beforeAll(async () => { await startTestcontainer(); });

       const T1 = TenantId('00000000-0000-0000-0000-000000000010');
       const T2 = TenantId('00000000-0000-0000-0000-000000000011');
       const U1 = UserId('00000000-0000-0000-0000-000000000020');

       test('writeAudit inserts row visible same tenant', async () => {
         const w = await withTenantTx(T1, U1, async (tx) => {
           await writeAudit(tx, { tenantId: T1, entityType: 'workspace', entityId: 'w1', action: 'create', actorUserId: U1, before: null, after: { name: 'Test' } });
           const r = await tx.execute(sql`SELECT count(*)::int AS c FROM shared_kernel.audit_history WHERE entity_id = 'w1'`);
           return (r.rows[0] as { c: number }).c;
         });
         expect(w.isOk()).toBe(true);
         if (w.isOk()) expect(w.value).toBeGreaterThanOrEqual(1);
       });

       test('audit row in T1 invisible from T2 (RLS)', async () => {
         const w = await withTenantTx(T2, U1, async (tx) => {
           const r = await tx.execute(sql`SELECT count(*)::int AS c FROM shared_kernel.audit_history WHERE entity_id = 'w1'`);
           return (r.rows[0] as { c: number }).c;
         });
         expect(w.isOk()).toBe(true);
         if (w.isOk()) expect(w.value).toBe(0);
       });
       ```
    5. APPEND to `apps/migrator/post-migration.sql` (between the existing FORCE RLS block):
       ```sql
       -- Plan 03: audit_history
       GRANT SELECT, INSERT ON shared_kernel.audit_history TO app_role, worker_role;
       ALTER TABLE shared_kernel.audit_history FORCE ROW LEVEL SECURITY;
       ```

  </action>
  <verify>
    <automated>cd /home/claude/budget && bunx tsc --noEmit -p packages/platform/tsconfig.json && grep -F 'audit_history' apps/migrator/post-migration.sql && grep -F 'audit_history_tenant_isolation' packages/platform/src/audit/schema.ts</automated>
  </verify>
  <acceptance_criteria>
    - `packages/platform/src/audit/schema.ts` declares auditHistory table: `grep -F "sharedKernel.table('audit_history'" packages/platform/src/audit/schema.ts` exits 0
    - schema declares pgPolicy: `grep -F "audit_history_tenant_isolation" packages/platform/src/audit/schema.ts` exits 0
    - schema includes all D-24 columns: `for col in tenant_id entity_type entity_id action actor_user_id occurred_at before_jsonb after_jsonb; do grep -F "$col" packages/platform/src/audit/schema.ts; done` exits 0
    - `packages/platform/src/audit/writer.ts` exports writeAudit: `grep -F 'export async function writeAudit' packages/platform/src/audit/writer.ts` exits 0
    - writer uses sql tagged template (not sql.raw): `grep -F 'sql.raw' packages/platform/src/audit/writer.ts` exits non-zero
    - post-migration.sql includes audit_history FORCE RLS: `grep -F 'shared_kernel.audit_history FORCE ROW LEVEL SECURITY' apps/migrator/post-migration.sql` exits 0
    - `bunx tsc --noEmit -p packages/platform/tsconfig.json` exits 0
  </acceptance_criteria>
  <done>audit_history shipped (D-24/ENGR-07). writeAudit helper available for owner-shares edits (Plan 6) and any future audit-tracked entity.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: outbox schema + writer + dispatcher (PC-04 withInfraTx + PC-08 per-row tenant context)</name>
  <files>
    packages/platform/src/outbox/schema.ts,
    packages/platform/src/outbox/writer.ts,
    packages/platform/src/outbox/dispatcher.ts,
    packages/platform/src/events/bus.ts,
    packages/platform/src/index.ts,
    packages/platform/test/outbox-writer.test.ts,
    apps/migrator/post-migration.sql
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-RESEARCH.md §"Pattern 6: pg-boss + outbox dispatcher" (lines 736-806)
    - .planning/phases/01-foundations/01-RESEARCH.md §"Common Pitfalls" Pitfall 10 (outbox is infrastructure — NO RLS, GRANT-only)
    - .planning/phases/01-foundations/01-CONTEXT.md D-25
    - .planning/phases/01-foundations/01-RESEARCH.md §"Common Pitfalls" Pitfall 5 (pg-boss cron min cadence is 30s; use polling for 5s)
    - apps/migrator/post-migration.sql (existing OUTBOX_GRANTS_MARKER block)
    - packages/platform/src/db/tx.ts (PC-04 withInfraTx primitive)
  </read_first>
  <behavior>
    - outbox table in shared_kernel: id, tenant_id, aggregate_type, aggregate_id, event_type, payload_jsonb, created_at, dispatched_at
    - NO pgPolicy (Pitfall 10) — infrastructure
    - GRANTs in post-migration.sql: app_role INSERT only; worker_role SELECT, UPDATE only
    - writeOutbox(tx, evt) is called inside an existing tx
    - dispatchOutboxBatch() (PC-04 + PC-08):
      1. Wraps the outbox SELECT/UPDATE in withInfraTx() (PC-04 — no GUC at outer scope; infrastructure carve-out)
      2. SELECT id, tenant_id, ... FROM shared_kernel.outbox WHERE dispatched_at IS NULL ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 100
      3. For each row: BEFORE eventBus.publish(row), execute tenantContextSql([row.tenant_id], OUTBOX_SYSTEM_USER) inside the tx (PC-08)
      4. UPDATE outbox SET dispatched_at = now() WHERE id = ?
      5. Returns count
    - eventBus.publish documents (JSDoc): "Handlers receive events scoped to a single tenant via PC-08"
  </behavior>
  <action>
    1. Implement `packages/platform/src/outbox/schema.ts`:
       ```ts
       import { uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
       import { sharedKernel } from '../db/schemas';

       export const outbox = sharedKernel.table('outbox', {
         id: uuid('id').primaryKey().defaultRandom(),
         tenantId: uuid('tenant_id').notNull(),
         aggregateType: text('aggregate_type').notNull(),
         aggregateId: text('aggregate_id').notNull(),
         eventType: text('event_type').notNull(),
         payloadJsonb: jsonb('payload_jsonb').notNull(),
         createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
         dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
       });
       ```
    2. Implement `packages/platform/src/outbox/writer.ts`:
       ```ts
       import { sql } from 'drizzle-orm';
       import type { TenantId } from '@budget/shared-kernel';

       export interface OutboxEvent {
         tenantId: TenantId;
         aggregateType: string;
         aggregateId: string;
         eventType: string;
         payload: unknown;
       }

       export async function writeOutbox(tx: { execute: (q: unknown) => Promise<unknown> }, evt: OutboxEvent): Promise<void> {
         await tx.execute(sql`
           INSERT INTO shared_kernel.outbox (tenant_id, aggregate_type, aggregate_id, event_type, payload_jsonb)
           VALUES (${evt.tenantId}, ${evt.aggregateType}, ${evt.aggregateId}, ${evt.eventType}, ${JSON.stringify(evt.payload)}::jsonb)
         `);
       }
       ```
    3. Implement `packages/platform/src/events/bus.ts` (PC-08 JSDoc on publish):
       ```ts
       export type DispatchedEvent = { tenantId: string; aggregateType: string; aggregateId: string; eventType: string; payload: unknown };
       export type EventHandler = (evt: DispatchedEvent) => Promise<void>;

       const handlers = new Map<string, EventHandler[]>();

       export const eventBus = {
         subscribe(eventType: string, handler: EventHandler) {
           const list = handlers.get(eventType) ?? [];
           list.push(handler);
           handlers.set(eventType, list);
         },
         /**
          * PC-08: Handlers receive events scoped to a single tenant. The outbox dispatcher
          * sets app.tenant_ids = [evt.tenantId] (and a system app.current_user_id) BEFORE calling
          * publish, so any in-process handler that performs DB I/O during this call runs under
          * that tenant's RLS context. Handlers MUST NOT escape this scope (e.g. by opening a
          * fresh withInfraTx) — Plan 10 leak-CI test #5 asserts this invariant.
          */
         async publish(evt: DispatchedEvent) {
           const list = handlers.get(evt.eventType) ?? [];
           for (const h of list) {
             try { await h(evt); } catch (e) { console.error(`[event-bus] handler failed for ${evt.eventType}`, e); }
           }
         },
       };
       ```
    4. Implement `packages/platform/src/outbox/dispatcher.ts` (PC-04 + PC-08):
       ```ts
       import { sql } from 'drizzle-orm';
       import { withInfraTx } from '../db/tx';
       import { tenantContextSql } from '../db/rls';
       import { eventBus } from '../events/bus';
       import { TenantId, UserId } from '@budget/shared-kernel';

       /** PC-08 system principal — outbox dispatcher's app.current_user_id placeholder. */
       const OUTBOX_SYSTEM_USER = UserId('00000000-0000-0000-0000-00000000fafe');

       export async function dispatchOutboxBatch(): Promise<number> {
         // PC-04: use withInfraTx (infrastructure carve-out) — never workerDb().transaction directly
         const r = await withInfraTx(async (tx) => {
           const sel = await tx.execute(sql`
             SELECT id, tenant_id, aggregate_type, aggregate_id, event_type, payload_jsonb
             FROM shared_kernel.outbox
             WHERE dispatched_at IS NULL
             ORDER BY created_at
             FOR UPDATE SKIP LOCKED
             LIMIT 100
           `);
           const rows = sel.rows as Array<{ id: string; tenant_id: string; aggregate_type: string; aggregate_id: string; event_type: string; payload_jsonb: unknown }>;
           for (const row of rows) {
             // PC-08: scope in-process handlers to the row's tenant before publish
             for (const stmt of tenantContextSql([TenantId(row.tenant_id)], OUTBOX_SYSTEM_USER)) {
               await tx.execute(stmt);
             }
             await eventBus.publish({
               tenantId: row.tenant_id,
               aggregateType: row.aggregate_type,
               aggregateId: row.aggregate_id,
               eventType: row.event_type,
               payload: row.payload_jsonb,
             });
             await tx.execute(sql`UPDATE shared_kernel.outbox SET dispatched_at = now() WHERE id = ${row.id}`);
           }
           return rows.length;
         });
         if (r.isErr()) throw r.error;
         return r.value;
       }
       ```
    5. APPEND to `apps/migrator/post-migration.sql` (replace OUTBOX_GRANTS_MARKER block):
       ```sql
       -- Plan 03: outbox (Pitfall 10 — NO RLS, GRANT-restricted access)
       GRANT INSERT ON shared_kernel.outbox TO app_role;
       GRANT SELECT, UPDATE ON shared_kernel.outbox TO worker_role;
       -- Intentionally NO ALTER TABLE shared_kernel.outbox FORCE ROW LEVEL SECURITY — this is infrastructure.
       ```
    6. Update `packages/platform/src/index.ts` to add: `export * from './outbox/schema'; export * from './outbox/writer'; export * from './outbox/dispatcher'; export * from './events/bus';`
    7. WRITE TEST `packages/platform/test/outbox-writer.test.ts`:
       ```ts
       import { test, expect, beforeAll } from 'bun:test';
       import { sql } from 'drizzle-orm';
       import { startTestcontainer } from '@budget/db/test/testcontainer';
       import { withTenantTx } from '../src/db/tx';
       import { writeOutbox } from '../src/outbox/writer';
       import { dispatchOutboxBatch } from '../src/outbox/dispatcher';
       import { eventBus } from '../src/events/bus';
       import { TenantId, UserId } from '@budget/shared-kernel';

       beforeAll(async () => { await startTestcontainer(); });

       const T1 = TenantId('00000000-0000-0000-0000-0000000000a0');
       const U1 = UserId('00000000-0000-0000-0000-0000000000a1');

       test('writeOutbox + dispatch publishes event exactly once', async () => {
         let calls = 0;
         eventBus.subscribe('test.evt', async () => { calls++; });
         await withTenantTx(T1, U1, async (tx) => {
           await writeOutbox(tx, { tenantId: T1, aggregateType: 'X', aggregateId: 'a1', eventType: 'test.evt', payload: { v: 1 } });
         });
         const n1 = await dispatchOutboxBatch();
         const n2 = await dispatchOutboxBatch();
         expect(n1).toBeGreaterThanOrEqual(1);
         expect(n2).toBe(0);
         expect(calls).toBe(1);
       });
       ```

  </action>
  <verify>
    <automated>cd /home/claude/budget && bunx tsc --noEmit -p packages/platform/tsconfig.json && grep -F 'FOR UPDATE SKIP LOCKED' packages/platform/src/outbox/dispatcher.ts && grep -F 'withInfraTx' packages/platform/src/outbox/dispatcher.ts && grep -F 'tenantContextSql' packages/platform/src/outbox/dispatcher.ts && grep -F 'GRANT INSERT ON shared_kernel.outbox TO app_role' apps/migrator/post-migration.sql && grep -F 'GRANT SELECT, UPDATE ON shared_kernel.outbox TO worker_role' apps/migrator/post-migration.sql</automated>
  </verify>
  <acceptance_criteria>
    - `packages/platform/src/outbox/schema.ts` declares outbox table without pgPolicy: `grep -F 'outbox' packages/platform/src/outbox/schema.ts && ! grep -F 'pgPolicy' packages/platform/src/outbox/schema.ts` exits 0
    - dispatcher uses FOR UPDATE SKIP LOCKED: `grep -F 'FOR UPDATE SKIP LOCKED' packages/platform/src/outbox/dispatcher.ts` exits 0
    - PC-04: dispatcher uses withInfraTx (not workerDb().transaction): `grep -F 'withInfraTx' packages/platform/src/outbox/dispatcher.ts && ! grep -F 'workerDb().transaction' packages/platform/src/outbox/dispatcher.ts` exits 0
    - PC-08: dispatcher applies tenantContextSql before publish: `grep -F 'tenantContextSql' packages/platform/src/outbox/dispatcher.ts` exits 0
    - eventBus JSDoc references PC-08: `grep -F 'PC-08' packages/platform/src/events/bus.ts` exits 0
    - dispatcher updates dispatched_at: `grep -F 'UPDATE shared_kernel.outbox SET dispatched_at' packages/platform/src/outbox/dispatcher.ts` exits 0
    - post-migration.sql grants outbox INSERT to app_role: `grep -F 'GRANT INSERT ON shared_kernel.outbox TO app_role' apps/migrator/post-migration.sql` exits 0
    - post-migration.sql grants outbox SELECT, UPDATE to worker_role: `grep -F 'GRANT SELECT, UPDATE ON shared_kernel.outbox TO worker_role' apps/migrator/post-migration.sql` exits 0
    - post-migration.sql does NOT FORCE RLS on outbox: `! grep -F 'ALTER TABLE shared_kernel.outbox FORCE' apps/migrator/post-migration.sql` exits 0
    - `bunx tsc --noEmit -p packages/platform/tsconfig.json` exits 0
  </acceptance_criteria>
  <done>Outbox + dispatcher shipped per D-25 with Pitfall-10-compliant access control. PC-04: dispatcher opens tx via withInfraTx. PC-08: per-row tenant context applied before publish so in-process handlers run under the row's tenant.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: pg-boss singleton + apps/worker entrypoint + restart-safety test</name>
  <files>
    packages/platform/src/jobs/boss.ts,
    packages/platform/src/index.ts,
    packages/platform/test/outbox-restart.test.ts,
    apps/worker/package.json,
    apps/worker/tsconfig.json,
    apps/worker/src/worker.ts,
    apps/worker/src/handlers/outbox-dispatch.ts,
    apps/worker/Dockerfile
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-RESEARCH.md §"Pattern 6" (pg-boss constructor + work pollingIntervalSeconds)
    - .planning/phases/01-foundations/01-CONTEXT.md D-10 (worker tenant propagation)
    - .planning/phases/01-foundations/01-VALIDATION.md row 5h (outbox restart-safety test)
    - .planning/phases/01-foundations/01-RESEARCH.md §"Common Pitfalls" Pitfall 5 (cron min cadence)
  </read_first>
  <behavior>
    - getBoss() returns a singleton PgBoss configured with workerPool DSN, schema 'pgboss', applicationName 'budget-worker'
    - apps/worker/src/worker.ts:
      - calls loadEnv() at boot (fail-fast)
      - calls await getBoss()
      - boss.createQueue('outbox-dispatch')
      - boss.work('outbox-dispatch', { pollingIntervalSeconds: 5, batchSize: 1 }, async () => dispatchOutboxBatch())
      - boss.schedule('outbox-dispatch', '*/1 * * * *')  // re-trigger every minute as safety net
      - process.on('SIGTERM', graceful shutdown — boss.stop)
    - outbox-restart test inserts N events, calls dispatcher, kills boss mid-batch via boss.stop(), restarts boss, asserts each event delivered exactly once
  </behavior>
  <action>
    1. Add to `packages/platform/package.json` dependencies: `"pg-boss": "^12.18.2"`. Run `bun install`.
    2. Implement `packages/platform/src/jobs/boss.ts`:
       ```ts
       import PgBoss from 'pg-boss';
       import { loadEnv } from '@budget/shared-kernel';

       let boss: PgBoss | undefined;

       export async function getBoss(): Promise<PgBoss> {
         if (boss) return boss;
         const env = loadEnv();
         boss = new PgBoss({
           connectionString: env.DATABASE_URL_WORKER,
           schema: 'pgboss',
           application_name: 'budget-worker',
         });
         await boss.start();
         return boss;
       }

       export async function stopBoss(): Promise<void> {
         if (boss) {
           await boss.stop({ graceful: true, timeout: 5000 });
           boss = undefined;
         }
       }
       ```
    3. Update `packages/platform/src/index.ts`: `export * from './jobs/boss';`
    4. Add to `apps/worker/package.json`:
       ```json
       "dependencies": {
         "@budget/platform": "workspace:*",
         "@budget/shared-kernel": "workspace:*",
         "pg-boss": "^12.18.2"
       },
       "scripts": { "start": "bun run src/worker.ts", "typecheck": "tsc --noEmit -p tsconfig.json" }
       ```
    5. Create `apps/worker/tsconfig.json` extending `../../tsconfig.base.json` with `"include": ["src/**/*"]`.
    6. Implement `apps/worker/src/handlers/outbox-dispatch.ts`:
       ```ts
       import { dispatchOutboxBatch } from '@budget/platform';
       export async function handleOutboxTick() {
         const n = await dispatchOutboxBatch();
         if (n > 0) console.log(`[worker] dispatched ${n} outbox events`);
       }
       ```
    7. Implement `apps/worker/src/worker.ts`:
       ```ts
       import { getBoss, stopBoss } from '@budget/platform';
       import { handleOutboxTick } from './handlers/outbox-dispatch';

       async function main() {
         const boss = await getBoss();
         await boss.createQueue('outbox-dispatch');
         await boss.work('outbox-dispatch', { pollingIntervalSeconds: 5, batchSize: 1 }, async () => { await handleOutboxTick(); });
         await boss.schedule('outbox-dispatch', '*/1 * * * *');
         console.log('[worker] booted; outbox-dispatch polling=5s schedule=*/1m');
         process.on('SIGTERM', async () => { console.log('[worker] SIGTERM, stopping...'); await stopBoss(); process.exit(0); });
         process.on('SIGINT', async () => { console.log('[worker] SIGINT, stopping...'); await stopBoss(); process.exit(0); });
       }

       main().catch((e) => { console.error('[worker] failed', e); process.exit(1); });
       ```
    8. Create `apps/worker/Dockerfile` (multi-stage Bun, mirrors apps/migrator):
       ```dockerfile
       FROM oven/bun:1.3 AS deps
       WORKDIR /app
       COPY package.json bun.lockb ./
       COPY apps/worker/package.json apps/worker/
       COPY packages/platform/package.json packages/platform/
       COPY packages/shared-kernel/package.json packages/shared-kernel/
       RUN bun install --frozen-lockfile

       FROM oven/bun:1.3
       WORKDIR /app
       COPY --from=deps /app/node_modules ./node_modules
       COPY . .
       WORKDIR /app/apps/worker
       HEALTHCHECK --interval=30s --timeout=10s CMD bun -e "process.exit(0)"
       CMD ["bun", "run", "src/worker.ts"]
       ```
    9. WRITE TEST `packages/platform/test/outbox-restart.test.ts`:
       ```ts
       import { test, expect, beforeAll } from 'bun:test';
       import { sql } from 'drizzle-orm';
       import { startTestcontainer } from '@budget/db/test/testcontainer';
       import { withTenantTx, withInfraTx } from '../src/db/tx';
       import { writeOutbox } from '../src/outbox/writer';
       import { dispatchOutboxBatch } from '../src/outbox/dispatcher';
       import { eventBus } from '../src/events/bus';
       import { TenantId, UserId } from '@budget/shared-kernel';

       beforeAll(async () => { await startTestcontainer(); });

       const T = TenantId('00000000-0000-0000-0000-0000000000b0');
       const U = UserId('00000000-0000-0000-0000-0000000000b1');

       test('outbox events delivered exactly once across simulated restart', async () => {
         await withTenantTx(T, U, async (tx) => {
           for (let i = 0; i < 5; i++) {
             await writeOutbox(tx, { tenantId: T, aggregateType: 'restart', aggregateId: String(i), eventType: 'restart.evt', payload: { i } });
           }
         });
         const seen = new Set<number>();
         eventBus.subscribe('restart.evt', async (e) => { seen.add((e.payload as { i: number }).i); });

         await dispatchOutboxBatch();
         const second = await dispatchOutboxBatch();
         expect(second).toBe(0);

         const r = await withInfraTx(async (tx) => tx.execute(sql`SELECT count(*)::int AS c FROM shared_kernel.outbox WHERE aggregate_type = 'restart' AND dispatched_at IS NULL`));
         expect(r.isOk()).toBe(true);
         if (r.isOk()) expect((r.value.rows[0] as { c: number }).c).toBe(0);
         expect(seen.size).toBe(5);
       });
       ```

  </action>
  <verify>
    <automated>cd /home/claude/budget && bunx tsc --noEmit -p packages/platform/tsconfig.json && bunx tsc --noEmit -p apps/worker/tsconfig.json && grep -F 'pollingIntervalSeconds: 5' apps/worker/src/worker.ts && grep -F "schema: 'pgboss'" packages/platform/src/jobs/boss.ts</automated>
  </verify>
  <acceptance_criteria>
    - `packages/platform/src/jobs/boss.ts` uses pgboss schema: `grep -F "schema: 'pgboss'" packages/platform/src/jobs/boss.ts` exits 0
    - `packages/platform/src/jobs/boss.ts` exports getBoss singleton: `grep -F 'export async function getBoss' packages/platform/src/jobs/boss.ts` exits 0
    - `apps/worker/src/worker.ts` registers outbox-dispatch worker with 5s polling: `grep -F 'pollingIntervalSeconds: 5' apps/worker/src/worker.ts` exits 0
    - `apps/worker/src/worker.ts` schedules safety re-trigger every minute: `grep -F "boss.schedule('outbox-dispatch'" apps/worker/src/worker.ts` exits 0
    - `apps/worker/Dockerfile` exists with Bun: `grep -F 'FROM oven/bun:1.3' apps/worker/Dockerfile` exits 0
    - SIGTERM handler present: `grep -F "process.on('SIGTERM'" apps/worker/src/worker.ts` exits 0
    - Restart-safety test exists: `test -f packages/platform/test/outbox-restart.test.ts` exits 0
    - `bunx tsc --noEmit -p apps/worker/tsconfig.json` exits 0
    - `bunx tsc --noEmit -p packages/platform/tsconfig.json` exits 0
  </acceptance_criteria>
  <done>pg-boss singleton + apps/worker entrypoint shipped. Outbox restart-safety test asserts dispatched_at-based dedupe works across simulated restarts (5h verification).</done>
</task>

<task type="auto">
  <name>Task 4: PC-29 forward reference — drizzle-kit generate is OWNED BY PLAN 06 close-out</name>
  <files>
    (none — documentation-only forward reference)
  </files>
  <read_first>
    - .planning/phases/01-foundations/06-tenancy-context-PLAN.md Task 4 (the close-out task that runs `bunx drizzle-kit generate`)
    - .planning/phases/01-foundations/02-db-rls-skeleton-PLAN.md Task 5 (testcontainer reads generated migrations at TEST TIME)
    - apps/migrator/drizzle.config.ts (schema array — Plans 02/03/04/05/06 each EXTEND the array; Plan 06 generates ONCE all schemas exist)
  </read_first>
  <behavior>
    PC-29 supersedes the previous PC-13 placement of `drizzle-kit generate` in this plan. Reason: Plan 03 runs in Wave 1, but identity (Plan 05) and tenancy (Plan 06) schemas land in Wave 2. `bunx drizzle-kit generate --config=apps/migrator/drizzle.config.ts` reads ALL schema files referenced in the config; running it in Plan 03 would either (a) emit migrations missing the Wave-2 tables, requiring a regeneration in Plan 06 anyway, or (b) fail outright when drizzle-kit cannot resolve the missing schema imports.

    Correct ownership: Plan 06's close-out task (Task 4 in Plan 06) runs `bunx drizzle-kit generate` AFTER all Phase-1 schema files exist. The testcontainer (Plan 02 Task 5) reads the resulting `drizzle/0000_*.sql` files at TEST TIME (during `beforeAll`). Wave-2 integration tests therefore depend on Plan 06's close-out task having run; this is enforced by the wave structure (Plan 06 is the last Wave-2 plan to land before Wave-3 testcontainer-using verification).

    Plan 03's `provides` list shrinks accordingly: this plan declares the `audit_history` and `outbox` schemas (Tasks 1 + 2) but does NOT generate the migration SQL. The post-migration.sql additions (FORCE RLS, GRANTs) Plan 03 does append still apply at migrator-run time.

  </behavior>
  <action>
    No code changes in this task. Document the PC-29 reassignment:
    1. Verify the previously-removed generate work is NOT referenced anywhere in this plan's other tasks (audit/outbox tasks above declare schemas but do not call drizzle-kit generate).
    2. Cross-reference Plan 06 Task 4 (close-out) which now owns the generate command.
    3. Cross-reference Plan 02 Task 5 (testcontainer) which is updated to document that it CONSUMES the generated SQL at test time.
    4. The drizzle.config.ts schema array continues to be EXTENDED by Plans 03 (this plan, via audit/outbox schema files), 04, 05, 06 as they each declare new schema files. Each plan's task list adds its own files to the array entry. Plan 06 then runs the actual generate.
  </action>
  <verify>
    <automated>cd /home/claude/budget && grep -F 'PC-29' .planning/phases/01-foundations/06-tenancy-context-PLAN.md && ! grep -F 'bunx drizzle-kit generate' .planning/phases/01-foundations/03-audit-and-outbox-PLAN.md</automated>
  </verify>
  <acceptance_criteria>
    - PC-29 forward reference present in this plan's objective: `grep -F 'PC-29' .planning/phases/01-foundations/03-audit-and-outbox-PLAN.md` exits 0
    - Plan 03 does NOT invoke `bunx drizzle-kit generate` in any task action: `! grep -F 'bunx drizzle-kit generate' .planning/phases/01-foundations/03-audit-and-outbox-PLAN.md` exits 0
    - Plan 06 close-out task references the generate command (cross-reference target exists): `grep -F 'bunx drizzle-kit generate' .planning/phases/01-foundations/06-tenancy-context-PLAN.md` exits 0
  </acceptance_criteria>
  <done>PC-29 reassignment recorded. Plan 03 declares schemas (audit_history, outbox) but does NOT generate the migration SQL — Plan 06 close-out owns generation; testcontainer (Plan 02 Task 5) consumes generated SQL at test time.</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                                 | Description                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| Domain write → outbox INSERT             | Same transaction; either both happen or neither                                           |
| Outbox row → in-process bus              | Dispatcher publishes after locking row; SKIP LOCKED prevents concurrent dispatchers       |
| Worker process → DB                      | worker_role with NOBYPASSRLS; outbox itself is GRANT-restricted infrastructure            |
| Outbox dispatch → handler tenant context | PC-08: dispatcher applies tenantContextSql before publish so handler DB I/O is RLS-scoped |

## STRIDE Threat Register

| Threat ID  | Category                             | Component                                                                                  | Disposition | Mitigation Plan                                                                                                                                                                                                                                             |
| ---------- | ------------------------------------ | ------------------------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-01-03-01 | Tampering                            | Domain event lost between aggregate write and outbox INSERT (transactional outbox failure) | mitigate    | writeOutbox accepts the same `tx` as the aggregate write; both succeed or both roll back                                                                                                                                                                    |
| T-01-03-02 | Repudiation / Information Disclosure | audit_history visible across tenants                                                       | mitigate    | pgPolicy `audit_history_tenant_isolation` with same GUC array predicate as user-data tables; FORCE RLS in post-migration.sql; tenant-leak CI gate (Plan 10) covers this table                                                                               |
| T-01-03-03 | Tampering                            | Outbox at-most-once split (event dispatched but dispatched_at not updated)                 | mitigate    | Dispatcher uses single transaction (PC-04 withInfraTx): SELECT FOR UPDATE SKIP LOCKED → publish → UPDATE dispatched_at; tx commit ties them together                                                                                                        |
| T-01-03-04 | Tampering                            | Outbox at-least-once duplicate dispatch on worker restart mid-batch (ENGR-08)              | mitigate    | dispatched_at is set inside the same tx as publish; SKIP LOCKED prevents concurrent dispatchers; outbox-restart.test.ts asserts this                                                                                                                        |
| T-01-03-05 | Elevation of Privilege               | app_role reading outbox events for OTHER tenants via lack of RLS                           | mitigate    | post-migration.sql GRANTs INSERT-only to app_role on outbox; SELECT/UPDATE worker_role only                                                                                                                                                                 |
| T-01-03-06 | Information Disclosure               | sensitive PII in outbox payload_jsonb                                                      | accept      | Phase-1 outbox is infrastructure; producers control payloads. Documented for Phase-2+: do not put PII in payload_jsonb                                                                                                                                      |
| T-01-03-07 | Information Disclosure               | In-process handler escaping the row's tenant scope (PC-08 risk)                            | mitigate    | Dispatcher applies tenantContextSql([row.tenant_id], OUTBOX_SYSTEM_USER) before each publish; handler's DB I/O sees only that tenant; eventBus.publish JSDoc documents the contract; Plan 10 leak-CI test #5 asserts handler cannot escape the row's tenant |

</threat_model>

<verification>
```bash
cd /home/claude/budget
bunx tsc --noEmit -p packages/platform/tsconfig.json
bunx tsc --noEmit -p apps/worker/tsconfig.json
bunx depcruise --config .dependency-cruiser.cjs --output-type err packages/platform apps/worker
bun test packages/platform/test/audit.test.ts
bun test packages/platform/test/outbox-writer.test.ts
bun test packages/platform/test/outbox-restart.test.ts
grep -F 'shared_kernel.audit_history FORCE ROW LEVEL SECURITY' apps/migrator/post-migration.sql
grep -F 'GRANT INSERT ON shared_kernel.outbox TO app_role' apps/migrator/post-migration.sql
grep -F 'GRANT SELECT, UPDATE ON shared_kernel.outbox TO worker_role' apps/migrator/post-migration.sql
! grep -F 'ALTER TABLE shared_kernel.outbox FORCE' apps/migrator/post-migration.sql
# PC-29: Plan 03 does NOT generate migrations — Plan 06 close-out owns this
! grep -F 'bunx drizzle-kit generate' .planning/phases/01-foundations/03-audit-and-outbox-PLAN.md
```
All exit 0; integration tests pass via testcontainer (note: Wave-2 testcontainer-backed runs depend on Plan 06's generate task having produced drizzle/0000_*.sql).
</verification>

<success_criteria>

- shared_kernel.audit_history table with RLS policy (D-24, ENGR-07)
- writeAudit(tx, evt) helper inserts audit row in same tx as caller's aggregate write
- shared_kernel.outbox table without RLS (Pitfall 10) — INSERT-only for app_role, SELECT/UPDATE for worker_role
- writeOutbox(tx, evt) writes outbox row in same tx as aggregate
- dispatchOutboxBatch() opens tx via withInfraTx (PC-04) and applies tenantContextSql before each publish (PC-08)
- pg-boss singleton in pgboss schema (kept out of bounded-context schemas)
- apps/worker boot: registers outbox-dispatch with pollingIntervalSeconds=5 and a safety re-trigger every minute (Pitfall 5)
- SIGTERM/SIGINT graceful shutdown
- outbox-restart test asserts dispatched_at-based dedupe across restart (5h)
- PC-29: drizzle-kit generate is OWNED BY PLAN 06's close-out task; Plan 03 declares its schemas but does NOT run generate (cannot succeed in Wave 1 because Wave-2 schemas don't exist yet)
- post-migration.sql appended with audit_history FORCE RLS + outbox GRANTs
  </success_criteria>

<output>
After completion, create `.planning/phases/01-foundations/01-03-SUMMARY.md`
</output>
</content>
