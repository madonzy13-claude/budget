/**
 * share-overrides.ts — /categories/:id/share-overrides route
 * BDGT-08: per-category contribution share overrides.
 * Sum-100 enforced at DB level by DEFERRABLE constraint trigger.
 */
import { Hono } from "hono";
import type { BootedDeps } from "../boot";

export function createShareOverridesRoute(deps: BootedDeps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = new Hono<{ Variables: Record<string, any> }>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function pickTenant(c: any): string {
    const ids = c.get("tenantIds") as string[] | undefined;
    return ids?.[0] ?? "";
  }

  // PUT /categories/:id/share-overrides — set overrides (replaces all)
  app.put("/:id/share-overrides", async (c) => {
    const { setShareOverridesSchema } = await import(
      "@budget/budgeting/src/contracts/api"
    );
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const parsed = setShareOverridesSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation error", issues: parsed.error.issues }, 422);
    }

    const session = c.get("session");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;
    const { id: categoryId } = c.req.param();

    const r = await deps.budgeting.setShareOverrides({
      ...parsed.data,
      tenantId,
      categoryId,
      actorUserId: userId,
    });

    if (r.isErr()) {
      const msg = r.error.message;
      // DB trigger fires → 422 for sum violation
      if (msg.includes("must sum to 100") || msg.includes("sum")) {
        return c.json({ error: "Share overrides must sum to 100%" }, 422);
      }
      return c.json({ error: msg }, 422);
    }
    return c.json({ overrides: r.value });
  });

  // GET /categories/:id/share-overrides — list
  app.get("/:id/share-overrides", async (c) => {
    const tenantId = pickTenant(c);
    const { id: categoryId } = c.req.param();

    const overrides = await deps.budgeting.listShareOverrides(tenantId, categoryId);
    return c.json({ overrides });
  });

  return app;
}
