/**
 * resolve-task.ts — Phase 7 application service for POST /budgets/:id/tasks/:taskId/resolve.
 *
 * Mirrors the closure-over-deps shape used by list-pending-tasks.ts (BDP-03).
 * Hex boundary (ENGR-02): no persistence-adapter imports, no HTTP-framework
 * imports. Pure composition through the TaskRepo port.
 *
 * v1.1 invariant: budgetId === tenantId. The route layer enforces equality
 * by asserting `c.get("tenantIds").includes(budgetId)` before calling this.
 *
 * Wiring: deferred to Plan 07-07 (API routes), which adds
 *   `resolveTask: resolveTask({ taskRepo })`
 * to the boot.ts deps.budgeting registry alongside `listPendingTasks`.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { TaskRepo } from "../ports/task-repo";

export interface ResolveTaskInput {
  /** Always equals budgetId per v1.1; kept distinct on the signature for clarity. */
  tenantId: string;
  budgetId: string;
  taskId: string;
  /** r32: the user who resolved it — excluded from the completion push. */
  actorUserId?: string;
}

export interface ResolveTaskDeps {
  taskRepo: TaskRepo;
}

export function resolveTask(deps: ResolveTaskDeps) {
  return async (input: ResolveTaskInput): Promise<Result<void, Error>> => {
    try {
      // budgetId is currently ignored by the adapter (tenant + taskId already
      // scope the resolve). We accept budgetId in the input contract for
      // symmetry with other budget-scoped services and to keep the route
      // handler shape consistent. The adapter UPDATE is also gated by
      // status='PENDING' so re-resolves silently no-op (idempotent).
      await deps.taskRepo.resolve(
        input.taskId,
        input.tenantId,
        undefined,
        input.actorUserId,
      );
      return ok(undefined);
    } catch (e) {
      return err(e as Error);
    }
  };
}
