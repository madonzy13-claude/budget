/**
 * transactions.ts — /transactions route factory
 *
 * POST /transactions — create EXPENSE / INCOME / TRANSFER (idempotency middleware wraps automatically)
 * GET  /transactions — latest-only view (corrects_id derivation, paginated)
 *
 * T-2-06-02: FX stale preview → 409 with fresh rate
 * T-2-06-03: RLS provides tenant isolation
 * T-2-06-05: Idempotency-Key middleware (plan 02-03) deduplicates replays
 * T-2-06-08: workspace_share_dirty → 409
 */
import { Hono } from "hono";
import type { BootedDeps } from "../boot";

export function createTransactionsRoute(deps: BootedDeps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = new Hono<{ Variables: Record<string, any> }>();

  /** Pick the first active tenant (phase-2: single-workspace per request). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function pickTenant(c: any): string {
    const ids = c.get("tenantIds") as string[] | undefined;
    return ids?.[0] ?? "";
  }

  // POST /transactions — create ledger rows
  app.post("/", async (c) => {
    const { createTransactionSchema } = await import(
      "@budget/budgeting/src/contracts/api"
    );

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const parsed = createTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation error", issues: parsed.error.issues }, 422);
    }

    const session = c.get("session");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;

    const r = await deps.budgeting.createTransaction({
      ...parsed.data,
      tenantId,
      actorUserId: userId,
    });

    if (r.isErr()) {
      const e = r.error as { kind?: string; freshRate?: unknown; message: string };
      if (e.kind === "FxRateStale") {
        return c.json({ error: "fx_rate_stale", freshRate: e.freshRate }, 409);
      }
      if (e.kind === "WorkspaceSharesDirty") {
        return c.json({ error: "shares_dirty" }, 409);
      }
      if (e.kind === "CurrencyNotSupported") {
        return c.json({ error: e.message }, 422);
      }
      if (e.kind === "AccountArchived") {
        return c.json({ error: e.message }, 422);
      }
      return c.json({ error: e.message }, 422);
    }

    return c.json(r.value, 201);
  });

  // GET /transactions — latest transactions list
  app.get("/", async (c) => {
    const tenantId = pickTenant(c);
    const limit = parseInt(c.req.query("limit") ?? "50", 10);
    const beforeDate = c.req.query("beforeDate");
    const beforeId = c.req.query("beforeId");

    const r = await deps.budgeting.getLatestTransactions({
      tenantId,
      limit: isNaN(limit) ? 50 : Math.min(limit, 100),
      before:
        beforeDate && beforeId
          ? { transactionDate: beforeDate, id: beforeId }
          : undefined,
    });

    if (r.isErr()) return c.json({ error: r.error.message }, 500);

    return c.json({
      transactions: r.value.map((tx) => ({
        id: tx.id,
        tenantId: tx.tenantId,
        kind: tx.kind,
        amountOrig: tx.amountOrig,
        currencyOrig: tx.currencyOrig,
        amountDefault: tx.amountDefault,
        currencyDefault: tx.currencyDefault,
        fxRate: tx.fxRate,
        fxRateDate: tx.fxRateDate,
        fxProvider: tx.fxProvider,
        transactionDate: tx.transactionDate,
        note: tx.note,
        accountId: tx.accountId,
        categoryId: tx.categoryId,
        transferGroupId: tx.transferGroupId,
        correctsId: tx.correctsId,
        createdAt: tx.createdAt.toISOString(),
        isStale: tx.isStale(),
      })),
    });
  });

  return app;
}
