import type { MiddlewareHandler } from "hono";
import { sql } from "drizzle-orm";
import { withBootstrapUserContext as _withBootstrapUserContext } from "@budget/platform";
import type { UserId } from "@budget/shared-kernel";

type BootstrapFn = typeof _withBootstrapUserContext;

/**
 * tenant-guard.ts — resolves X-Budget-ID header → tenantIds GUC array.
 *
 * PC-01: Relies on Plan 06's budget_members_self RLS policy on tenancy.budget_members,
 * which allows users to SELECT their own membership rows when app.current_user_id is set
 * (even before app.tenant_ids is set).
 *
 * PC-27: Uses withBootstrapUserContext (not raw pool connect) to avoid the
 * grep:no-pool-connect CI gate while still performing the chicken-and-egg bootstrap query.
 *
 * Pitfall 4: withBootstrapUserContext wraps SET LOCAL inside its own transaction.
 *
 * T-01-07-01: X-Budget-ID sent by web client; intersected
 * with actual tenancy.budget_members rows — client claim never trusted.
 *
 * D-10: Header renamed from X-Workspace-ID to X-Budget-ID in Plan 01-03.
 */
function buildTenantGuard(bootstrapFn: BootstrapFn): MiddlewareHandler {
  return async (c, next) => {
    const session = c.get("session");
    if (!session) {
      c.set("tenantIds", []);
      await next();
      return;
    }

    const userId = session.user.id as UserId;

    // The web client picks a budget from the URL (`/budgets/[id]/...`)
    // and sends it on every API call as `X-Budget-ID`. We MUST verify the
    // caller is a member of that budget before trusting it.
    //
    // If no header is present we leave tenantIds empty; downstream
    // requireBudget then returns 403 (or the route is auth-only and never
    // reads tenantIds). The legacy `active_workspace_ids` user-preference
    // path is intentionally NOT consulted any more -- budget context is
    // explicit-via-URL, never implicit-via-session.
    const requestedBudgetId =
      c.req.header("x-budget-id") ?? c.req.header("X-Budget-ID") ?? null;

    if (!requestedBudgetId) {
      c.set("tenantIds", []);
      await next();
      return;
    }

    const result = await bootstrapFn(userId, async (tx) => {
      const rows = await tx.execute(
        sql.raw(`
          SELECT bm.budget_id::text AS id
            FROM tenancy.budget_members bm
           WHERE bm.user_id = '${String(userId)}'
             AND bm.budget_id = '${requestedBudgetId.replace(/[^a-fA-F0-9-]/g, "")}'
           LIMIT 1
        `),
      );
      return rows.rows.length > 0 ? [requestedBudgetId] : [];
    });

    const ids = result.isOk() ? result.value : [];
    c.set("tenantIds", ids);

    await next();
  };
}

/** Default middleware using real withBootstrapUserContext. */
export const tenantGuard: MiddlewareHandler = buildTenantGuard(
  _withBootstrapUserContext,
);

/** Factory for testing — inject a mock bootstrapFn instead of mocking the module. */
export { buildTenantGuard };
