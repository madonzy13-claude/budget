import type { MiddlewareHandler } from "hono";

/**
 * require-auth.ts — gate that returns 401 when no session is resolved.
 *
 * Mount this AFTER `authMiddleware` (which only resolves the session into context)
 * and BEFORE any route that requires the caller to be signed in.
 */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const session = c.get("session");
  if (!session) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
};
