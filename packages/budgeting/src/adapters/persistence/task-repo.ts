/**
 * task-repo.ts — Drizzle adapter for TaskRepo port (BDP-03).
 *
 * Reads `budgeting.tasks` via withTenantTx so the `app.tenant_ids` GUC
 * activates the `tasks_tenant_isolation` RLS policy. Even if a caller passes
 * a tenantId that does not match budgetId (impossible in v1.1 by invariant,
 * but defended in depth), the RLS predicate `tenant_id = ANY(app.tenant_ids)`
 * filters cross-tenant rows out at the DB layer.
 *
 * Phase 3 ships the READ path only. Phase 7 will add resolve/snooze writes
 * on the same port without reshaping this surface.
 *
 * Money / domain types: NONE — the tasks table has no money fields at this
 * read layer (payload_json is opaque; consumer-side typing happens later).
 */
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { TaskRepo, TaskSummary } from "../../ports/task-repo";

/**
 * System user UUID used when no human actor is on the request path.
 * Mirrors the convention in list-pending-drafts.ts. The user_id GUC is
 * required by withTenantTx; for read-only RLS-scoped SELECTs the value
 * matters only for audit; no audit rows are written by this read path.
 */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

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
          const drizzleTx = tx as {
            execute: (
              q: unknown,
            ) => Promise<{ rows: Record<string, unknown>[] }>;
          };
          const res = await drizzleTx.execute(sql`
            SELECT id, budget_id, kind, status, payload_json, created_at
              FROM budgeting.tasks
             WHERE budget_id = ${budgetId}::uuid
               AND tenant_id = ${tenantId}::uuid
               AND status = 'PENDING'
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
  };
}
