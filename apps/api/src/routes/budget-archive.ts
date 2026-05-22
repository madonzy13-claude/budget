/**
 * budget-archive.ts — /budgets/:id/archive + /budgets/:id/delete route factory
 *
 * Provides:
 *   POST /budgets/:id/archive  — owner-only soft-delete (sets archived_at); one-way in v1.1 (D-09, D-10)
 *   POST /budgets/:id/delete   — owner-only hard-delete, server-validates typed budget name (SETT-08)
 *
 * Security mitigations:
 *   T-06-04-01: owner-only gate (listMembers role lookup → 403 for non-owners)
 *   T-06-04-02: typed-name validated server-side → 422 name_mismatch; client disable is cosmetic
 *   T-06-04-04: Drizzle sql template bind params — no string interpolation (SQL injection)
 *   T-06-04-05: hard-delete relies on ON DELETE CASCADE FKs in schema
 *
 * MERGE-HAZARD: This file is intentionally separate from budgets.ts (Plan 06-02 owns that file).
 * Mounted under /budgets in app.ts alongside budgetMembersRoutesFactory, BEFORE budgetsRoutesFactory,
 * so /:id/archive and /:id/delete are matched before the generic /:id param handler.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { BootedDeps } from "../boot";

type ArchiveDeps = Pick<BootedDeps, "tenancy" | "identity">;

const deleteSchema = z.object({
  confirmName: z.string().min(1),
});

export function budgetArchiveRoutesFactory(deps: ArchiveDeps) {
  const r = new Hono();

  // POST /:id/archive — owner-only soft-delete (archived_at = now())
  r.post("/:id/archive", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.param("id");
    const tenantIds = c.get("tenantIds") as string[] | undefined;

    // Tenant gate — caller must be a member of this budget
    if (!tenantIds || !tenantIds.includes(budgetId)) {
      return c.json({ error: "not_found" }, 404);
    }

    // T-06-04-01: owner-only gate via listMembers (injected dep — testable without DB)
    let members: { userId: string; role: string }[];
    try {
      members = await deps.tenancy.workspaceRepo.listMembers(budgetId);
    } catch (e) {
      console.error("[archive] listMembers failed:", e);
      return c.json({ error: "internal" }, 500);
    }

    const callerEntry = members.find((m) => m.userId === session.user.id);
    if (!callerEntry) {
      return c.json({ error: "not_found" }, 404);
    }
    if (callerEntry.role !== "owner") {
      return c.json({ error: "forbidden" }, 403);
    }

    // Perform soft-delete
    const result = await deps.tenancy.workspaceRepo.archive(
      budgetId,
      session.user.id,
    );

    return c.json({ ok: true, archivedAt: result.archivedAt }, 200);
  });

  // POST /:id/delete — owner-only hard-delete, typed-name confirmation (T-06-04-02)
  r.post("/:id/delete", zValidator("json", deleteSchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.param("id");
    const tenantIds = c.get("tenantIds") as string[] | undefined;

    // Tenant gate
    if (!tenantIds || !tenantIds.includes(budgetId)) {
      return c.json({ error: "not_found" }, 404);
    }

    // T-06-04-01: owner-only gate via listMembers
    let members: { userId: string; role: string }[];
    try {
      members = await deps.tenancy.workspaceRepo.listMembers(budgetId);
    } catch (e) {
      console.error("[hard-delete] listMembers failed:", e);
      return c.json({ error: "internal" }, 500);
    }

    const callerEntry = members.find((m) => m.userId === session.user.id);
    if (!callerEntry) {
      return c.json({ error: "not_found" }, 404);
    }
    if (callerEntry.role !== "owner") {
      return c.json({ error: "forbidden" }, 403);
    }

    // Fetch budget name for typed-name server-side validation (T-06-04-02)
    let budgetName: string;
    try {
      const budget = await deps.tenancy.workspaceRepo.findById(budgetId);
      if (!budget) return c.json({ error: "not_found" }, 404);
      budgetName = budget.name;
    } catch (e) {
      console.error("[hard-delete] findById failed:", e);
      return c.json({ error: "internal" }, 500);
    }

    // Server-side typed-name check — client disable is cosmetic only
    const { confirmName } = c.req.valid("json");
    if (confirmName !== budgetName) {
      return c.json({ error: "name_mismatch" }, 422);
    }

    // Hard-delete (cascades via FK ON DELETE CASCADE)
    await deps.tenancy.workspaceRepo.hardDelete(budgetId, session.user.id);

    return c.json({ ok: true }, 200);
  });

  return r;
}

// Named alias referenced in plan 06-04 key_links
export { budgetArchiveRoutesFactory as createBudgetDangerZoneRoute };
