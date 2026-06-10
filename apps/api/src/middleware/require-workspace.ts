import type { MiddlewareHandler } from "hono";

/**
 * require-workspace.ts — gate that returns 403 when the caller has no active
 * workspace bound. Mount AFTER `tenantGuard` (which resolves tenantIds) on any
 * route whose handler reads `tenantIds` to compose a tenant-scoped query — this
 * prevents `tenantId === ""` from reaching Drizzle and producing a 500 with a
 * raw SQL error.
 */
export const requireWorkspace: MiddlewareHandler = async (c, next) => {
  const ids = c.get("tenantIds") as string[] | undefined;
  if (!ids || ids.length === 0 || !ids[0]) {
    return c.json({ error: "no_active_workspace" }, 403);
  }
  await next();
};
