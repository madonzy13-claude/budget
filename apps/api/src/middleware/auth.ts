import type { MiddlewareHandler } from "hono";
import type { BootedDeps } from "../boot";

export const authMiddleware =
  (deps: BootedDeps): MiddlewareHandler =>
  async (c, next) => {
    const session = await (deps.identity.auth as any).api.getSession({
      headers: c.req.raw.headers,
    });
    c.set("session", session ?? null);
    await next();
  };
