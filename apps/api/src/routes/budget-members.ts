/**
 * budget-members.ts — /budgets/:id/members route factory
 *
 * Provides:
 *   GET  /budgets/:id/members                      — list members with roles (SETT-05)
 *   POST /budgets/:id/members/:memberId/revoke     — owner-only member removal (SETT-07)
 *
 * Security mitigations:
 *   T-06-03-01: owner-only gate (listMembers role lookup → 403 for non-owner callers)
 *   T-06-03-02: last-owner guard → 409 (no budget orphaning)
 *   T-06-03-03: tenant gate (tenantIds.includes → 404, no existence leak)
 */
import { Hono } from "hono";
import type { BootedDeps } from "../boot";

type MembersDeps = Pick<BootedDeps, "tenancy" | "identity">;

export function budgetMembersRoutesFactory(deps: MembersDeps) {
  const r = new Hono();

  // GET /:id/members — list all members for a budget the caller belongs to
  r.get("/:id/members", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.param("id");
    const tenantIds = c.get("tenantIds") as string[] | undefined;

    // T-06-03-03: tenant gate — caller must be a member of this budget
    if (!tenantIds || !tenantIds.includes(budgetId)) {
      return c.json({ error: "not_found" }, 404);
    }

    const members = await deps.tenancy.workspaceRepo.listMembers(budgetId);
    return c.json({ members }, 200);
  });

  // POST /:id/members/:memberId/revoke — owner-only member removal
  r.post("/:id/members/:memberId/revoke", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.param("id");
    const memberId = c.req.param("memberId");
    const tenantIds = c.get("tenantIds") as string[] | undefined;

    // T-06-03-03: tenant gate
    if (!tenantIds || !tenantIds.includes(budgetId)) {
      return c.json({ error: "not_found" }, 404);
    }

    // T-06-03-01 + T-06-03-02: load member list to check caller role and last-owner guard.
    // Using listMembers (injected dep) rather than withBootstrapUserContext so this
    // handler is testable without a real DB connection.
    let members: { userId: string; role: string }[];
    try {
      members = await deps.tenancy.workspaceRepo.listMembers(budgetId);
    } catch (e) {
      console.error("[revoke-member] listMembers failed:", e);
      return c.json({ error: "internal" }, 500);
    }

    // T-06-03-01: owner-only gate — caller must be an owner
    const callerEntry = members.find((m) => m.userId === session.user.id);
    if (!callerEntry) {
      return c.json({ error: "Member not found" }, 404);
    }
    if (callerEntry.role !== "owner") {
      return c.json({ error: "forbidden" }, 403);
    }

    // T-06-03-02: last-owner guard — block if this would orphan the budget
    const targetEntry = members.find((m) => m.userId === memberId);
    if (targetEntry?.role === "owner") {
      const ownerCount = members.filter((m) => m.role === "owner").length;
      if (ownerCount <= 1) {
        return c.json({ error: "last_owner" }, 409);
      }
    }

    // Remove the member via Better Auth org plugin
    const auth = deps.identity.auth as any;

    try {
      await auth.api.removeMember({
        body: { organizationId: budgetId, memberIdOrEmail: memberId },
        headers: c.req.raw.headers,
      });
    } catch (e: unknown) {
      const msg = (e as Error).message ?? "unknown";
      console.error("[revoke-member] removeMember failed:", msg);
      throw e;
    }

    return c.json({ ok: true }, 200);
  });

  return r;
}

// Named alias referenced in plan 06-03 key_links
export { budgetMembersRoutesFactory as createBudgetMembersRoute };
