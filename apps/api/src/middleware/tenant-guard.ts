import type { MiddlewareHandler } from "hono";
import { sql } from "drizzle-orm";
import { withBootstrapUserContext } from "@budget/platform";
import type { UserId } from "@budget/shared-kernel";

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
export const tenantGuard: MiddlewareHandler = async (c, next) => {
  const session = c.get("session");
  if (!session) {
    c.set("tenantIds", []);
    await next();
    return;
  }

  const userId = session.user.id as UserId;

  // PC-27: Bootstrap intersection query — workspace_members_self policy permits SELECT
  // of own membership rows with only app.current_user_id set (no app.tenant_ids yet).
  // withBootstrapUserContext sets SET LOCAL app.current_user_id inside a transaction.
  const result = await withBootstrapUserContext(userId, async (tx) => {
    const rows = await tx.execute(
      sql.raw(`
        SELECT array_agg(wm.workspace_id::text) AS ids
          FROM identity.user_preferences up
          JOIN tenancy.workspace_members wm ON wm.user_id = up.user_id
         WHERE up.user_id = '${String(userId)}'
           AND wm.workspace_id = ANY(up.active_workspace_ids)
      `),
    );
    // Drizzle execute returns { rows: Array<Record<string, unknown>> }
    const firstRow = rows.rows[0];
    return (firstRow?.ids as string[] | null) ?? [];
  });

  const ids = result.isOk() ? result.value : [];
  c.set("tenantIds", ids);

  await next();
};
