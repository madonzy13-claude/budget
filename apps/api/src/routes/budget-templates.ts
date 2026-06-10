/**
 * budget-templates.ts — /budget-templates route
 * BDGT-07: template CRUD + apply to target month.
 */
import { Hono } from "hono";
import type { BootedDeps } from "../boot";

export function createBudgetTemplatesRoute(deps: BootedDeps) {
  const app = new Hono<{ Variables: Record<string, any> }>();

  function pickTenant(c: any): string {
    const ids = c.get("tenantIds") as string[] | undefined;
    return ids?.[0] ?? "";
  }

  // POST /budget-templates — create
  app.post("/", async (c) => {
    const { createTemplateSchema } =
      await import("@budget/budgeting/src/contracts/api");
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Validation error", issues: parsed.error.issues },
        422,
      );
    }

    const session = c.get("session");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;

    const { DrizzleBudgetTemplateRepo } =
      await import("@budget/budgeting/src/adapters/persistence/budget-template-repo");
    const repo = new DrizzleBudgetTemplateRepo();
    const result = await repo.createTemplate({
      tenantId,
      name: parsed.data.name,
      actorUserId: userId,
      items: parsed.data.items,
    });

    if (result.isErr()) return c.json({ error: result.error.message }, 422);
    return c.json(result.value, 201);
  });

  // GET /budget-templates — list
  app.get("/", async (c) => {
    const tenantId = pickTenant(c);

    const { DrizzleBudgetTemplateRepo } =
      await import("@budget/budgeting/src/adapters/persistence/budget-template-repo");
    const repo = new DrizzleBudgetTemplateRepo();
    const result = await repo.listTemplates(tenantId);

    if (result.isErr()) return c.json({ error: result.error.message }, 500);
    return c.json({ templates: result.value });
  });

  // POST /budget-templates/:id/apply — apply to target month
  app.post("/:id/apply", async (c) => {
    const { applyTemplateSchema } =
      await import("@budget/budgeting/src/contracts/api");
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const parsed = applyTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Validation error", issues: parsed.error.issues },
        422,
      );
    }

    const session = c.get("session");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;
    const { id: templateId } = c.req.param();

    const r = await deps.budgeting.applyBudgetTemplate({
      ...parsed.data,
      tenantId,
      templateId,
      actorUserId: userId,
    });

    if (r.isErr()) return c.json({ error: r.error.message }, 422);
    return c.json({ ok: true });
  });

  return app;
}
