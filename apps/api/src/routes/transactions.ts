/**
 * transactions.ts — /transactions route factory (v1.1)
 *
 * Budget-scoped sub-routes per D-PH2-08:
 *   POST   /budgets/:budgetId/transactions               — create (TXN-03)
 *   PATCH  /budgets/:budgetId/transactions/:txId         — edit + FX re-compute (TXN-04,06)
 *   POST   /budgets/:budgetId/transactions/:txId/confirm — draft → confirmed (TXN-03)
 *   DELETE /budgets/:budgetId/transactions/:txId         — soft-delete
 *   GET    /budgets/:budgetId/transactions?month=YYYY-MM  — list for month (TXN-05)
 *   GET    /budgets/:budgetId/transactions/:txId         — single row
 *
 * Cross-budget routes (mounted at /transactions):
 *   POST   /transactions/bulk-recategorize               — bulk update categoryId (EXPN-10)
 *
 * Removed (TXN-08): /income, /transfer, /:id/history, /:id/correct
 *
 * T-02-01: currency_original validated as 3-char ISO.
 * T-02-02: amount_converted_cents NEVER read from client body — computed server-side.
 * T-02-09: column-level GRANT enforced at DB layer; no trust boundary breach.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "drizzle-orm";
import { withInfraTx } from "@budget/platform";
import { DrizzleTransactionRepo } from "@budget/budgeting/src/adapters/persistence/transaction-repo";
import {
  createTransaction,
  type CreateTransactionDeps,
} from "@budget/budgeting/src/application/create-transaction";
import { editTransaction } from "@budget/budgeting/src/application/edit-transaction";
import type { BootedDeps } from "../boot";

// ──────────────────────────────────────────────────────────────────────
// Deps interface — accepts BootedDeps for full module access.
// Can also be passed { fxProvider } for budget-scoped-only tests.
// ──────────────────────────────────────────────────────────────────────

export type TransactionRouteDeps =
  | Pick<BootedDeps, "budgeting">
  | { fxProvider: CreateTransactionDeps["fxProvider"] };

// ──────────────────────────────────────────────────────────────────────
// Zod schemas
// ──────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  category_id: z.string().uuid(),
  /** Signed: negative → INCOME (D-PH2-09) */
  amount_original_cents: z.number().int(),
  currency_original: z.string().length(3).toUpperCase().optional(),
  note: z.string().nullable().optional(),
});

const patchSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  category_id: z.string().uuid().optional(),
  /** Signed — absolute value stored; kind derived from sign if provided */
  amount_original_cents: z.number().int().optional(),
  currency_original: z.string().length(3).toUpperCase().optional(),
  note: z.string().nullable().optional(),
  kind: z.enum(["SPENDING", "INCOME"]).optional(),
});

const listQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM"),
  confirmed: z
    .enum(["true", "false", "any"])
    .optional()
    .transform((v) => {
      if (v === "true") return true as const;
      if (v === "false") return false as const;
      return "any" as const;
    }),
});

// ──────────────────────────────────────────────────────────────────────
// Response serialiser: TransactionRow → snake_case JSON
// ──────────────────────────────────────────────────────────────────────

function serializeRow(row: {
  id: string;
  tenantId: string;
  budgetId: string;
  categoryId: string;
  date: string;
  amountOriginalCents: string;
  currencyOriginal: string;
  amountConvertedCents: string;
  fxRate: string;
  fxAsOf: string;
  note: string | null;
  recurringRuleId: string | null;
  confirmedAt: Date | null;
  kind: "SPENDING" | "INCOME";
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}) {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    budget_id: row.budgetId,
    category_id: row.categoryId,
    date: row.date,
    amount_original_cents: row.amountOriginalCents,
    currency_original: row.currencyOriginal,
    amount_converted_cents: row.amountConvertedCents,
    fx_rate: row.fxRate,
    fx_as_of: row.fxAsOf,
    note: row.note ?? null,
    recurring_rule_id: row.recurringRuleId ?? null,
    // Recurring drafts carry the rule's note as their note at materialization
    // (create-recurring-rule.ts). The drafts UI reads `rule_name` to label the
    // row; expose it for recurring rows so draft rows aren't rendered nameless.
    rule_name: row.recurringRuleId ? (row.note ?? null) : null,
    confirmed_at: row.confirmedAt?.toISOString() ?? null,
    kind: row.kind,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Route factory
// ──────────────────────────────────────────────────────────────────────

export function createTransactionsRoute(deps: TransactionRouteDeps) {
  const app = new Hono<{ Variables: Record<string, unknown> }>();

  // Resolve fxProvider from either deps shape
  const fxProvider =
    "budgeting" in deps
      ? deps.budgeting.fxProvider
      : (deps as { fxProvider: CreateTransactionDeps["fxProvider"] })
          .fxProvider;

  // Resolve bulkRecategorize from budgeting module if available
  const bulkRecategorizeFn =
    "budgeting" in deps ? deps.budgeting.bulkRecategorize : null;

  // Wire repo and services (instantiated once per route factory call)
  const transactionRepo = new DrizzleTransactionRepo();

  async function getBudgetCurrency(budgetId: string): Promise<string> {
    const r = await withInfraTx(async (tx) => {
      const drizzleTx = tx as {
        execute: (
          q: unknown,
        ) => Promise<{ rows: Array<{ default_currency: string }> }>;
      };
      const rs = await drizzleTx.execute(
        sql`SELECT default_currency FROM tenancy.budgets WHERE id = ${budgetId}::uuid LIMIT 1`,
      );
      return rs.rows[0]?.default_currency ?? "EUR";
    });
    return r.isOk() ? r.value : "EUR";
  }

  const createTxService = createTransaction({
    transactionRepo,
    fxProvider,
    getBudgetCurrency,
  });

  const editTxService = editTransaction({
    transactionRepo,
    fxProvider,
    getBudgetCurrency,
  });

  function pickTenant(c: { get(k: string): unknown }): string {
    const ids = c.get("tenantIds") as string[] | undefined;
    return ids?.[0] ?? (c.get("tenantId") as string | undefined) ?? "";
  }

  function pickUser(c: { get(k: string): unknown }): string {
    const userId = c.get("userId") as string | undefined;
    if (userId) return userId;
    const session = c.get("session") as { user?: { id: string } } | undefined;
    return session?.user?.id ?? "";
  }

  // A transaction changes a category's cumulative reserve usage, which shifts the
  // expected reserve and therefore the RESERVE_TOPUP shortfall. Recompute the task
  // after every mutation (best-effort A2 — the hourly sweep is the backstop) so the
  // task message never goes stale relative to the reserves tab.
  const budgetingModule = "budgeting" in deps ? deps.budgeting : null;
  async function syncReserveTopup(
    tenantId: string,
    budgetId: string,
    userId: string,
  ): Promise<void> {
    if (!budgetingModule?.recomputeReserveTopup) return;
    try {
      await budgetingModule.recomputeReserveTopup({
        tenantId,
        budgetId,
        actorUserId: userId,
      });
    } catch {
      // best-effort; the hourly reconciliation sweep reconverges the task.
    }
  }

  // ── POST / — create transaction ──────────────────────────────────────
  app.post("/", zValidator("json", createSchema), async (c) => {
    const body = c.req.valid("json");
    const tenantId = pickTenant(c);
    const userId = pickUser(c);
    // budgetId comes from the path param :budgetId on the parent router
    const budgetId = c.req.param("budgetId") ?? tenantId;

    const r = await createTxService({
      date: body.date,
      categoryId: body.category_id,
      amountOriginalCents: body.amount_original_cents,
      currencyOriginal: body.currency_original ?? null,
      note: body.note ?? null,
      budgetId,
      tenantId,
      actorUserId: userId,
    });

    if (r.isErr()) {
      const e = r.error as { kind?: string; message: string };
      if (e.kind === "CurrencyNotSupported") {
        return c.json({ error: e.message }, 422);
      }
      return c.json({ error: e.message }, 422);
    }

    await syncReserveTopup(tenantId, budgetId, userId);
    return c.json({ transaction: serializeRow(r.value.transaction) }, 201);
  });

  // ── PATCH /:txId — edit transaction (FX re-compute on currency/date change) ──
  app.patch("/:txId", zValidator("json", patchSchema), async (c) => {
    const txId = c.req.param("txId");
    const tenantId = pickTenant(c);
    const userId = pickUser(c);
    const body = c.req.valid("json");

    const r = await editTxService({
      transactionId: txId,
      tenantId,
      actorUserId: userId,
      fields: {
        date: body.date,
        categoryId: body.category_id,
        amountOriginalCents: body.amount_original_cents,
        currencyOriginal: body.currency_original,
        note: body.note,
        kind: body.kind,
      },
    });

    if (r.isErr()) {
      const e = r.error as { kind?: string; message: string };
      if (e.kind === "TransactionNotFound") {
        return c.json({ error: "not_found", message: e.message }, 404);
      }
      return c.json({ error: e.message }, 422);
    }

    await syncReserveTopup(
      tenantId,
      c.req.param("budgetId") ?? tenantId,
      userId,
    );
    return c.json({ transaction: serializeRow(r.value.transaction) }, 200);
  });

  // ── POST /:txId/confirm — flip draft → confirmed ──────────────────────
  app.post("/:txId/confirm", async (c) => {
    const txId = c.req.param("txId");
    const tenantId = pickTenant(c);
    const userId = pickUser(c);

    try {
      await transactionRepo.confirm(txId, userId, tenantId);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 422);
    }

    const row = await transactionRepo.findById(tenantId, txId);
    if (!row) return c.json({ error: "not_found" }, 404);

    await syncReserveTopup(
      tenantId,
      c.req.param("budgetId") ?? tenantId,
      userId,
    );
    return c.json({ transaction: serializeRow(row) }, 200);
  });

  // ── DELETE /:txId — soft-delete ───────────────────────────────────────
  app.delete("/:txId", async (c) => {
    const txId = c.req.param("txId");
    const tenantId = pickTenant(c);
    const userId = pickUser(c);

    try {
      await transactionRepo.softDelete(txId, userId, tenantId);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 422);
    }

    await syncReserveTopup(
      tenantId,
      c.req.param("budgetId") ?? tenantId,
      userId,
    );
    return new Response(null, { status: 204 });
  });

  // ── GET / — list for month ────────────────────────────────────────────
  app.get("/", async (c) => {
    const tenantId = pickTenant(c);
    const budgetId = c.req.param("budgetId") ?? tenantId;

    // Parse query params
    const rawMonth = c.req.query("month");
    const rawConfirmed = c.req.query("confirmed");

    const parsed = listQuerySchema.safeParse({
      month: rawMonth,
      confirmed: rawConfirmed,
    });

    if (!parsed.success) {
      return c.json(
        { error: "Validation error", issues: parsed.error.issues },
        422,
      );
    }

    const { month, confirmed } = parsed.data;

    const rows = await transactionRepo.listForMonth(
      tenantId,
      budgetId,
      month,
      confirmed ?? "any",
    );

    return c.json({ transactions: rows.map(serializeRow) }, 200);
  });

  // ── GET /:txId — single transaction ──────────────────────────────────
  app.get("/:txId", async (c) => {
    const txId = c.req.param("txId");
    const tenantId = pickTenant(c);

    const row = await transactionRepo.findById(tenantId, txId);
    if (!row) return c.json({ error: "not_found" }, 404);

    return c.json({ transaction: serializeRow(row) }, 200);
  });

  // ── POST /bulk-recategorize — bulk update categoryId (EXPN-10) ────────
  // NOTE: Hono matches routes in registration order. This must be registered
  // BEFORE /:txId to avoid "bulk-recategorize" being captured as txId.
  // If bulkRecategorize is not available in deps, respond 501.
  app.post("/bulk-recategorize", async (c) => {
    if (!bulkRecategorizeFn) {
      return c.json({ error: "bulk-recategorize not available" }, 501);
    }

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const bulkSchema = z.object({
      transactionIds: z.array(z.string().uuid()).min(1).max(500),
      newCategoryId: z.string().uuid(),
    });

    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Validation error", issues: parsed.error.issues },
        422,
      );
    }

    const tenantId = pickTenant(c);
    const userId = pickUser(c);

    const r = await bulkRecategorizeFn({
      tenantId,
      transactionIds: parsed.data.transactionIds,
      newCategoryId: parsed.data.newCategoryId,
      actorUserId: userId,
    });

    if (r.isErr()) {
      return c.json({ error: r.error.message }, 422);
    }

    await syncReserveTopup(
      tenantId,
      c.req.param("budgetId") ?? tenantId,
      userId,
    );
    return c.json(r.value, 200);
  });

  return app;
}
