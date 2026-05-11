import type { MiddlewareHandler } from "hono";
import { sql } from "drizzle-orm";
import { withBootstrapUserContext as _withBootstrapUserContext } from "@budget/platform";
import type { UserId } from "@budget/shared-kernel";

type BootstrapFn = typeof _withBootstrapUserContext;

/**
 * tenant-guard.ts — resolves active_workspace_ids → tenantIds GUC array.
 *
 * PC-01: Relies on Plan 06's workspace_members_self RLS policy on tenancy.workspace_members,
 * which allows users to SELECT their own membership rows when app.current_user_id is set
 * (even before app.tenant_ids is set).
 *
 * PC-27: Uses withBootstrapUserContext (not raw pool connect) to avoid the
 * grep:no-pool-connect CI gate while still performing the chicken-and-egg bootstrap query.
 *
 * Pitfall 4: withBootstrapUserContext wraps SET LOCAL inside its own transaction.
 *
 * T-01-07-01: active_workspace_ids read from server-side user_preferences; intersected
 * with actual tenancy.workspace_members rows — client claim never trusted.
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

    // The web client picks a workspace from the URL (`/workspaces/[wsId]/…`)
    // and sends it on every API call as `X-Workspace-ID`. We MUST verify the
    // caller is a member of that workspace before trusting it.
    //
    // If no header is present we leave tenantIds empty; downstream
    // requireWorkspace then returns 403 (or the route is auth-only and never
    // reads tenantIds). The legacy `active_workspace_ids` user-preference
    // path is intentionally NOT consulted any more — workspace context is
    // explicit-via-URL, never implicit-via-session.
    const requestedWsId =
      c.req.header("x-workspace-id") ??
      c.req.header("X-Workspace-ID") ??
      null;

    if (!requestedWsId) {
      c.set("tenantIds", []);
      await next();
      return;
    }

    const result = await bootstrapFn(userId, async (tx) => {
      const rows = await tx.execute(
        sql.raw(`
          SELECT wm.workspace_id::text AS id
            FROM tenancy.workspace_members wm
           WHERE wm.user_id = '${String(userId)}'
             AND wm.workspace_id = '${requestedWsId.replace(/[^a-fA-F0-9-]/g, "")}'
           LIMIT 1
        `),
      );
      return rows.rows.length > 0 ? [requestedWsId] : [];
    });

    const ids = result.isOk() ? result.value : [];
    c.set("tenantIds", ids);

    await next();
  };
}

/** Default middleware using real withBootstrapUserContext. */
export const tenantGuard: MiddlewareHandler = buildTenantGuard(_withBootstrapUserContext);

/** Factory for testing — inject a mock bootstrapFn instead of mocking the module. */
export { buildTenantGuard };
