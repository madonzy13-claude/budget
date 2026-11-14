import type { MiddlewareHandler } from "hono";
import type { BootedDeps } from "../boot";
import { internalRequests } from "../mcp/dispatch";

export const authMiddleware =
  (deps: BootedDeps): MiddlewareHandler =>
  async (c, next) => {
    // MCP in-process dispatch: identity was resolved from the bearer token.
    const w = internalRequests.get(c.req.raw);
    if (w) {
      c.set("session", { user: { id: w.userId, email: w.email, locale: w.locale } });
      return next();
    }
    const session = await (deps.identity.auth as any).api.getSession({
      headers: c.req.raw.headers,
    });
    c.set("session", session ?? null);
    await next();
  };
