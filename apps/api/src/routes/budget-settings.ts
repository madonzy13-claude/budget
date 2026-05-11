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
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;

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
    return c.json(r.value);
  });

  return app;
}
