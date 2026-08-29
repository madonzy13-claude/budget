/**
 * demo-guard.ts — blocks the shared demo account from breaking itself.
 *
 * The demo is ONE login handed to many prospects. Without this, the first
 * visitor to change the password locks out every visitor after them until the
 * next nightly refresh — and the refresh does not reset credentials, so in
 * practice, forever.
 *
 * This is NOT the isolation mechanism. Isolation is RLS + the demo user's
 * membership (see tests/tenant-leak/demo-tenant-cross-tenant.test.ts). This
 * guard only stops self-harm and outbound noise.
 *
 * It is a no-op for every other user, and a no-op entirely when the demo is
 * not configured — asserted by test, because a guard that over-matches would
 * break real accounts.
 */
import type { MiddlewareHandler } from "hono";
import { readDemoConfig } from "@budget/platform";
import type { BootedDeps } from "../boot";

/**
 * Paths the demo user may not reach. Suffix-matched against the request path so
 * the same list works whether Better Auth is mounted at /auth or elsewhere.
 */
const BLOCKED = [
  // Would lock every later visitor out of the shared login.
  "/change-password",
  "/change-email",
  "/update-user",
  "/delete-user",
  // Would mail an invitation out of the demo to a real address.
  "/members",
  "/share-links",
];

function isBlocked(path: string, method: string): boolean {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return false;
  }
  return BLOCKED.some((p) => path.endsWith(p) || path.includes(`${p}/`));
}

export const demoGuard =
  (deps: BootedDeps): MiddlewareHandler =>
  async (c, next) => {
    const cfg = readDemoConfig();
    // Unconfigured deployment: this middleware does not exist, behaviourally.
    if (!cfg) return next();

    if (!isBlocked(c.req.path, c.req.method)) return next();

    // /auth/* is mounted BEFORE authMiddleware, so on those paths there is no
    // session in context yet and the guard has to resolve one itself.
    let session = c.get("session");
    if (session === undefined) {
      session = await (deps.identity.auth as any).api
        .getSession({ headers: c.req.raw.headers })
        .catch(() => null);
    }

    const userId = (session as any)?.user?.id;
    if (userId !== cfg.demoUserId) return next();

    return c.json(
      {
        error: "demo_account_restricted",
        message:
          "This action is disabled on the demo account. Create your own account to try it.",
      },
      403,
    );
  };
