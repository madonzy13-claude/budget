/**
 * categories.ts — /categories route factory
 * BDGT-01..06: category CRUD + archive + rename.
 * T-2-05: RLS provides tenant isolation at DB layer.
 */
import { Hono } from "hono";
import type { BootedDeps } from "../boot";

export function createCategoriesRoute(deps: BootedDeps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = new Hono<{ Variables: Record<string, any> }>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function pickTenant(c: any): string {
    const ids = c.get("tenantIds") as string[] | undefined;
    return ids?.[0] ?? "";
  }

  async function getSchemas() {
    const { createCategorySchema } = await import(
      "@budget/budgeting/src/contracts/api"
    );
    return { createCategorySchema };
  }

  // POST /categories — create
  app.post("/", async (c) => {
    const { createCategorySchema } = await getSchemas();
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const parsed = createCategorySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation error", issues: parsed.error.issues }, 422);
    }

    const session = c.get("session");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;

    const r = await deps.budgeting.createCategory({
      ...parsed.data,
      tenantId,
      actorUserId: userId,
    });

    if (r.isErr()) return c.json({ error: r.error.message }, 422);
    return c.json(r.value, 201);
  });

  // GET /categories — list
  app.get("/", async (c) => {
    const tenantId = pickTenant(c);
    const includeArchived = c.req.query("includeArchived") === "true";

    const r = await deps.budgeting.listCategories({ tenantId, includeArchived });
    if (r.isErr()) return c.json({ error: r.error.message }, 500);
    return c.json({ categories: r.value });
  });

  // GET /categories/:id — find by id
  app.get("/:id", async (c) => {
    const tenantId = pickTenant(c);
    const { id } = c.req.param();

    const r = await deps.budgeting.findCategoryById({ tenantId, categoryId: id });
    if (r.isErr()) return c.json({ error: r.error.message }, 500);
    if (!r.value) return c.json({ error: "Not found" }, 404);
    return c.json(r.value);
  });

  // POST /categories/:id/archive — archive
  app.post("/:id/archive", async (c) => {
    const session = c.get("session");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;
    const { id: categoryId } = c.req.param();

    const r = await deps.budgeting.archiveCategory({
      tenantId,
      categoryId,
      actorUserId: userId,
    });

    if (r.isErr()) return c.json({ error: r.error.message }, 422);
    return c.json(r.value);
  });

  // PATCH /categories/:id — rename
  app.patch("/:id", async (c) => {
    const session = c.get("session");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;
    const { id: categoryId } = c.req.param();

    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.name !== "string") {
      return c.json({ error: "name is required" }, 422);
    }

    const r = await deps.budgeting.renameCategory({
      tenantId,
      categoryId,
      name: body.name,
      actorUserId: userId,
    });

    if (r.isErr()) return c.json({ error: r.error.message }, 422);
    return c.json(r.value);
  });

  return app;
}
