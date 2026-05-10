/**
 * transactions.ts — /transactions route factory
 *
 * POST /transactions            — create EXPENSE / INCOME / TRANSFER (idempotency middleware)
 * GET  /transactions            — latest-only view (corrects_id derivation, paginated)
 * POST /transactions/:id/correct — edit via correction row (plan 02-07)
 * GET  /transactions/:id/history — full correction chain (plan 02-07)
 *
 * T-2-06-02: FX stale preview → 409 with fresh rate
 * T-2-06-03: RLS provides tenant isolation
 * T-2-06-05: Idempotency-Key middleware (plan 02-03) deduplicates replays
 * T-2-06-08: workspace_share_dirty → 409
 * T-2-07-02: AlreadyCorrected → 409
 * T-2-07-04: RLS scopes history chain
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

  // POST /transactions/:id/correct — edit via correction row (plan 02-07, EXPN-06)
  app.post("/:id/correct", async (c) => {
    const { correctTransactionSchema } = await import(
      "@budget/budgeting/src/contracts/api"
    );

    const originalId = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const parsed = correctTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation error", issues: parsed.error.issues }, 422);
    }

    const session = c.get("session");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;

    const r = await deps.budgeting.editTransaction({
      transactionId: originalId,
      edits: parsed.data.edits,
      fxPreview: parsed.data.fxPreview ?? null,
      actorUserId: userId,
      tenantId,
    });

    if (r.isErr()) {
      const e = r.error as { kind?: string; message: string; freshRate?: unknown };
      if (e.kind === "AlreadyCorrected") {
        return c.json({ error: "already_corrected", message: e.message }, 409);
      }
      if (e.kind === "TransactionNotFound") {
        return c.json({ error: "not_found", message: e.message }, 404);
      }
      if (e.kind === "FxRateStale") {
        return c.json({ error: "fx_rate_stale", freshRate: e.freshRate }, 409);
      }
      return c.json({ error: e.message }, 422);
    }

    return c.json(r.value, 201);
  });

  // GET /transactions/:id/history — full correction chain (plan 02-07, D-01-a)
  app.get("/:id/history", async (c) => {
    const transactionId = c.req.param("id");
    const tenantId = pickTenant(c);

    const r = await deps.budgeting.getTransactionHistory({
      tenantId,
      transactionId,
    });

    if (r.isErr()) {
      return c.json({ error: r.error.message }, 500);
    }

    const chain = r.value;
    if (chain.length === 0) {
      return c.json({ error: "not_found" }, 404);
    }

    return c.json({
      chain: chain.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        kind: row.kind,
        amountOrig: row.amountOrig,
        currencyOrig: row.currencyOrig,
        amountDefault: row.amountDefault,
        currencyDefault: row.currencyDefault,
        fxRate: row.fxRate,
        fxRateDate: row.fxRateDate,
        fxProvider: row.fxProvider,
        transactionDate: row.transactionDate,
        note: row.note,
        accountId: row.accountId,
        categoryId: row.categoryId,
        transferGroupId: row.transferGroupId,
        correctsId: row.correctsId,
      })),
    });
  });

  // POST /transactions/bulk-recategorize — Plan 02-09 (EXPN-10)
  app.post("/bulk-recategorize", async (c) => {
    const { bulkRecategorizeSchema } = await import(
      "@budget/budgeting/src/contracts/api"
    );

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const parsed = bulkRecategorizeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation error", issues: parsed.error.issues }, 422);
    }

    const session = c.get("session");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;

    const r = await deps.budgeting.bulkRecategorize({
      tenantId,
      transactionIds: parsed.data.transactionIds,
      newCategoryId: parsed.data.newCategoryId,
      actorUserId: userId,
    });

    if (r.isErr()) {
      return c.json({ error: r.error.message }, 422);
    }
    return c.json(r.value, 200);
  });

  // GET /transactions — latest transactions list, with search/filter (Plan 02-09)
  app.get("/", async (c) => {
    const { searchTransactionsSchema } = await import(
      "@budget/budgeting/src/contracts/api"
    );
    const tenantId = pickTenant(c);

    // Hono request -> plain query record
    const rawQuery: Record<string, string> = {};
    const url = new URL(c.req.url);
    for (const [k, v] of url.searchParams.entries()) rawQuery[k] = v;

    const parsed = searchTransactionsSchema.safeParse(rawQuery);
    if (!parsed.success) {
      return c.json({ error: "Validation error", issues: parsed.error.issues }, 422);
    }
    const q = parsed.data;

    const hasSearch =
      q.q !== undefined ||
      q.dateFrom !== undefined ||
      q.dateTo !== undefined ||
      q.categoryIds !== undefined ||
      q.accountIds !== undefined ||
      q.kind !== undefined ||
      q.cursorDate !== undefined;

    if (hasSearch) {
      const r = await deps.budgeting.searchTransactions({
        tenantId,
        query: q.q,
        filters: {
          dateFrom: q.dateFrom,
          dateTo: q.dateTo,
          categoryIds: q.categoryIds,
          accountIds: q.accountIds,
          kind: q.kind,
        },
        cursor:
          q.cursorDate && q.cursorId
            ? { transactionDate: q.cursorDate, id: q.cursorId }
            : null,
        limit: q.limit,
      });
      if (r.isErr()) return c.json({ error: r.error.message }, 500);

      return c.json({
        transactions: r.value.rows.map((tx) => ({
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
        })),
        nextCursor: r.value.nextCursor,
      });
    }

    // Legacy beforeDate/beforeId path — keep working for existing UI
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
        hasCorrections: tx.hasCorrections,
      })),
    });
  });

  return app;
}
