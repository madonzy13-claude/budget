import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { Money, type Currency } from "@budget/shared-kernel";
import { toMinorUnits } from "../money";
import { MCP_LIMITS } from "../limits";
import type { DispatchResult } from "../dispatch";
import {
  writeTool,
  toolError,
  fromDispatch,
  untrusted,
  type McpCtx,
  type WriteCtx,
  type WriteEffect,
  type WriteOutcome,
} from "./define";

/**
 * Write tools — each a dispatch over the route the web app uses, so the side
 * effects (reserve task sync, recompute runners) are the app's own and the
 * rows look exactly like the user's own (D-03, D-07). writeTool adds scope,
 * limits and the hidden write log.
 */
const budgetId = z.uuid().describe("A budget_id from list_budgets");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const amount = z
  .string()
  .describe('Decimal string, e.g. "12.50"; negative is a refund');

const month = z.string().regex(/^\d{4}-\d{2}$/, "YYYY-MM");
const SAME_AS_APP = "The change looks exactly like one the user made in the app.";

/** GET …/limits/effective — amounts are integer minor units as strings. */
type Limit = { normalAmount: string; cushionAmount: string };
type Txn = { id: string; currency_original: string; currency_converted?: string };

async function getBody<T>(c: WriteCtx, path: string, budgetId?: string): Promise<T | null> {
  const r = await c.dispatch({ method: "GET", path, ...(budgetId ? { budgetId } : {}) });
  return r.ok ? (r.body as T) : null;
}

/** One entity changed by one dispatch → its write-log effect. */
function effect(
  r: DispatchResult,
  e: Omit<WriteEffect, "entryCount" | "replayed">,
): WriteEffect {
  return { ...e, entryCount: 1, replayed: r.replayed };
}

/** Balance as a decimal string, keeping up to 4 places for crypto wallets. */
function decimal(cents: string, currency: string): string {
  const v = Money.of(cents, currency as Currency).amount.div(100);
  return v.toFixed(Math.max(2, (v.toString().split(".")[1] ?? "").length));
}

/** sync_wallet_balance's write, also an import row (15-20). */
export async function syncWalletBalance(
  c: WriteCtx,
  { budget_id, wallet_id, balance, currency }: { budget_id: string; wallet_id: string; balance: string; currency: string },
  idempotencyKey?: string,
): Promise<WriteOutcome> {
  type Wallet = { id: string; currency: string; currentBalanceCents: string };
  const path = `/wallets/${wallet_id}`;
  const before = await getBody<Wallet>(c, path, budget_id);
  if (!before) return toolError("not_found");
  const r = await c.dispatch({
    method: "PUT",
    path: `${path}/balance`,
    budgetId: budget_id,
    body: { amount: balance, currency },
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });
  if (!r.ok) return fromDispatch(r);
  const after = (await getBody<Wallet>(c, path, budget_id)) ?? before;
  const ccy = after.currency;
  const diff = String(BigInt(after.currentBalanceCents) - BigInt(before.currentBalanceCents));
  return {
    result: {
      wallet_id,
      old_balance: decimal(before.currentBalanceCents, ccy),
      new_balance: decimal(after.currentBalanceCents, ccy),
      difference: decimal(diff, ccy),
      currency: ccy,
    },
    effects: [
      effect(r, {
        tenantId: budget_id,
        entityType: "wallet",
        entityId: wallet_id,
        op: "update",
        before,
        after,
      }),
    ],
    currency: ccy,
  };
}

/** set_category_limit's write, also an import row (15-20); no_limit is import-only. */
export async function setCategoryLimit(
  c: WriteCtx,
  args: {
    budget_id: string;
    category_id: string;
    month: string;
    amount?: string;
    cushion_amount?: string;
    no_limit?: boolean;
    currency?: string;
  },
  idempotencyKey?: string,
): Promise<WriteOutcome> {
  const base = `/budgets/${args.budget_id}/categories/${args.category_id}`;
  const cat = await getBody<{ currency: string }>(c, base, args.budget_id);
  if (!cat) return toolError("not_found");
  const ccy = args.currency?.toUpperCase() ?? cat.currency;
  const from = `${args.month}-01`;
  const effective = () =>
    getBody<Limit>(
      c,
      `${base}/limits/effective?date=${from}`,
      args.budget_id,
    );
  const before = await effective();

  const window = { effectiveFrom: from, singleMonth: args.month < new Date().toISOString().slice(0, 7) };
  // Another currency switches the category first, exactly as the app's
  // category sheet does (Phase 14 D-07): the limit is then written in it.
  if (ccy !== cat.currency) {
    const sw = await c.dispatch({
      method: "PATCH",
      path: `${base}/currency`,
      budgetId: args.budget_id,
      body: window.singleMonth ? { currency: ccy, month: from } : { currency: ccy },
      ...(idempotencyKey ? { idempotencyKey: `${idempotencyKey}:currency` } : {}),
    });
    if (!sw.ok) return fromDispatch(sw);
  }
  let body: Record<string, unknown>;
  if (args.no_limit) {
    // The app's own "No limit" segment for that month.
    body = { noLimit: true, normalAmount: "0", cushionAmount: "0", ...window };
  } else {
    const normal = toMinorUnits(args.amount ?? "", ccy);
    if (normal.isErr()) return toolError(normal.error);
    const cushion = args.cushion_amount
      ? toMinorUnits(args.cushion_amount, ccy)
      : null;
    if (cushion?.isErr()) return toolError(cushion.error);
    const cushionCents = cushion?.isOk() ? cushion.value : (before?.cushionAmount ?? normal.value);
    if (normal.value < 0 || Number(cushionCents) < 0) return toolError("invalid_amount");
    body = { normalAmount: String(normal.value), cushionAmount: String(cushionCents), ...window };
  }

  const r = await c.dispatch({
    method: "POST",
    path: `${base}/limits`,
    budgetId: args.budget_id,
    body,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });
  if (!r.ok) return fromDispatch(r);
  const after = await effective();
  return {
    result: {
      category_id: args.category_id,
      month: args.month,
      ...(after && {
        amount: decimal(after.normalAmount, ccy),
        cushion_amount: decimal(after.cushionAmount, ccy),
      }),
      currency: ccy,
    },
    effects: [
      effect(r, {
        tenantId: args.budget_id,
        entityType: "category_limit",
        entityId: args.category_id,
        op: "update",
        before: before && { month: args.month, ...before },
        after: after && {
          month: args.month,
          ...after,
          currency: ccy,
          ...(ccy !== cat.currency ? { previousCurrency: cat.currency } : {}),
        },
      }),
    ],
    currency: ccy,
  };
}

export function registerWriteTools(server: McpServer, ctx: McpCtx): void {
  writeTool(
    server,
    ctx,
    "add_transactions",
    {
      description:
        "Add up to 500 spendings to a budget, exactly as if the user typed them in the app. " +
        "A negative amount is a refund. Currency defaults to the category's own. " +
        "Retrying with the same idempotency_key and rows is safe: rows already added are not added again. " +
        "If a row fails, the rows before it stay and the answer says which row failed.",
      inputSchema: z.object({
        budget_id: budgetId,
        idempotency_key: z
          .string()
          .min(8)
          .max(100)
          .describe("Any unique string per batch; reuse it only to retry the same batch"),
        rows: z
          .array(
            z.object({
              date,
              category_id: z.uuid(),
              amount,
              currency: z.string().length(3).optional(),
              note: z.string().max(2000).nullable().optional(),
            }),
          )
          .min(1),
      }),
      annotations: { destructiveHint: false, idempotentHint: true },
      entryCount: (args) => args.rows.length,
    },
    async (args, c) => {
      if (args.rows.length > MCP_LIMITS.maxRowsPerCall)
        return toolError("too_many_rows", { max: MCP_LIMITS.maxRowsPerCall });

      // Every row is checked before the first one is written.
      const bodies = [];
      for (const [index, row] of args.rows.entries()) {
        // ponytail: every supported currency has 2 decimals, so EUR stands in
        // for "the category's own" when the row names none.
        const cents = toMinorUnits(row.amount, row.currency ?? "EUR");
        if (cents.isErr()) return toolError(cents.error, { index });
        bodies.push({
          date: row.date,
          category_id: row.category_id,
          amount_original_cents: cents.value,
          ...(row.currency ? { currency_original: row.currency.toUpperCase() } : {}),
          ...(row.note !== undefined ? { note: row.note } : {}),
        });
      }

      const created: Txn[] = [];
      const effects: WriteEffect[] = [];
      for (const [index, body] of bodies.entries()) {
        const r = await c.dispatch({
          method: "POST",
          path: `/budgets/${args.budget_id}/transactions`,
          budgetId: args.budget_id,
          body,
          idempotencyKey: `${args.idempotency_key}:${index}`,
        });
        if (!r.ok) {
          const error = (r.body as { error?: string } | null)?.error ?? `http_${r.status}`;
          if (created.length === 0) return toolError(error, { index, status: r.status });
          return {
            result: { created, failed: { index, error } },
            effects,
            currency: created[0]!.currency_converted,
          };
        }
        const txn = (r.body as { transaction: Txn }).transaction;
        created.push(txn);
        effects.push({
          tenantId: args.budget_id,
          entityType: "transaction",
          entityId: txn.id,
          op: "create",
          before: null,
          after: txn,
          entryCount: 1,
          replayed: r.replayed,
        });
      }
      return { result: { created }, effects, currency: created[0]!.currency_converted };
    },
  );

  const txnPath = (b: string, id: string) => `/budgets/${b}/transactions/${id}`;

  writeTool(
    server,
    ctx,
    "edit_transaction",
    {
      description:
        "Change a spending's date, category, amount, currency or note. Only the fields given change. " +
        SAME_AS_APP,
      inputSchema: z.object({
        budget_id: budgetId,
        transaction_id: z.uuid(),
        changes: z.object({
          date: date.optional(),
          category_id: z.uuid().optional(),
          amount: amount.optional(),
          currency: z.string().length(3).optional(),
          note: z.string().max(2000).nullable().optional(),
        }),
      }),
      annotations: { destructiveHint: false, idempotentHint: true },
      entryCount: () => 1,
    },
    async ({ budget_id, transaction_id, changes }, c) => {
      const path = txnPath(budget_id, transaction_id);
      const before = (await getBody<{ transaction: Txn }>(c, path, budget_id))?.transaction;
      if (!before) return toolError("not_found");

      const body: Record<string, unknown> = {};
      if (changes.date) body.date = changes.date;
      if (changes.category_id) body.category_id = changes.category_id;
      if (changes.currency) body.currency_original = changes.currency.toUpperCase();
      if (changes.amount !== undefined) {
        const cents = toMinorUnits(changes.amount, changes.currency ?? before.currency_original);
        if (cents.isErr()) return toolError(cents.error);
        body.amount_original_cents = cents.value;
      }
      if (changes.note !== undefined) body.note = changes.note;
      if (Object.keys(body).length === 0) return toolError("nothing_to_change");

      const r = await c.dispatch({ method: "PATCH", path, budgetId: budget_id, body });
      if (!r.ok) return fromDispatch(r);
      const after = (r.body as { transaction: Txn }).transaction;
      return {
        result: { transaction: after },
        effects: [
          effect(r, {
            tenantId: budget_id,
            entityType: "transaction",
            entityId: transaction_id,
            op: "update",
            before,
            after,
          }),
        ],
        currency: after.currency_converted,
      };
    },
  );

  writeTool(
    server,
    ctx,
    "delete_transaction",
    {
      description: "Delete a spending, the same way the app's delete does. " + SAME_AS_APP,
      inputSchema: z.object({ budget_id: budgetId, transaction_id: z.uuid() }),
      annotations: { destructiveHint: true, idempotentHint: true },
      entryCount: () => 1,
    },
    async ({ budget_id, transaction_id }, c) => {
      const path = txnPath(budget_id, transaction_id);
      const before = (await getBody<{ transaction: Txn }>(c, path, budget_id))?.transaction;
      if (!before) return toolError("not_found");
      const r = await c.dispatch({ method: "DELETE", path, budgetId: budget_id });
      if (!r.ok) return fromDispatch(r);
      return {
        result: { deleted: transaction_id },
        effects: [
          effect(r, {
            tenantId: budget_id,
            entityType: "transaction",
            entityId: transaction_id,
            op: "delete",
            before,
            after: null,
          }),
        ],
      };
    },
  );

  writeTool(
    server,
    ctx,
    "sync_wallet_balance",
    {
      description:
        "Set a wallet's balance to what the bank or app shows now. Answers with the old and new " +
        "balance and the difference. " + SAME_AS_APP,
      inputSchema: z.object({
        budget_id: budgetId,
        wallet_id: z.uuid(),
        balance: z
          .string()
          .regex(/^-?\d{1,13}(\.\d{1,4})?$/)
          .describe('Decimal string, e.g. "1520.40"; negative for a credit card'),
        currency: z.string().regex(/^[A-Z0-9]{3,5}$/),
      }),
      annotations: { destructiveHint: true, idempotentHint: true },
      entryCount: () => 1,
    },
    (args, c) => syncWalletBalance(c, args),
  );

  type Wallet = { id: string; name: string; walletType: string; currency: string; currentBalanceCents: string };
  const balance = z
    .string()
    .regex(/^-?\d{1,13}(\.\d{1,4})?$/)
    .describe('Decimal string in the wallet\'s currency, e.g. "75.34"; negative for a credit card');
  const walletType = z
    .enum(["SPENDINGS", "CUSHION", "RESERVE", "POSSESSION", "OTHER"])
    .describe("SPENDINGS = everyday money (default); CUSHION, RESERVE, POSSESSION, OTHER as in the app");

  writeTool(
    server,
    ctx,
    "create_wallet",
    {
      description:
        "Create a wallet (cash, bank account, card…) with its balance, in the currency the user said. " +
        SAME_AS_APP,
      inputSchema: z.object({
        budget_id: budgetId,
        name: z.string().min(1).max(120),
        currency: z.string().regex(/^[A-Z0-9]{3,5}$/),
        balance: balance.optional(),
        wallet_type: walletType.default("SPENDINGS"),
      }),
      annotations: { destructiveHint: false, idempotentHint: false },
      entryCount: () => 1,
    },
    async ({ budget_id: b, name, currency, balance: amt, wallet_type }, c) => {
      const r = await c.dispatch({ method: "POST", path: "/wallets", budgetId: b, body: { name, walletType: wallet_type, currency } });
      if (!r.ok) return fromDispatch(r);
      const id = (r.body as { id: string }).id;
      // The app's add form sets the balance with the same PATCH right after.
      if (amt !== undefined) {
        const p = await c.dispatch({ method: "PATCH", path: `/wallets/${id}`, budgetId: b, body: { amount: amt } });
        if (!p.ok) return fromDispatch(p);
      }
      const made = (await getBody<Wallet>(c, `/wallets/${id}`, b)) ?? (r.body as Wallet);
      return {
        result: { wallet: { ...made, name: untrusted(made.name), balance: decimal(made.currentBalanceCents ?? "0", made.currency) } },
        effects: [effect(r, { tenantId: b, entityType: "wallet", entityId: id, op: "create", before: null, after: made })],
        currency: made.currency,
      };
    },
  );

  writeTool(
    server,
    ctx,
    "edit_wallet",
    {
      description:
        "Change a wallet's name, currency, balance or type; pass only what changes. A new currency " +
        "is not a conversion: give the balance as the user said it in that currency. " + SAME_AS_APP,
      inputSchema: z.object({
        budget_id: budgetId,
        wallet_id: z.uuid(),
        name: z.string().min(1).max(120).optional(),
        currency: z.string().regex(/^[A-Z0-9]{3,5}$/).optional(),
        balance: balance.optional(),
        wallet_type: walletType.optional(),
      }),
      annotations: { destructiveHint: false, idempotentHint: true },
      entryCount: () => 1,
    },
    async ({ budget_id: b, wallet_id: id, name, currency, balance: amt, wallet_type }, c) => {
      const body = {
        ...(name !== undefined ? { name } : {}),
        ...(currency !== undefined ? { currency } : {}),
        ...(amt !== undefined ? { amount: amt } : {}),
        ...(wallet_type !== undefined ? { walletType: wallet_type } : {}),
      };
      if (Object.keys(body).length === 0) return toolError("nothing_to_change");
      const before = await getBody<Wallet>(c, `/wallets/${id}`, b);
      if (!before) return toolError("not_found");
      const r = await c.dispatch({ method: "PATCH", path: `/wallets/${id}`, budgetId: b, body });
      if (!r.ok) return fromDispatch(r);
      const after = (await getBody<Wallet>(c, `/wallets/${id}`, b)) ?? before;
      return {
        result: { wallet: { ...after, name: untrusted(after.name), balance: decimal(after.currentBalanceCents, after.currency) } },
        effects: [effect(r, { tenantId: b, entityType: "wallet_details", entityId: id, op: "update", before, after })],
        currency: after.currency,
      };
    },
  );

  writeTool(
    server,
    ctx,
    "delete_wallet",
    {
      description: "Delete a wallet, the same way the app's delete does (it is archived). " + SAME_AS_APP,
      inputSchema: z.object({ budget_id: budgetId, wallet_id: z.uuid() }),
      annotations: { destructiveHint: true, idempotentHint: true },
      entryCount: () => 1,
    },
    async ({ budget_id: b, wallet_id: id }, c) => {
      const before = await getBody<Wallet>(c, `/wallets/${id}`, b);
      if (!before) return toolError("not_found");
      const r = await c.dispatch({ method: "POST", path: `/wallets/${id}/archive`, budgetId: b, body: {} });
      if (!r.ok) return fromDispatch(r);
      return {
        result: { deleted: id },
        effects: [effect(r, { tenantId: b, entityType: "wallet", entityId: id, op: "delete", before, after: null })],
      };
    },
  );

  writeTool(
    server,
    ctx,
    "set_category_limit",
    {
      description:
        "Set a category's monthly limit. The current month carries forward to later months; " +
        "a past month changes only that month. Amount is in the category's currency unless `currency` is given. " +
        "When the user names a limit in another currency, pass that currency and the amount as said: " +
        "the category switches to it, as in the app. Never convert the amount yourself. " + SAME_AS_APP,
      inputSchema: z.object({
        budget_id: budgetId,
        category_id: z.uuid(),
        month,
        amount: amount.describe('Decimal string, e.g. "450.00"'),
        cushion_amount: amount
          .optional()
          .describe("The cushion budget limit; omitted keeps the current one"),
        currency: z
          .string()
          .length(3)
          .optional()
          .describe("ISO code the amounts are in, e.g. \"USD\"; switches the category to it"),
      }),
      annotations: { destructiveHint: false, idempotentHint: true },
      entryCount: () => 1,
    },
    (args, c) => setCategoryLimit(c, args),
  );

  writeTool(
    server,
    ctx,
    "create_category",
    {
      description:
        "Create a spending category. Currency defaults to the budget's. " + SAME_AS_APP,
      inputSchema: z.object({
        budget_id: budgetId,
        name: z.string().min(1).max(120),
        currency: z.string().length(3).optional(),
      }),
      annotations: { destructiveHint: false, idempotentHint: false },
      entryCount: () => 1,
    },
    async ({ budget_id, name, currency }, c) => {
      const r = await c.dispatch({
        method: "POST",
        path: `/budgets/${budget_id}/categories`,
        budgetId: budget_id,
        body: { name, ...(currency ? { currency: currency.toUpperCase() } : {}) },
      });
      if (!r.ok) return fromDispatch(r);
      const category = (r.body as { category: { id: string } }).category;
      return {
        result: { category },
        effects: [
          effect(r, {
            tenantId: budget_id,
            entityType: "category",
            entityId: category.id,
            op: "create",
            before: null,
            after: category,
          }),
        ],
      };
    },
  );

  /** rename / archive: GET before → mutate → the route's answer is after. */
  const changeCategory =
    (verb: (b: string, id: string) => { method: "PATCH" | "POST"; path: string; body: unknown }) =>
    async (args: { budget_id: string; category_id: string; name?: string }, c: WriteCtx) => {
      const path = `/budgets/${args.budget_id}/categories/${args.category_id}`;
      const before = await getBody<Record<string, unknown>>(c, path, args.budget_id);
      if (!before) return toolError("not_found");
      const r = await c.dispatch({ ...verb(args.budget_id, args.category_id), budgetId: args.budget_id });
      if (!r.ok) return fromDispatch(r);
      const after = (await getBody<Record<string, unknown>>(c, path, args.budget_id)) ?? r.body;
      return {
        result: { category: after as Record<string, unknown> },
        effects: [
          effect(r, {
            tenantId: args.budget_id,
            entityType: "category",
            entityId: args.category_id,
            op: "update" as const,
            before,
            after,
          }),
        ],
      };
    };

  writeTool(
    server,
    ctx,
    "rename_category",
    {
      description: "Rename a category. " + SAME_AS_APP,
      inputSchema: z.object({
        budget_id: budgetId,
        category_id: z.uuid(),
        name: z.string().min(1).max(120),
      }),
      annotations: { destructiveHint: false, idempotentHint: true },
      entryCount: () => 1,
    },
    (args, c) =>
      changeCategory((b, id) => ({
        method: "PATCH",
        path: `/budgets/${b}/categories/${id}`,
        body: { name: args.name },
      }))(args, c),
  );

  writeTool(
    server,
    ctx,
    "archive_category",
    {
      description:
        "Archive a category: it stops taking new spendings, its history stays. " + SAME_AS_APP,
      inputSchema: z.object({ budget_id: budgetId, category_id: z.uuid() }),
      annotations: { destructiveHint: true, idempotentHint: true },
      entryCount: () => 1,
    },
    changeCategory((b, id) => ({
      method: "POST",
      path: `/budgets/${b}/categories/${id}/archive`,
      body: {},
    })),
  );

  writeTool(
    server,
    ctx,
    "budget_create",
    {
      description:
        "Create a new budget owned by the user, in the currency given. It can be used at once. " +
        SAME_AS_APP,
      inputSchema: z.object({
        name: z.string().min(1).max(100),
        currency: z.string().length(3),
      }),
      annotations: { destructiveHint: false, idempotentHint: false },
      entryCount: () => 1,
    },
    async ({ name, currency }, c) => {
      const r = await c.dispatch({
        method: "POST",
        path: "/budgets",
        body: { name, default_currency: currency.toUpperCase() },
      });
      if (!r.ok) return fromDispatch(r);
      const made = r.body as { id: string; name: string };
      return {
        result: made,
        effects: [
          effect(r, {
            tenantId: made.id,
            entityType: "budget",
            entityId: made.id,
            op: "create",
            before: null,
            after: made,
          }),
        ],
        currency: currency.toUpperCase(),
      };
    },
  );
}
