/**
 * investments.ts — /budgets/:budgetId/investments route factory (Phase 9).
 * Mirrors wallets.ts: zValidator on every state-changing endpoint; tenant from
 * pickTenant (never client-supplied — T-9-14); RLS is the second layer.
 */
import { Hono } from "hono";
import type { BootedDeps } from "../boot";
import { serverError } from "../middleware/server-error";

export function createInvestmentsRoute(deps: BootedDeps) {
  const app = new Hono<{ Variables: Record<string, any> }>();

  function pickTenant(c: any): string {
    const ids = c.get("tenantIds") as string[] | undefined;
    return ids?.[0] ?? "";
  }

  /** JSON-safe holding (bigint cents → string; Holding entity is not serializable). */
  function serializeHolding(h: any) {
    return {
      id: h.id,
      tenantId: h.tenantId,
      name: h.name,
      holdingType: h.holdingType,
      uiType: h.uiType ?? null,
      group: h.group,
      instrumentId: h.instrumentId,
      metal: h.metal ?? null,
      metalKind: h.metalKind ?? null,
      unitOfMeasure: h.unitOfMeasure ?? null,
      symbol: h.symbol ?? null,
      instrumentProvider: h.provider ?? null,
      buyPriceCents:
        h.buyPriceCents === null ? null : h.buyPriceCents.toString(),
      buyCurrency: h.buyCurrency,
      quantity: h.quantity,
      currentPriceCents:
        h.currentPriceCents === null ? null : h.currentPriceCents.toString(),
      currentPriceCurrency: h.currentPriceCurrency,
      depositRateBps: h.depositRateBps ?? null,
      depositStartDate: h.depositStartDate ?? null,
      depositEndDate: h.depositEndDate ?? null,
      depositCapFrequency: h.depositCapFrequency ?? null,
      sortOrder: h.sortOrder,
      archivedAt: h.archivedAt ? h.archivedAt.toISOString() : null,
      createdAt: h.createdAt ? h.createdAt.toISOString() : null,
      isCustom: typeof h.isCustom === "function" ? h.isCustom() : undefined,
    };
  }

  async function getSchemas() {
    return await import("@budget/investments/src/contracts/api");
  }

  // POST / — create holding
  app.post("/", async (c) => {
    const { createHoldingSchema } = await getSchemas();
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);
    const parsed = createHoldingSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Validation error", issues: parsed.error.issues },
        422,
      );
    }
    const session = c.get("session");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;
    const r = await deps.investments.createHolding({
      ...parsed.data,
      tenantId,
      budgetId: tenantId,
      actorUserId: userId,
    });
    if (r.isErr()) return c.json({ error: r.error.message }, 422);
    return c.json(serializeHolding(r.value), 201);
  });

  // GET / — enriched list (value / P-L % / weight %)
  app.get("/", async (c) => {
    const session = c.get("session");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;
    const budget = await deps.tenancy.workspaceRepo.findById(tenantId);
    const budgetCurrency = budget?.default_currency ?? "EUR";
    const r = await deps.investments.listHoldings({
      tenantId,
      budgetId: tenantId,
      actorUserId: userId,
      budgetCurrency,
    });
    if (r.isErr()) return serverError(c, "list_holdings_failed", r.error);
    return c.json(r.value);
  });

  // GET /search?q=&type= — local trigram (min 2 chars); never a price provider.
  // `type` is an asset_class filter (the type-filtered Asset autocomplete, 9.1).
  app.get("/search", async (c) => {
    const r = await deps.investments.searchInstruments(
      c.req.query("q") ?? "",
      c.req.query("type") ?? null,
    );
    if (r.isErr()) return serverError(c, "search_failed", r.error);
    return c.json({ results: r.value });
  });

  // POST /price/:instrumentId — rate-limited on-add instant fetch (INV-14)
  app.post("/price/:instrumentId", async (c) => {
    const session = c.get("session");
    const userId = (c.get("userId") as string) ?? session?.user?.id;
    const { instrumentId } = c.req.param();
    // Optional target currency (metals: convert the USD spot to the user's currency).
    const body = (await c.req.json().catch(() => ({}))) as {
      currency?: string;
    };
    const r = await deps.investments.fetchInstrumentPrice({
      instrumentId,
      userId,
      targetCurrency:
        typeof body.currency === "string" ? body.currency : undefined,
    });
    if (r.isErr()) {
      const msg = r.error.message;
      if (msg === "rate_limited") return c.json({ error: "rate_limited" }, 429);
      if (msg === "not_found") return c.json({ error: "not_found" }, 404);
      // Manual-priced instrument: not an error — the form enters the price itself.
      if (msg === "manual_pricing")
        return c.json({ error: "manual_pricing", manual: true }, 422);
      // provider failure / no price → the add is BLOCKED (A2)
      return c.json({ error: "price_unavailable" }, 422);
    }
    return c.json(r.value);
  });

  // POST /reorder — section reorder with cross-tenant guard (T-9-15)
  app.post("/reorder", async (c) => {
    const { reorderHoldingsSchema } = await getSchemas();
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);
    const parsed = reorderHoldingsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: parsed.error.issues[0]?.message ?? "validation_error",
          issues: parsed.error.issues,
        },
        422,
      );
    }
    const r = await deps.investments.reorderHoldings({
      tenantId,
      budgetId: tenantId,
      actorUserId: userId,
      orderedIds: parsed.data.orderedIds,
    });
    if (r.isErr()) return c.json({ error: r.error.message }, 422);
    return c.json(r.value, 200);
  });

  // PATCH /:id — partial update
  app.patch("/:id", async (c) => {
    const { updateHoldingSchema } = await getSchemas();
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;
    const { id: holdingId } = c.req.param();
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);
    const parsed = updateHoldingSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: parsed.error.issues[0]?.message ?? "validation_error",
          issues: parsed.error.issues,
        },
        422,
      );
    }
    const r = await deps.investments.updateHolding({
      ...parsed.data,
      tenantId,
      holdingId,
      actorUserId: userId,
    });
    if (r.isErr()) {
      const msg = r.error.message;
      if (msg === "not_found") return c.json({ error: "not_found" }, 404);
      return c.json({ error: msg }, 422);
    }
    return c.json(serializeHolding(r.value), 200);
  });

  // POST /:id/archive
  app.post("/:id/archive", async (c) => {
    const session = c.get("session");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;
    const { id: holdingId } = c.req.param();
    const r = await deps.investments.archiveHolding({
      tenantId,
      holdingId,
      actorUserId: userId,
    });
    if (r.isErr()) return c.json({ error: r.error.message }, 422);
    return c.json(r.value);
  });

  return app;
}
