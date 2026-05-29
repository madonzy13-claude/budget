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
      // Sanitize the requested id once — used both in SET LOCAL (which
      // takes literal text only) and in the membership predicate.
      const safeId = requestedBudgetId.replace(/[^a-fA-F0-9-]/g, "");

      // RLS gap: `budgets_select_open` requires id IN app.tenant_ids OR
      // owner_user_id = current_user_id. A SHARED-budget MEMBER (the
      // share-link recipient flow) satisfies neither in bootstrap
      // context — they have no tenant_ids set yet, and they're not the
      // owner. Without SET LOCAL the JOIN to `tenancy.budgets` returns
      // zero rows and tenant-guard hands back [], so /budgets/:id
      // returns 404 for the very member we just admitted via the
      // share-link.
      //
      // SET LOCAL the candidate id BEFORE the membership check. This is
      // safe: the membership predicate below still requires the user's
      // own row to exist in budget_members for THIS budget id, so a
      // user can't elevate access by inventing an X-Budget-ID — they'd
      // just get rows=0 and an empty tenantIds.
      await tx.execute(sql.raw(`SET LOCAL app.tenant_ids = '{${safeId}}'`));

      const rows = await tx.execute(
        sql.raw(`
          SELECT bm.budget_id::text AS id
            FROM tenancy.budget_members bm
            JOIN tenancy.budgets b ON b.id = bm.budget_id
           WHERE bm.user_id = '${String(userId)}'
             AND bm.budget_id = '${safeId}'
             AND b.archived_at IS NULL
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
