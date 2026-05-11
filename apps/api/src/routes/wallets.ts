/**
 * wallets.ts — /wallets route factory
 *
 * PC-02: imports from package roots only.
 * T-2-04: zValidator on every state-changing endpoint.
 * T-2-04-01: RLS provides tenant isolation at DB layer.
 * T-2-04-02: Currency immutability enforced at domain level.
 *
 * D-13: scope field dropped — createWalletSchema no longer includes it.
 * D-12: balance_adjustments retained — adjust-balance route still works.
 */
import { Hono } from "hono";
import type { BootedDeps } from "../boot";
import { serverError } from "../middleware/server-error";

export function createWalletsRoute(deps: BootedDeps) {
  const app = new Hono<{ Variables: Record<string, any> }>();

  /** Pick the first active tenant (phase-2: single-budget per request). */

  function pickTenant(c: any): string {
    const ids = c.get("tenantIds") as string[] | undefined;
    return ids?.[0] ?? "";
  }

  // Lazy imports to avoid circular deps at module load
  async function getSchemas() {
    const { createWalletSchema, adjustBalanceSchema } =
      await import("@budget/budgeting/src/contracts/api");
    return { createWalletSchema, adjustBalanceSchema };
  }

  // POST /wallets — create new wallet
  app.post("/", async (c) => {
    const { createWalletSchema } = await getSchemas();

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const parsed = createWalletSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Validation error", issues: parsed.error.issues },
        422,
      );
    }

    const session = c.get("session");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;

    // D-13: scope field dropped — no scope inference, not passed to service
    const r = await deps.budgeting.createWallet({
      ...parsed.data,
      tenantId,
      actorUserId: userId,
    });

    if (r.isErr()) {
      const msg = r.error.message;
      if (msg.includes("not in the supported currencies")) {
        return c.json({ error: msg }, 422);
      }
      return c.json({ error: msg }, 422);
    }

    return c.json(r.value, 201);
  });

  // GET /wallets — list wallets
  app.get("/", async (c) => {
    const tenantId = pickTenant(c);
    const includeArchived = c.req.query("includeArchived") === "true";

    const r = await deps.budgeting.listWallets({ tenantId, includeArchived });
    if (r.isErr()) return serverError(c, "list_wallets_failed", r.error);

    return c.json({ wallets: r.value });
  });

  // GET /wallets/:id — find by id
  app.get("/:id", async (c) => {
    const tenantId = pickTenant(c);
    const { id } = c.req.param();

    const r = await deps.budgeting.findWalletById({ tenantId, walletId: id });
    if (r.isErr()) return serverError(c, "find_wallet_failed", r.error);
    if (!r.value) return c.json({ error: "Not found" }, 404);

    return c.json(r.value);
  });

  // POST /wallets/:id/archive — archive a wallet
  app.post("/:id/archive", async (c) => {
    const session = c.get("session");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;
    const { id: walletId } = c.req.param();

    const r = await deps.budgeting.archiveWallet({
      tenantId,
      walletId,
      actorUserId: userId,
    });

    if (r.isErr()) return c.json({ error: r.error.message }, 422);
    return c.json(r.value);
  });

  // POST /wallets/:id/balance-adjustment — adjust balance (D-12: retained)
  app.post("/:id/balance-adjustment", async (c) => {
    const { adjustBalanceSchema } = await getSchemas();
    const session = c.get("session");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;
    const { id: walletId } = c.req.param();

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const parsed = adjustBalanceSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Validation error", issues: parsed.error.issues },
        422,
      );
    }

    const r = await deps.budgeting.adjustWalletBalance({
      ...parsed.data,
      tenantId,
      walletId,
      actorUserId: userId,
    });

    if (r.isErr()) return c.json({ error: r.error.message }, 422);
    return c.json(r.value, 201);
  });

  return app;
}
