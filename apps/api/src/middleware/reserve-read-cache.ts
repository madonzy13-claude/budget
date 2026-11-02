import type { MiddlewareHandler } from "hono";

/**
 * 261102: a GET runs inside the budgeting reserve read cache, so the ~6 reserve
 * replays one Overview page load triggers share one. Anything else is a write:
 * it replays fresh and drops what was cached once it finishes.
 */
export const reserveReadCacheMiddleware =
  (cache: {
    readScope<T>(run: () => Promise<T>): Promise<T>;
    invalidate(): void;
  }): MiddlewareHandler =>
  async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD")
      return cache.readScope(next);
    try {
      await next();
    } finally {
      cache.invalidate();
    }
  };
