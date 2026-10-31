/**
 * investments.ts — /budgets/:budgetId/investments route factory (Phase 9).
 * Mirrors wallets.ts: zValidator on every state-changing endpoint; tenant from
 * pickTenant (never client-supplied — T-9-14); RLS is the second layer.
 */
import { Hono, type Context } from "hono";
import { UserId } from "@budget/shared-kernel";
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
      icon: h.icon ?? null,
      color: h.color ?? null,
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
    const budget = await deps.tenancy.workspaceRepo.findById(tenantId);
    const r = await deps.investments.createHolding({
      ...parsed.data,
      tenantId,
      budgetId: tenantId,
      actorUserId: userId,
      budgetCurrency: budget?.default_currency ?? "EUR",
    });
    if (r.isErr()) return c.json({ error: r.error.message }, 422);
    return c.json(serializeHolding(r.value.holding), 201);
  });

  // ── 13.1: shared error mapping + id validation ─────────────────────────
  const CONFLICT = new Set(["not_newest", "linked_not_newest", "stale"]);
  const fail = (
    c: Context,
    e: Error & { currency?: string; date?: string },
    known: Set<string>,
    code: string,
  ) => {
    if (e.message === "not_found") return c.json({ error: "not_found" }, 404);
    if (e.message === "fx_unavailable")
      return c.json(
        { error: "fx_unavailable", currency: e.currency, date: e.date },
        422,
      );
    if (CONFLICT.has(e.message)) return c.json({ error: e.message }, 409);
    if (known.has(e.message)) return c.json({ error: e.message }, 422);
    // Backstop: a malformed number reaching BigInt() (WR-01).
    if (e instanceof SyntaxError)
      return c.json({ error: "invalid_cents" }, 422);
    return serverError(c, code, e);
  };
  const who = (c: Context) => {
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? c.get("session")?.user?.id;
    return { tenantId, budgetId: tenantId, actorUserId: userId };
  };
  /** WR-02: a non-uuid id never reaches Postgres (would be a 500). */
  const badId = async (id: string) =>
    !(await getSchemas()).uuidParam.safeParse(id).success;
  const assetErrors = async () =>
    new Set<string>((await getSchemas()).INVESTMENT_ERRORS[422]);
  const viewerTz = async (userId: string) =>
    (await deps.identity.userRepo.findById(UserId(userId)))?.timezone ?? "UTC";
  const invalid = (c: Context, issues: { message: string }[]) =>
    c.json({ error: issues[0]?.message ?? "validation_error", issues }, 422);

  // GET /pl?currency=USD&ids=a,b — R6 (user): a group's or an asset's P/L in
  // another currency, every entry at its own date's rate. Before /:id routes.
  app.get("/pl", async (c) => {
    if (!c.get("session")) return c.json({ error: "unauthorized" }, 401);
    const currency = (c.req.query("currency") ?? "").toUpperCase();
    const ids = (c.req.query("ids") ?? "").split(",").filter(Boolean);
    const { uuidParam } = await getSchemas();
    if (
      !/^[A-Z]{3}$/.test(currency) ||
      ids.length === 0 ||
      ids.length > 200 ||
      ids.some((id) => !uuidParam.safeParse(id).success)
    )
      return c.json({ error: "validation_error" }, 422);
    const w = who(c);
    const budget = await deps.tenancy.workspaceRepo.findById(w.tenantId);
    const r = await deps.investments.currencyPL({
      ...w,
      budgetCurrency: budget?.default_currency ?? "EUR",
      currency,
      ids,
    });
    if (r.isErr()) {
      if (
        r.error.name === "NoFxRateAvailable" ||
        /fx|rate/i.test(r.error.message)
      )
        return c.json({ error: "fx_unavailable" }, 422);
      return serverError(c, "currency_pl_failed", r.error);
    }
    return c.json(r.value);
  });

  // GET /names?type= — autocomplete over a type's assets, hidden included
  // (D-02). Registered before every /:id route so "names" is never an id.
  app.get("/names", async (c) => {
    const { assetNamesQuerySchema } = await getSchemas();
    if (!c.get("session")) return c.json({ error: "unauthorized" }, 401);
    const parsed = assetNamesQuerySchema.safeParse({
      type: c.req.query("type"),
    });
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const w = who(c);
    const r = await deps.investments.listAssetNames({
      ...w,
      uiType: parsed.data.type,
    });
    if (r.isErr()) return serverError(c, "asset_names_failed", r.error);
    return c.json({ names: r.value });
  });

  // POST /:id/buy — Swap → Buy (D-08)
  app.post("/:id/buy", async (c) => {
    const { buyAssetSchema } = await getSchemas();
    if (!c.get("session")) return c.json({ error: "unauthorized" }, 401);
    const id = c.req.param("id");
    if (await badId(id)) return c.json({ error: "not_found" }, 404);
    const body = await c.req.json().catch(() => null);
    const parsed = buyAssetSchema.safeParse(body);
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const w = who(c);
    const budget = await deps.tenancy.workspaceRepo.findById(w.tenantId);
    const r = await deps.investments.buyIntoAsset({
      ...parsed.data,
      ...w,
      budgetCurrency: budget?.default_currency ?? "EUR",
      holdingId: id,
    });
    if (r.isErr()) return fail(c, r.error, await assetErrors(), "buy_failed");
    return c.json(r.value, 201);
  });

  // GET / — enriched list (value / P-L % / weight %)
  app.get("/", async (c) => {
    const session = c.get("session");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;
    const budget = await deps.tenancy.workspaceRepo.findById(tenantId);
    const budgetCurrency = budget?.default_currency ?? "EUR";
    // Viewer's timezone so a deposit's accrual rolls at their local midnight
    // (not UTC) — matches the app's today/current-month convention.
    const timezone =
      (await deps.identity.userRepo.findById(UserId(userId)))?.timezone ??
      "UTC";
    const r = await deps.investments.listHoldings({
      tenantId,
      budgetId: tenantId,
      actorUserId: userId,
      budgetCurrency,
      timezone,
      hidden: c.req.query("hidden") === "1",
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

  // PATCH /:id — asset Edit (D-06): label, display currency, hand value or
  // price. Strict body: quantity / cost / type are ledger-owned (CR-01).
  app.patch("/:id", async (c) => {
    const { editAssetSchema } = await getSchemas();
    if (!c.get("session")) return c.json({ error: "unauthorized" }, 401);
    const id = c.req.param("id");
    if (await badId(id)) return c.json({ error: "not_found" }, 404);
    const body = await c.req.json().catch(() => null);
    const parsed = editAssetSchema.safeParse(body);
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const w = who(c);
    const budget = await deps.tenancy.workspaceRepo.findById(w.tenantId);
    const r = await deps.investments.editAsset({
      ...parsed.data,
      ...w,
      budgetCurrency: budget?.default_currency ?? "EUR",
      holdingId: id,
      timezone: await viewerTz(w.actorUserId),
    });
    if (r.isErr())
      return fail(c, r.error, await assetErrors(), "edit_asset_failed");
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

  // POST /:id/restore — round 5: an archived asset comes back by id.
  app.post("/:id/restore", async (c) => {
    const session = c.get("session");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;
    const { id: holdingId } = c.req.param();
    const r = await deps.investments.restoreHolding({
      tenantId,
      holdingId,
      actorUserId: userId,
    });
    if (r.isErr()) return c.json({ error: r.error.message }, 422);
    return c.json(r.value);
  });

  // D-37: a wallet balance change moves the same tasks a manual edit does.
  // Best-effort after commit (own tx); the hourly sweep is the backstop.
  const recomputeWalletTasks = async (
    w: ReturnType<typeof who>,
    walletType: string | null,
  ) => {
    try {
      if (walletType === "RESERVE")
        await deps.budgeting.recomputeReserveTopup(w);
      else if (walletType === "CUSHION")
        await deps.budgeting.recomputeCushionTaskRunner(w);
    } catch (e) {
      console.warn(
        "[investments] wallet task recompute failed",
        (e as Error).name,
      );
    }
  };

  // GET /:id/entries — the asset's L3 ledger (D-12..D-19).
  app.get("/:id/entries", async (c) => {
    if (!c.get("session")) return c.json({ error: "unauthorized" }, 401);
    const id = c.req.param("id");
    if (await badId(id)) return c.json({ error: "not_found" }, 404);
    const w = who(c);
    const budget = await deps.tenancy.workspaceRepo.findById(w.tenantId);
    const r = await deps.investments.listEntries({
      ...w,
      budgetCurrency: budget?.default_currency ?? "EUR",
      holdingId: id,
      timezone: await viewerTz(w.actorUserId),
    });
    if (r.isErr()) return fail(c, r.error, new Set(), "list_entries_failed");
    return c.json({ entries: r.value });
  });

  // DELETE /entries/:entryId — newest-only delete (D-14, D-16, D-17, D-21).
  app.delete("/entries/:entryId", async (c) => {
    if (!c.get("session")) return c.json({ error: "unauthorized" }, 401);
    const entryId = c.req.param("entryId");
    if (await badId(entryId)) return c.json({ error: "not_found" }, 404);
    const w = who(c);
    const r = await deps.investments.deleteEntry({ ...w, entryId });
    if (r.isErr())
      return fail(c, r.error, await assetErrors(), "delete_entry_failed");
    await recomputeWalletTasks(w, r.value.walletType);
    return c.json({
      wipedHoldingId: r.value.wipedHoldingId,
      walletId: r.value.walletId,
    });
  });

  // PATCH /entries/:entryId — R6 (user): Edit a transaction's note / date.
  app.patch("/entries/:entryId", async (c) => {
    const { editEntrySchema } = await getSchemas();
    if (!c.get("session")) return c.json({ error: "unauthorized" }, 401);
    const entryId = c.req.param("entryId");
    if (await badId(entryId)) return c.json({ error: "not_found" }, 404);
    const parsed = editEntrySchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const r = await deps.investments.editEntry({
      ...who(c),
      entryId,
      ...parsed.data,
    });
    if (r.isErr()) {
      const e = r.error as Error & { min?: string | null; max?: string | null };
      if (e.message === "date_out_of_range")
        return c.json({ error: e.message, min: e.min, max: e.max }, 422);
      return fail(c, e, await assetErrors(), "edit_entry_failed");
    }
    return c.json(r.value);
  });

  // POST /:id/transfer — Swap → Transfer (D-10): same type, linked flow-0 legs.
  app.post("/:id/transfer", async (c) => {
    const { transferAssetSchema } = await getSchemas();
    if (!c.get("session")) return c.json({ error: "unauthorized" }, 401);
    const id = c.req.param("id");
    if (await badId(id)) return c.json({ error: "not_found" }, 404);
    const body = await c.req.json().catch(() => null);
    const parsed = transferAssetSchema.safeParse(body);
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const w = who(c);
    const budget = await deps.tenancy.workspaceRepo.findById(w.tenantId);
    const r = await deps.investments.transferAsset({
      ...parsed.data,
      ...w,
      budgetCurrency: budget?.default_currency ?? "EUR",
      holdingId: id,
    });
    if (r.isErr())
      return fail(c, r.error, await assetErrors(), "transfer_failed");
    return c.json(r.value, 201);
  });

  // POST /:id/sell — Swap → Sell (13.1 D-09): new / existing asset, or Out
  // of investments optionally into a wallet (D-20..D-23), one transaction.
  const SELL_ERRORS = new Set([
    "keep_out_of_range",
    "sell_qty_out_of_range",
    "no_value",
    "left_shape_mismatch",
    "currency_mismatch",
    "same_holding",
    "unsupported_destination",
    "quantity_required",
    "price_required",
    "received_required",
  ]);
  app.post("/:id/sell", async (c) => {
    const { sellAssetSchema } = await getSchemas();
    if (!c.get("session")) return c.json({ error: "unauthorized" }, 401);
    const id = c.req.param("id");
    if (await badId(id)) return c.json({ error: "not_found" }, 404);
    const body = await c.req.json().catch(() => null);
    const parsed = sellAssetSchema.safeParse(body);
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const w = who(c);
    const budget = await deps.tenancy.workspaceRepo.findById(w.tenantId);
    const r = await deps.investments.sellHolding({
      ...parsed.data,
      ...w,
      budgetCurrency: budget?.default_currency ?? "EUR",
      holdingId: id,
    });
    if (r.isErr())
      return fail(
        c,
        r.error,
        new Set([...SELL_ERRORS, ...(await assetErrors())]),
        "sell_holding_failed",
      );
    await recomputeWalletTasks(w, r.value.walletType);
    return c.json(
      {
        transferId: r.value.transferId,
        newHoldingId: r.value.newHoldingId,
        walletId: r.value.walletId,
        archived: r.value.archived,
      },
      201,
    );
  });

  // ── Phase 13: history, edit bookings, type groups, delete ──────────────
  // GET /type-summary — realized + sold cost per type, saved order (D-12/D-14)
  app.get("/type-summary", async (c) => {
    if (!c.get("session")) return c.json({ error: "unauthorized" }, 401);
    const w = who(c);
    const budget = await deps.tenancy.workspaceRepo.findById(w.tenantId);
    const r = await deps.investments.typeSummary({
      ...w,
      budgetCurrency: budget?.default_currency ?? "EUR",
    });
    if (r.isErr()) return serverError(c, "type_summary_failed", r.error);
    return c.json(r.value);
  });

  // PUT /type-order — per-budget type-group order (D-12)
  app.put("/type-order", async (c) => {
    const { typeOrderSchema } = await getSchemas();
    if (!c.get("session")) return c.json({ error: "unauthorized" }, 401);
    const body = await c.req.json().catch(() => null);
    const parsed = typeOrderSchema.safeParse(body);
    if (!parsed.success)
      return c.json(
        { error: "validation_error", issues: parsed.error.issues },
        422,
      );
    const r = await deps.investments.setTypeOrder({
      ...who(c),
      order: parsed.data.order,
    });
    if (r.isErr()) return fail(c, r.error, new Set(), "type_order_failed");
    return c.json(r.value);
  });

  return app;
}
