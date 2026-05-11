/**
 * categories.ts — /categories route factory
 * BDGT-01..06: category CRUD + archive + rename.
 * T-2-05: RLS provides tenant isolation at DB layer.
 */
import { Hono } from "hono";
import type { BootedDeps } from "../boot";
import { serverError } from "../middleware/server-error";

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

    // Scope is inherited from the active workspace's kind so the user never
    // has to pick PERSONAL vs SHARED — it's already implied by the workspace
    // type they're inside (PRIVATE workspace → PERSONAL category, SHARED → SHARED).
    // Resolved via listForUser (app-context, RLS-aware) since findById uses the
    // worker pool which doesn't always see the row.
    let scope = parsed.data.scope;
    if (!scope) {
      try {
        const memberships = await deps.tenancy.workspaceRepo.listForUser(
          session?.user?.id ?? "",
        );
        const ws = memberships.find((m) => m.id === tenantId);
        scope = ws?.kind === "SHARED" ? "SHARED" : "PERSONAL";
      } catch {
        scope = "PERSONAL";
      }
    }

    const r = await deps.budgeting.createCategory({
      ...parsed.data,
      scope,
      tenantId,
      actorUserId: userId,
    });

    if (r.isErr()) {
      // Postgres 23505 on the partial unique index categories_unique_name_per_tenant.
      // Drizzle wraps the PG error; the underlying node-postgres error keeps `code`
      // and `constraint` on the cause (or sometimes the top-level error itself).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errAny = r.error as any;
      const code = errAny?.cause?.code ?? errAny?.code;
      const constraint = errAny?.cause?.constraint ?? errAny?.constraint;
      if (code === "23505" || constraint === "categories_unique_name_per_tenant") {
        return c.json({ error: "category_name_taken" }, 409);
      }
      // Sanitize any other internal failure — never leak raw SQL/Drizzle errors.
      return serverError(c, "create_category_failed", r.error);
    }
    return c.json(r.value, 201);
  });

  // GET /categories — list
  app.get("/", async (c) => {
    const tenantId = pickTenant(c);
    const includeArchived = c.req.query("includeArchived") === "true";

    const r = await deps.budgeting.listCategories({ tenantId, includeArchived });
    if (r.isErr()) return serverError(c, "list_categories_failed", r.error);
    return c.json({ categories: r.value });
  });

  // GET /categories/:id — find by id
  app.get("/:id", async (c) => {
    const tenantId = pickTenant(c);
    const { id } = c.req.param();

    const r = await deps.budgeting.findCategoryById({ tenantId, categoryId: id });
    if (r.isErr()) return serverError(c, "find_category_failed", r.error);
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
