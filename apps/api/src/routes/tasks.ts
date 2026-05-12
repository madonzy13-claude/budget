/**
 * tasks.ts — /budgets/:budgetId/tasks route factory (BDP-03 read path).
 *
 * PC-02: imports from package roots only.
 * T-2-04: zValidator on every endpoint (route is read-only; query param
 *         is the only client-controlled input).
 *
 * v1.1 invariant: budget_id === tenant_id (Better Auth org-as-tenant). The
 * tenant-guard middleware populates c.get("tenantIds") with the budgets the
 * authenticated user is a member of; this route asserts the URL budgetId is
 * in that verified set before invoking the application service.
 *
 * Phase 3 ships ONLY the read path. Phase 7 will extend this sub-router with
 * POST/PATCH for resolve / snooze without reshaping the read surface.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { BootedDeps } from "../boot";

const querySchema = z.object({
  // Phase 3 contract: only `?status=pending` is accepted. Anything else
  // (including absent) → 4xx via zValidator. Phase 7 may add `?status=resolved`
  // with explicit additional auth checks; see threat T-03-03-05.
  status: z.literal("pending"),
});

export function createTasksRoute(deps: BootedDeps) {
  const app = new Hono<{ Variables: Record<string, unknown> }>();

  app.get("/", zValidator("query", querySchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.param("budgetId");
    if (!budgetId) return c.json({ error: "missing_budget_id" }, 400);

    // Defence in depth (Layer 1 of the tenant-leak gate):
    //   tenant-guard middleware put verified tenants into c.get("tenantIds").
    //   Reject if budgetId is NOT in the user's verified set. Returning 404
    //   (not 403) avoids leaking the existence of budgets the user does not
    //   own.
    const tenantIds = c.get("tenantIds") as string[] | undefined;
    if (!tenantIds || !tenantIds.includes(budgetId)) {
      return c.json({ error: "not_found" }, 404);
    }
    const tenantId = budgetId; // v1.1: budget_id === tenant_id

    const result = await deps.budgeting.listPendingTasks({
      tenantId,
      budgetId,
    });
    if (result.isErr()) {
      console.error("[list-pending-tasks] failed:", result.error);
      return c.json({ error: "list_tasks_failed" }, 500);
    }
    return c.json({ budgetId, tasks: result.value });
  });

  return app;
}
