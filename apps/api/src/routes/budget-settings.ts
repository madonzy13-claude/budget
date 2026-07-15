/**
 * budget-settings.ts — /budget-settings route
 * Budget mode toggle (D-04-e): NORMAL|CUSHION SCD-2 history.
 */
import { Hono } from "hono";
import type { BootedDeps } from "../boot";

export function createBudgetSettingsRoute(deps: BootedDeps) {
  const app = new Hono<{ Variables: Record<string, any> }>();

  function pickTenant(c: any): string {
    const ids = c.get("tenantIds") as string[] | undefined;
    return ids?.[0] ?? "";
  }

  // POST /budget-settings/budget-mode — set budget mode
  app.post("/budget-mode", async (c) => {
    const { setBudgetModeSchema } =
      await import("@budget/budgeting/src/contracts/api");
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const parsed = setBudgetModeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Validation error", issues: parsed.error.issues },
        422,
      );
    }

    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;

    // SEC: owner-only. Budget mode is a settings-level change; its twin entrance
    // (budget-identity PATCH cushion_mode_enabled → same toggleBudgetMode
    // service) is owner-gated, so this route must be too. pickTenant is the
    // membership-verified tenantIds[0], so the caller is a member — we only need
    // to confirm they are an OWNER.
    let members: { userId: string; role: string }[];
    try {
      members = await deps.tenancy.workspaceRepo.listMembers(tenantId);
    } catch (e) {
      console.error("[budget-mode] listMembers failed:", e);
      return c.json({ error: "internal" }, 500);
    }
    const caller = members.find((m) => m.userId === userId);
    if (!caller) return c.json({ error: "not_found" }, 404);
    if (caller.role !== "owner") return c.json({ error: "forbidden" }, 403);

    const r = await deps.budgeting.toggleBudgetMode({
      tenantId,
      workspaceId: tenantId, // budget = tenant in phase 2
      mode: parsed.data.mode,
      ...(parsed.data.effectiveFrom !== undefined
        ? { effectiveFrom: parsed.data.effectiveFrom }
        : {}),
      actorUserId: userId,
    });

    if (r.isErr()) return c.json({ error: r.error.message }, 422);
    // r36: switching cushion mode flips whether cushion wallets count toward the
    // income-vs-planned "available" total → recompute the task. Own-tx, never throws.
    await deps.budgeting.recomputeIncomeUnderPlannedRunner({
      tenantId,
      budgetId: tenantId,
    });
    return c.json(r.value);
  });

  return app;
}
