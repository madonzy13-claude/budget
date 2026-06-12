/**
 * task-repo.ts — Drizzle adapter for TaskRepo port (BDP-03 + Phase 7).
 *
 * Reads `budgeting.tasks` via withTenantTx so the `app.tenant_ids` GUC
 * activates the `tasks_tenant_isolation` RLS policy. Even if a caller passes
 * a tenantId that does not match budgetId (impossible in v1.1 by invariant,
 * but defended in depth), the RLS predicate `tenant_id = ANY(app.tenant_ids)`
 * filters cross-tenant rows out at the DB layer.
 *
 * Phase 7 adds the WRITE surface:
 *   - emitReserveTopup / emitConfirmDraft / emitCushionBelowTarget — INSERT ON
 *     CONFLICT DO NOTHING. Partial unique indexes from migration 0026 enforce
 *     idempotency at the DB layer (one PENDING task per dedup key).
 *   - resolve / resolveByKindAndBudget / resolveConfirmDraftByDraftId —
 *     idempotent UPDATEs scoped by tenant_id + status='PENDING'. Already
 *     RESOLVED rows and cross-tenant rows silently no-op (0 rows updated).
 *
 * tx parameter semantics:
 *   - emit methods require tx (always called from inside an existing
 *     withTenantTx — generators run inside the trigger event's tx).
 *   - resolve methods accept tx? (route opens its own; auto-resolve hooks
 *     piggyback the caller's tx for atomicity).
 *
 * Money / domain types: NONE — the tasks table has no money fields at this
 * read layer (payload_json is opaque jsonb; consumer-side typing happens
 * via the per-kind Payload interfaces in the port).
 */
import { sql } from "drizzle-orm";
import { withTenantTx, writeOutbox } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type {
  TaskRepo,
  TaskSummary,
  TaskKind,
  TenantTx,
  ReserveTopupPayload,
  ConfirmDraftPayload,
  CushionBelowTargetPayload,
} from "../../ports/task-repo";

/**
 * System user UUID used when no human actor is on the request path.
 * Mirrors the convention in list-pending-drafts.ts. The user_id GUC is
 * required by withTenantTx; for read-only RLS-scoped SELECTs the value
 * matters only for audit; no audit rows are written by this read path.
 */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Drizzle tx shape used by the adapter. The port's TenantTx type intentionally
 * keeps `execute(q: unknown)` so port consumers do not pull in drizzle-orm
 * types. Inside the adapter we cast back to the concrete shape per the project
 * convention (see list-pending-tasks pattern, lines 40–44 of original file).
 */
type DrizzleTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

/**
 * Private helper — INSERT into budgeting.tasks with ON CONFLICT DO NOTHING.
 * Partial unique indexes from migration 0026 enforce dedup at the DB layer:
 *   - tasks_reserve_topup_dedup_idx — UNIQUE (budget_id) WHERE kind='RESERVE_TOPUP' AND status='PENDING'
 *   - tasks_cushion_below_target_dedup_idx — UNIQUE (budget_id) WHERE kind='CUSHION_BELOW_TARGET' AND status='PENDING'
 *   - tasks_confirm_draft_dedup_idx — UNIQUE ((payload_json->>'draft_id')) WHERE kind='CONFIRM_DRAFT' AND status='PENDING'
 * Concurrent emit calls from different processes produce at most one PENDING
 * row per dedup key.
 */
async function emitTaskInTx(
  tx: TenantTx,
  tenantId: string,
  budgetId: string,
  kind: TaskKind,
  payload: Record<string, unknown>,
): Promise<void> {
  const drizzleTx = tx as DrizzleTx;
  const payloadJson = JSON.stringify(payload);
  const res = await drizzleTx.execute(sql`
    INSERT INTO budgeting.tasks
      (id, tenant_id, budget_id, kind, payload_json, status, created_at)
    VALUES
      (gen_random_uuid(), ${tenantId}::uuid, ${budgetId}::uuid,
       ${kind}, ${payloadJson}::jsonb, 'PENDING', now())
    ON CONFLICT DO NOTHING
    RETURNING id, (xmax = 0) AS inserted
  `);
  await emitTaskCreatedIfInserted(tx, res, tenantId, budgetId, kind);
}

/**
 * Phase 8 (08-02): emit exactly one `task.created` outbox event per *real*
 * task INSERT so the push worker has something to consume (RESEARCH Pitfall 1).
 *
 * Gated on a genuine insert — never on the ON CONFLICT idempotent path:
 *   - DO NOTHING conflict → RETURNING yields 0 rows → no emit.
 *   - DO UPDATE conflict  → the row's xmax is set, so `(xmax = 0)` is false → no emit.
 * Only a fresh row (xmax = 0, freshly inserted) fires the event. This keeps
 * payload-refresh upserts (RESERVE_TOPUP / CUSHION_BELOW_TARGET) from
 * re-notifying for a task the user already has.
 */
async function emitTaskCreatedIfInserted(
  tx: TenantTx,
  res: { rows: Record<string, unknown>[] },
  tenantId: string,
  budgetId: string,
  kind: TaskKind,
): Promise<void> {
  const row = res.rows[0];
  if (!row || row.inserted !== true) return;
  const taskId = row.id as string;
  await writeOutbox(tx as unknown as Parameters<typeof writeOutbox>[0], {
    tenantId: TenantId(tenantId),
    aggregateType: "task",
    aggregateId: taskId,
    eventType: "task.created",
    payload: { kind, budgetId, taskId },
  });
}

export function createTaskRepo(): TaskRepo {
  return {
    async listPending(budgetId, tenantId) {
      // v1.1 invariant: budgetId === tenantId. The route layer asserts this
      // before calling us; we still filter both columns explicitly so a
      // future schema split (tenant ≠ budget) does not silently bypass
      // tenant scoping.
      const r = await withTenantTx(
        TenantId(tenantId),
        UserId(SYSTEM_USER_ID),
        async (tx) => {
          const drizzleTx = tx as DrizzleTx;
          // 260612-kxd T3: self-heal orphan CONFIRM_DRAFT rows at read time.
          // A CONFIRM_DRAFT task is only actionable while its draft is live
          // (exists, not soft-deleted, not dismissed, not yet confirmed) AND
          // its category is not archived (archived_at set → the draft is
          // invisible in the UI, nothing to confirm — the legacy "Maczfit"
          // shape, where an archive's draft purge silently failed
          // pre-grants-fix). Any delete path that misses the in-tx resolve
          // (or pre-existing stale rows) is hidden here on the next banner
          // read — no manual SQL. The EXISTS subquery joins el.tenant_id to
          // tasks.tenant_id (T-kxd-02: another tenant's draft state can never
          // hide/heal this tenant's task); the category probe joins both
          // el.category_id and el.tenant_id for the same reason. A draft with
          // NULL category_id stays visible (NOT EXISTS over zero rows).
          const res = await drizzleTx.execute(sql`
            SELECT id, budget_id, kind, status, payload_json, created_at
              FROM budgeting.tasks
             WHERE budget_id = ${budgetId}::uuid
               AND tenant_id = ${tenantId}::uuid
               AND status = 'PENDING'
               AND (
                 kind <> 'CONFIRM_DRAFT'
                 OR EXISTS (
                   SELECT 1
                     FROM budgeting.expense_ledger el
                    WHERE el.id::text = tasks.payload_json->>'draft_id'
                      AND el.tenant_id = tasks.tenant_id
                      AND el.deleted_at IS NULL
                      AND el.dismissed_at IS NULL
                      AND el.confirmed_at IS NULL
                      AND NOT EXISTS (
                        SELECT 1
                          FROM budgeting.categories c
                         WHERE c.id = el.category_id
                           AND c.tenant_id = el.tenant_id
                           AND c.archived_at IS NOT NULL
                      )
                 )
               )
             ORDER BY created_at ASC
          `);
          return res.rows.map((row): TaskSummary => {
            const createdAtRaw = row.created_at;
            const createdAtIso =
              createdAtRaw instanceof Date
                ? createdAtRaw.toISOString()
                : new Date(String(createdAtRaw)).toISOString();
            return {
              id: row.id as string,
              budget_id: row.budget_id as string,
              kind: row.kind as TaskSummary["kind"],
              status: row.status as TaskSummary["status"],
              payload: (row.payload_json ?? {}) as Record<string, unknown>,
              created_at: createdAtIso,
            };
          });
        },
      );
      if (r.isErr()) throw r.error;
      return r.value;
    },

    async resolve(taskId, tenantId, tx) {
      const runUpdate = async (innerTx: TenantTx): Promise<void> => {
        const drizzleTx = innerTx as DrizzleTx;
        await drizzleTx.execute(sql`
          UPDATE budgeting.tasks
             SET status = 'RESOLVED', resolved_at = now()
           WHERE id = ${taskId}::uuid
             AND tenant_id = ${tenantId}::uuid
             AND status = 'PENDING'
        `);
      };

      if (tx) {
        await runUpdate(tx);
        return;
      }

      const r = await withTenantTx(
        TenantId(tenantId),
        UserId(SYSTEM_USER_ID),
        async (innerTx) => {
          await runUpdate(innerTx as unknown as TenantTx);
        },
      );
      if (r.isErr()) throw r.error;
    },

    async emitReserveTopup(
      tenantId,
      budgetId,
      payload: ReserveTopupPayload,
      tx,
    ) {
      // Unlike the other kinds, the RESERVE_TOPUP shortfall must track the live
      // reserve gap — so on conflict REFRESH the payload (DO UPDATE) instead of
      // DO NOTHING, otherwise an already-pending task keeps a stale amount after
      // a transaction/adjustment changes the reserve. Targets the partial unique
      // index tasks_reserve_topup_dedup_idx (budget_id WHERE kind+status pending).
      const drizzleTx = tx as DrizzleTx;
      const payloadJson = JSON.stringify(payload);
      const res = await drizzleTx.execute(sql`
        INSERT INTO budgeting.tasks
          (id, tenant_id, budget_id, kind, payload_json, status, created_at)
        VALUES
          (gen_random_uuid(), ${tenantId}::uuid, ${budgetId}::uuid,
           'RESERVE_TOPUP', ${payloadJson}::jsonb, 'PENDING', now())
        ON CONFLICT (budget_id) WHERE (kind = 'RESERVE_TOPUP' AND status = 'PENDING')
        DO UPDATE SET payload_json = EXCLUDED.payload_json
        RETURNING id, (xmax = 0) AS inserted
      `);
      await emitTaskCreatedIfInserted(
        tx,
        res,
        tenantId,
        budgetId,
        "RESERVE_TOPUP",
      );
    },

    async emitConfirmDraft(
      tenantId,
      budgetId,
      payload: ConfirmDraftPayload,
      tx,
    ) {
      await emitTaskInTx(
        tx,
        tenantId,
        budgetId,
        "CONFIRM_DRAFT",
        payload as unknown as Record<string, unknown>,
      );
    },

    async emitCushionBelowTarget(
      tenantId,
      budgetId,
      payload: CushionBelowTargetPayload,
      tx,
    ) {
      // Like RESERVE_TOPUP, the cushion shortfall must track the live numbers —
      // so on conflict REFRESH the payload (DO UPDATE) instead of DO NOTHING.
      // Otherwise an already-pending task keeps a stale shortfall after a
      // cushion_amount / target-months / cushion-wallet change (the wallets task
      // showed €5,300 while settings recomputed €8,900). Targets the partial
      // unique index tasks_cushion_below_target_dedup_idx
      // (budget_id WHERE kind='CUSHION_BELOW_TARGET' AND status='PENDING').
      const drizzleTx = tx as DrizzleTx;
      const payloadJson = JSON.stringify(payload);
      const res = await drizzleTx.execute(sql`
        INSERT INTO budgeting.tasks
          (id, tenant_id, budget_id, kind, payload_json, status, created_at)
        VALUES
          (gen_random_uuid(), ${tenantId}::uuid, ${budgetId}::uuid,
           'CUSHION_BELOW_TARGET', ${payloadJson}::jsonb, 'PENDING', now())
        ON CONFLICT (budget_id) WHERE (kind = 'CUSHION_BELOW_TARGET' AND status = 'PENDING')
        DO UPDATE SET payload_json = EXCLUDED.payload_json
        RETURNING id, (xmax = 0) AS inserted
      `);
      await emitTaskCreatedIfInserted(
        tx,
        res,
        tenantId,
        budgetId,
        "CUSHION_BELOW_TARGET",
      );
    },

    async resolveByKindAndBudget(tenantId, budgetId, kind, tx) {
      const drizzleTx = tx as DrizzleTx;
      await drizzleTx.execute(sql`
        UPDATE budgeting.tasks
           SET status = 'RESOLVED', resolved_at = now()
         WHERE budget_id = ${budgetId}::uuid
           AND tenant_id = ${tenantId}::uuid
           AND kind = ${kind}
           AND status = 'PENDING'
      `);
    },

    async resolveConfirmDraftByDraftId(tenantId, draftId, tx) {
      const drizzleTx = tx as DrizzleTx;
      await drizzleTx.execute(sql`
        UPDATE budgeting.tasks
           SET status = 'RESOLVED', resolved_at = now()
         WHERE tenant_id = ${tenantId}::uuid
           AND kind = 'CONFIRM_DRAFT'
           AND payload_json->>'draft_id' = ${draftId}
           AND status = 'PENDING'
      `);
    },
  };
}
