/**
 * task-repo.ts — Port interface for TaskRepo (BDP-03).
 *
 * No Drizzle imports — hex boundary enforced by dep-cruiser (ENGR-02).
 * Phase 3 ships the READ path only (this port has a single `listPending`
 * method). Phase 7 will extend with write operations (resolve, dismiss,
 * snooze) on the same port without reshaping this read surface.
 *
 * v1.1 invariant: `budget_id === tenant_id`. Both args are kept on the port
 * signature so the adapter can scope RLS by tenant_id while filtering by
 * budget_id — defense-in-depth even though they are equal in v1.1.
 */
export type TaskKind =
  | "RESERVE_TOPUP"
  | "CONFIRM_DRAFT"
  | "STALE_WALLET"
  | "MONTH_END_REVIEW";

export type TaskStatus = "PENDING" | "RESOLVED";

export interface TaskSummary {
  id: string;
  budget_id: string;
  kind: TaskKind;
  status: TaskStatus;
  payload: Record<string, unknown>;
  /** ISO-8601 timestamp (UTC). Adapter converts from Postgres `timestamptz`. */
  created_at: string;
}

export interface TaskRepo {
  /**
   * Returns PENDING tasks for the given budget, ordered ASC by `created_at`.
   * RLS at the DB layer ensures cross-tenant rows are unreachable; route
   * also asserts `tenantIds.includes(budgetId)` before invoking this.
   */
  listPending(budgetId: string, tenantId: string): Promise<TaskSummary[]>;
}
