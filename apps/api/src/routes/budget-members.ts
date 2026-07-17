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

    // Task 5 fix: fold the departing member's ownership share into the
    // single canonical owner BEFORE removing them — the member row must
    // still exist to read its current share. leaveAsMember already folds
    // on self-leave; this route is the other removal surface and previously
    // skipped the fold entirely, permanently leaving Σ share < 100.
    await deps.tenancy.workspaceRepo.foldShareIntoOwner(budgetId, memberId);

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

    // If we just removed an owner, make sure budgets.owner_user_id still points to
    // a current owner (account-deletion keys on it — see below).
    await reconcileOwnerUserId(deps, budgetId, session.user.id);

    return c.json({ ok: true }, 200);
  });

  // POST /:id/members/:memberId/role — owner-only role change (promote a member
  // to owner, or demote an owner to member). Any owner may change any member's
  // role, including their own; the LAST owner is protected so the budget always
  // keeps ≥1 owner (mirrors the revoke last-owner guard).
  r.post("/:id/members/:memberId/role", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.param("id");
    const memberId = c.req.param("memberId");
    const tenantIds = c.get("tenantIds") as string[] | undefined;

    if (!tenantIds || !tenantIds.includes(budgetId)) {
      return c.json({ error: "not_found" }, 404);
    }

    let body: { role?: string };
    try {
      body = (await c.req.json()) as { role?: string };
    } catch {
      body = {};
    }
    const role = body.role;
    if (role !== "owner" && role !== "member") {
      return c.json({ error: "invalid_role" }, 400);
    }

    let members: { userId: string; role: string }[];
    try {
      members = await deps.tenancy.workspaceRepo.listMembers(budgetId);
    } catch (e) {
      console.error("[member-role] listMembers failed:", e);
      return c.json({ error: "internal" }, 500);
    }

    // Owner-only gate.
    const callerEntry = members.find((m) => m.userId === session.user.id);
    if (!callerEntry) return c.json({ error: "Member not found" }, 404);
    if (callerEntry.role !== "owner") {
      return c.json({ error: "forbidden" }, 403);
    }

    const targetEntry = members.find((m) => m.userId === memberId);
    if (!targetEntry) return c.json({ error: "member_not_found" }, 404);
    // No-op if the role is already what's requested.
    if (targetEntry.role === role) return c.json({ ok: true }, 200);

    // Demoting an owner: never leave the budget with zero owners.
    if (role === "member" && targetEntry.role === "owner") {
      const ownerCount = members.filter((m) => m.role === "owner").length;
      if (ownerCount <= 1) return c.json({ error: "last_owner" }, 409);
    }

    // Update the role column directly. Better Auth's updateMemberRole keys on the
    // MEMBER ROW id (not userId) and 404s here; the org plugin only READS this
    // column, so a direct write is correct and simpler.
    try {
      await deps.tenancy.workspaceRepo.setMemberRole(
        budgetId,
        memberId,
        role,
        session.user.id,
      );
    } catch (e: unknown) {
      const msg = (e as Error).message ?? "unknown";
      console.error("[member-role] setMemberRole failed:", msg);
      throw e;
    }

    // Keep budgets.owner_user_id pointing at a real owner so account deletion
    // (which blocks a user who solely owns a shared budget) doesn't wrongly block
    // a demoted creator while other owners remain.
    await reconcileOwnerUserId(deps, budgetId, session.user.id);

    return c.json({ ok: true }, 200);
  });

  return r;
}

/**
 * Best-effort: if budgets.owner_user_id no longer names a current owner (the
 * creator got demoted/removed while other owners remain), repoint it to an
 * existing owner. The legacy single-column owner_user_id gates account deletion
 * (identity.purgeUserData), so it must track the multi-owner reality. No-ops if
 * the repo doesn't expose the helper (older wiring / unit tests that don't mock it).
 */
async function reconcileOwnerUserId(
  deps: MembersDeps,
  budgetId: string,
  actorUserId: string,
): Promise<void> {
  const repo = deps.tenancy.workspaceRepo as {
    reconcileOwnerUserId?: (id: string, actorUserId: string) => Promise<void>;
  };
  if (typeof repo.reconcileOwnerUserId !== "function") return;
  try {
    await repo.reconcileOwnerUserId(budgetId, actorUserId);
  } catch (e) {
    console.error("[member-role] reconcileOwnerUserId failed:", e);
  }
}

// Named alias referenced in plan 06-03 key_links
export { budgetMembersRoutesFactory as createBudgetMembersRoute };
