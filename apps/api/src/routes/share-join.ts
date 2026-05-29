/**
 * share-join.ts — Public + authenticated share-link join routes
 *
 * GET  /budgets/join/:token       — PUBLIC (no requireAuth, no requireWorkspace)
 *                                   Returns {budgetName, isExpired, isRevoked, isUsed}
 * POST /budgets/join/:token/accept — AUTHENTICATED (requireAuth only, no requireWorkspace)
 *                                   Calls Better Auth addMember; sets accepted_by + accepted_at
 *
 * CRITICAL ORDER (per RESEARCH §Pattern 5 + app.ts key_link):
 *   This route MUST be registered in app.ts BEFORE app.use("/budgets/*", requireAuth)
 *   so the GET sub-route can serve unauthenticated requests.
 *   The POST sub-route enforces auth internally via c.var.userId check.
 *
 * SHRD-01, SHRD-02, SHRD-03 (D-PH2-05, D-PH2-06)
 */
import { Hono } from "hono";
import { DrizzleBudgetShareLinkRepo } from "@budget/tenancy/src/adapters/persistence/budget-share-link-repo";
import { resolveShareLink } from "@budget/tenancy/src/application/resolve-share-link";
import { acceptShareLink } from "@budget/tenancy/src/application/accept-share-link";
import type { BootedDeps } from "../boot";

export function createShareJoinRoute(deps: BootedDeps | any) {
  const app = new Hono();
  const repo = new DrizzleBudgetShareLinkRepo();

  // Direct membership writes use the tenancy budgetRepo (same instance
  // that powers /budgets/:id and the settings members list). Avoiding
  // Better Auth's admin-gated `auth.api.addMember` here is intentional —
  // see the acceptShareLink service docstring.
  const serviceDeps = {
    budgetShareLinkRepo: repo,
    budgetRepo: deps.tenancy.workspaceRepo,
  };

  /**
   * GET /budgets/join/:token — PUBLIC
   * No auth required — recipient may not have an account yet.
   * Token IS the credential (T-02-05).
   */
  app.get("/:token", async (c) => {
    const token = c.req.param("token");

    try {
      const result = await resolveShareLink(
        { budgetShareLinkRepo: repo },
        token,
      );
      if (!result.found) {
        return c.json({ error: "NotFound" }, 404);
      }
      return c.json({
        budgetName: result.budgetName,
        isExpired: result.isExpired,
        isRevoked: result.isRevoked,
        isUsed: result.isUsed,
      });
    } catch (e: unknown) {
      const msg = (e as Error).message ?? "unknown";
      console.error("[share-join:resolve] error:", msg);
      throw e;
    }
  });

  /**
   * POST /budgets/join/:token/accept — AUTHENTICATED (no requireWorkspace)
   * Recipient may not have an active budget yet — no workspace context required.
   * Auth check is done inline (userId from session).
   */
  app.post("/:token/accept", async (c) => {
    const session = c.get("session") as { user: { id: string } } | null;
    const userId = session?.user?.id;
    if (!userId) {
      return c.json({ error: "Unauthenticated" }, 401);
    }

    const token = c.req.param("token");

    try {
      const result = await acceptShareLink(serviceDeps, token, userId);
      return c.json({ budgetId: result.budgetId }, 200);
    } catch (e: unknown) {
      const msg = (e as Error).message ?? "unknown";
      if (msg === "NotFound") return c.json({ error: "NotFound" }, 404);
      if (msg === "Revoked") return c.json({ error: "Revoked" }, 410);
      if (msg === "Expired") return c.json({ error: "Expired" }, 410);
      if (msg === "AlreadyUsed") return c.json({ error: "AlreadyUsed" }, 409);
      console.error("[share-join:accept] error:", msg);
      throw e;
    }
  });

  return app;
}
