/**
 * list-pending-tasks.ts — BDP-03 application service.
 *
 * Composes a single port call (TaskRepo.listPending). Phase 3 ships only the
 * read path; Phase 7 will add resolve/snooze flows on top of the same port.
 *
 * Hex boundary (ENGR-02): NO drizzle, NO hono. Pure composition.
 * v1.1 invariant: budgetId === tenantId. The route layer enforces equality
 * by asserting `c.get("tenantIds").includes(budgetId)` before calling this.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { TaskRepo, TaskSummary } from "../ports/task-repo";

export interface ListPendingTasksInput {
  /** Always equals budgetId per v1.1; kept distinct on the signature for clarity. */
  tenantId: string;
  budgetId: string;
}

export interface ListPendingTasksDeps {
  taskRepo: TaskRepo;
}

export function listPendingTasks(deps: ListPendingTasksDeps) {
  return async (
    input: ListPendingTasksInput,
  ): Promise<Result<TaskSummary[], Error>> => {
    try {
      const rows = await deps.taskRepo.listPending(
        input.budgetId,
        input.tenantId,
      );
      return ok(rows);
    } catch (e) {
      return err(e as Error);
    }
  };
}
