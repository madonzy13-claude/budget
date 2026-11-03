/**
 * category-limits.ts — /categories/:id/limits route
 * SCD-2 effective-dated limits (BDGT-03..05, D-04-b,c).
 */
import { Hono } from "hono";
import type { BootedDeps } from "../boot";
import { serverError } from "../middleware/server-error";

export function createCategoryLimitsRoute(deps: BootedDeps) {
  const app = new Hono<{ Variables: Record<string, any> }>();

  function pickTenant(c: any): string {
    const ids = c.get("tenantIds") as string[] | undefined;
    return ids?.[0] ?? "";
  }

  // POST /categories/:id/limits — set effective-dated limit
  app.post("/:id/limits", async (c) => {
    const { setLimitSchema } =
      await import("@budget/budgeting/src/contracts/api");
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const parsed = setLimitSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Validation error", issues: parsed.error.issues },
        422,
      );
    }

    const session = c.get("session");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;
    const { id: categoryId } = c.req.param();

    // Phase 14: a limit is in its CATEGORY's currency unless the caller names
    // one (the category itself defaults to the budget's currency at creation).
    let normalCurrency = parsed.data.normalCurrency;
    let cushionCurrency = parsed.data.cushionCurrency;
    if (!normalCurrency || !cushionCurrency) {
      const cat = await deps.budgeting.findCategoryById({ tenantId, categoryId });
      if (cat.isErr()) return serverError(c, "set_category_limit_failed", cat.error);
      if (!cat.value) return c.json({ error: "Not found" }, 404);
      normalCurrency = normalCurrency ?? cat.value.currency;
      cushionCurrency = cushionCurrency ?? cat.value.currency;
    }

    const r = await deps.budgeting.setCategoryLimit({
      ...parsed.data,
      normalCurrency,
      cushionCurrency,
      tenantId,
      categoryId,
      actorUserId: userId,
    });

    if (r.isErr()) return serverError(c, "set_category_limit_failed", r.error);
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

    if (r.isErr()) return serverError(c, "get_effective_limit_failed", r.error);
    if (!r.value) return c.json({ error: "No limit found" }, 404);
    return c.json(r.value);
  });

  return app;
}
