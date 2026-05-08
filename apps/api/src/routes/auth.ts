import { Hono } from "hono";
import type { BootedDeps } from "../boot";

/**
 * authRoutes — mounts Better Auth handler at /auth/*.
 * All auth flows (sign-up, sign-in, sign-out, verify-email, reset-password) are
 * handled by Better Auth itself via the pass-through handler.
 */
export function authRoutes(deps: BootedDeps) {
  const r = new Hono();
  r.all("/*", async (c) => (deps.identity.auth as any).handler(c.req.raw));
  return r;
}
