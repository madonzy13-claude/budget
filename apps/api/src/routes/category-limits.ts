/**
 * category-limits.ts — /categories/:id/limits route
 * SCD-2 effective-dated limits (BDGT-03..05, D-04-b,c).
 */
import { Hono } from "hono";
import type { BootedDeps } from "../boot";
import { serverError } from "../middleware/server-error";
import { categoryCurrencyConverter } from "./convert-to-category-currency";

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

    // Phase 14: amounts sent in another currency (the Overview rebalance works
    // in the budget's) convert into the category's at today's rate.
    let amounts: Partial<typeof parsed.data> = {};
    if ((body as { amountsCurrency?: unknown }).amountsCurrency !== undefined) {
      const conv = await categoryCurrencyConverter(
        deps.budgeting as never,
        tenantId,
        categoryId,
        (body as { amountsCurrency?: unknown }).amountsCurrency,
      );
      if (!conv.ok) {
        return c.json({ error: conv.error }, conv.error === "not_found" ? 404 : 422);
      }
      const cv = (v: string | undefined) => (v === undefined ? undefined : conv.convert(v));
      amounts = {
        normalAmount: cv(parsed.data.normalAmount)!,
        cushionAmount: cv(parsed.data.cushionAmount)!,
        ...(parsed.data.needsAmount !== undefined ? { needsAmount: cv(parsed.data.needsAmount) } : {}),
        ...(parsed.data.wantsAmount !== undefined ? { wantsAmount: cv(parsed.data.wantsAmount) } : {}),
      };
      normalCurrency = conv.currency ?? normalCurrency;
      cushionCurrency = conv.currency ?? cushionCurrency;
    }

    const r = await deps.budgeting.setCategoryLimit({
      ...parsed.data,
      ...amounts,
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
