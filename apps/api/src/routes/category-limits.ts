/**
 * category-limits.ts — /categories/:id/limits route
 * SCD-2 effective-dated limits (BDGT-03..05, D-04-b,c).
 */
import { Hono } from "hono";
import type { BootedDeps } from "../boot";

export function createCategoryLimitsRoute(deps: BootedDeps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = new Hono<{ Variables: Record<string, any> }>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function pickTenant(c: any): string {
    const ids = c.get("tenantIds") as string[] | undefined;
    return ids?.[0] ?? "";
  }

  // POST /categories/:id/limits — set effective-dated limit
  app.post("/:id/limits", async (c) => {
    const { setLimitSchema } = await import("@budget/budgeting/src/contracts/api");
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const parsed = setLimitSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation error", issues: parsed.error.issues }, 422);
    }

    const session = c.get("session");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;
    const { id: categoryId } = c.req.param();

    const r = await deps.budgeting.setCategoryLimit({
      ...parsed.data,
      tenantId,
      categoryId,
      actorUserId: userId,
    });

    if (r.isErr()) return c.json({ error: r.error.message }, 422);
    return c.json(r.value, 201);
  });

  // GET /categories/:id/limits/effective?date=YYYY-MM-DD — point-in-time lookup
  app.get("/:id/limits/effective", async (c) => {
    const tenantId = pickTenant(c);
    const { id: categoryId } = c.req.param();
    const reportDate = c.req.query("date");

    const r = await deps.budgeting.getEffectiveLimit({
      tenantId,
      categoryId,
      reportDate,
    });

    if (r.isErr()) return c.json({ error: r.error.message }, 500);
    if (!r.value) return c.json({ error: "No limit found" }, 404);
    return c.json(r.value);
  });

  return app;
}
