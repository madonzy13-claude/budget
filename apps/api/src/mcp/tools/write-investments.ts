import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { Money } from "@budget/shared-kernel";
import { toMinorUnits } from "../money";
import type { DispatchResult } from "../dispatch";
import {
  writeTool,
  toolError,
  fromDispatch,
  type McpCtx,
  type ToolResult,
  type WriteCtx,
  type WriteEffect,
} from "./define";

/**
 * Investment write tools — thin dispatches over the investments routes, so
 * Phase 13.1's rules (newest-first delete, sell into a wallet, linked legs)
 * stay single-sourced. Each write logs the ledger entries it added to the
 * asset it acted on: those are what undo can delete while they are newest
 * (15-01 decision a1).
 */
const budgetId = z.uuid().describe("A budget_id from list_budgets");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const decimal = z.string().regex(/^\d+(\.\d+)?$/, "decimal string");
const quantity = z
  .string()
  .regex(/^\d+(\.\d{1,8})?$/, "up to 8 decimals")
  .describe('Units as a decimal string, e.g. "0.12345678"');
const SAME_AS_APP =
  "The change looks exactly like one the user made in the app. " +
  "Undo can revert it while it is still the asset's newest entry.";

/** One buy / sell / transfer — also an import_preview row (15-16). */
export const investmentTxnRow = z.object({
  side: z.enum(["buy", "sell", "transfer"]),
  asset_id: z.uuid().optional(),
  new_asset: z
    .object({
      name: z.string().min(1).max(120),
      type: z
        .string()
        .describe("equities, etf, bond, crypto, reit, commodity, cash_fx, real_estate, other, savings, possession"),
    })
    .optional(),
  date,
  quantity: quantity.optional(),
  price: decimal.optional().describe("Price per unit"),
  amount: decimal.optional().describe("Total, for amount-shaped assets"),
  received: decimal.optional().describe("Sell: money received"),
  currency: z.string().length(3).optional(),
  destination: z
    .object({
      wallet_id: z.uuid().optional(),
      asset_id: z.uuid().optional(),
      quantity: quantity.optional().describe("Units bought of destination.asset_id"),
      price: decimal.optional(),
      new_asset_name: z.string().min(1).max(120).optional(),
    })
    .optional(),
  note: z.string().max(200).optional(),
});

type Entry = { id: string };
type Holding = { id: string; quantity: string; currentPriceCents: string | null };

// ponytail: Money is only borrowed for its big.js decimal; the currency is moot.
const big = (v: string) => Money.of(v, "USD").amount;

/** Decimal → integer minor units as a string; every supported currency has 2 decimals. */
function cents(v: string, field: string): { ok: true; value: string } | { ok: false; error: ToolResult } {
  const r = toMinorUnits(v, "USD");
  return r.isOk() ? { ok: true, value: String(r.value) } : { ok: false, error: toolError(r.error, { field }) };
}

const base = (b: string) => `/budgets/${b}/investments`;

async function entries(c: WriteCtx, b: string, assetId: string): Promise<Entry[]> {
  const r = await c.dispatch({ method: "GET", path: `${base(b)}/${assetId}/entries`, budgetId: b });
  return r.ok ? (r.body as { entries: Entry[] }).entries : [];
}

async function findHolding(c: WriteCtx, b: string, id: string): Promise<Holding | null> {
  for (const query of [undefined, { hidden: "1" }]) {
    const r = await c.dispatch({ method: "GET", path: base(b), budgetId: b, ...(query ? { query } : {}) });
    const h = r.ok ? (r.body as { holdings: Holding[] }).holdings.find((x) => x.id === id) : undefined;
    if (h) return h;
  }
  return null;
}

/** The entries a write added to `assetId`, one effect each. */
async function addedEntries(
  c: WriteCtx,
  b: string,
  assetId: string,
  before: Entry[],
  r: DispatchResult,
): Promise<WriteEffect[]> {
  const seen = new Set(before.map((e) => e.id));
  return (await entries(c, b, assetId))
    .filter((e) => !seen.has(e.id))
    .map((e) => ({
      tenantId: b,
      entityType: "investment_entry",
      entityId: e.id,
      op: "create" as const,
      before: null,
      after: { asset_id: assetId, ...e },
      entryCount: 1,
      replayed: r.replayed,
    }));
}

export function registerInvestmentWriteTools(server: McpServer, ctx: McpCtx): void {
  writeTool(
    server,
    ctx,
    "record_investment_transaction",
    {
      description:
        "Record an investment buy, sell or transfer. Buy: a new asset (new_asset) or more of an " +
        "existing one (asset_id), with quantity + price per unit, or amount for cash/savings-like " +
        "assets. Sell: quantity sold (or amount for amount assets); destination.wallet_id credits " +
        "a wallet with `received`, destination.asset_id buys into another asset, none = money left " +
        "investments. Transfer: move quantity to destination.asset_id or a new asset of the same " +
        "type named destination.new_asset_name. " + SAME_AS_APP,
      inputSchema: investmentTxnRow.extend({ budget_id: budgetId }),
      annotations: { destructiveHint: false, idempotentHint: false },
      entryCount: () => 1,
    },
    async (args, c) => {
      const b = args.budget_id;
      const ccy = args.currency?.toUpperCase();
      const note = args.note ? { note: args.note } : {};

      if (args.side === "buy" && !args.asset_id) {
        if (!args.new_asset) return toolError("asset_id_or_new_asset_required");
        if (!ccy) return toolError("currency_required");
        const total = args.price ?? args.amount;
        if (!total) return toolError("price_or_amount_required");
        const price = cents(total, "price");
        if (!price.ok) return price.error;
        const r = await c.dispatch({
          method: "POST",
          path: base(b),
          budgetId: b,
          body: {
            name: args.new_asset.name,
            holdingType: args.new_asset.type,
            quantity: args.quantity ?? "1",
            buyPriceCents: price.value,
            buyCurrency: ccy,
            // As the app's own form: a hand-tracked asset starts worth its price.
            currentPriceCents: price.value,
            currentPriceCurrency: ccy,
            openedOn: args.date,
            ...note,
          },
        });
        if (!r.ok) return fromDispatch(r);
        const assetId = (r.body as { id: string }).id;
        const effects = await addedEntries(c, b, assetId, [], r);
        return { result: { asset_id: assetId, holding: r.body as Record<string, unknown> }, effects, currency: ccy };
      }

      if (!args.asset_id) return toolError("asset_id_required");
      const assetId = args.asset_id;
      let body: Record<string, unknown>;

      if (args.side === "buy") {
        if (!ccy) return toolError("currency_required");
        if (args.quantity && args.price) {
          const p = cents(args.price, "price");
          if (!p.ok) return p.error;
          body = { kind: "quantity", quantity: args.quantity, priceCents: p.value, currency: ccy, effectiveDate: args.date, ...note };
        } else if (args.amount) {
          const a = cents(args.amount, "amount");
          if (!a.ok) return a.error;
          body = { kind: "amount", amountCents: a.value, currency: ccy, effectiveDate: args.date, ...note };
        } else return toolError("quantity_and_price_or_amount_required");
      } else if (args.side === "sell") {
        if (!ccy) return toolError("currency_required");
        const h = await findHolding(c, b, assetId);
        if (!h) return toolError("not_found");
        let left: Record<string, string>;
        if (args.quantity) {
          const rest = big(h.quantity).minus(big(args.quantity));
          if (rest.lt(0)) return toolError("sell_qty_out_of_range");
          left = { quantity: rest.toString() };
        } else if (args.amount) {
          const a = cents(args.amount, "amount");
          if (!a.ok) return a.error;
          const rest = big(h.currentPriceCents ?? "0").minus(big(a.value));
          if (rest.lt(0)) return toolError("keep_out_of_range");
          left = { valueCents: rest.toFixed(0) };
        } else return toolError("quantity_or_amount_required");

        const d = args.destination;
        let destination: Record<string, unknown>;
        if (d?.asset_id) {
          const p = d.price ? cents(d.price, "destination.price") : null;
          if (p && !p.ok) return p.error;
          destination = {
            kind: "existing",
            holdingId: d.asset_id,
            ...(d.quantity ? { quantityBought: d.quantity } : {}),
            ...(p?.ok ? { priceCents: p.value } : {}),
          };
        } else {
          destination = {
            kind: "out",
            wallet: d?.wallet_id ? { kind: "existing", walletId: d.wallet_id } : { kind: "nowhere" },
          };
        }
        const received = args.received ? cents(args.received, "received") : null;
        if (received && !received.ok) return received.error;
        body = {
          effectiveDate: args.date,
          left,
          destination,
          ...(received?.ok ? { receivedCents: received.value } : {}),
          receivedCurrency: ccy,
          ...note,
        };
      } else {
        const d = args.destination;
        const to = d?.asset_id
          ? { kind: "existing", holdingId: d.asset_id }
          : d?.new_asset_name
            ? { kind: "new", name: d.new_asset_name }
            : null;
        if (!to) return toolError("destination_required");
        let move: Record<string, string>;
        if (args.quantity) move = { quantity: args.quantity };
        else if (args.amount) {
          const a = cents(args.amount, "amount");
          if (!a.ok) return a.error;
          move = { valueCents: a.value };
        } else return toolError("quantity_or_amount_required");
        body = { effectiveDate: args.date, move, to, ...note };
      }

      const before = await entries(c, b, assetId);
      const r = await c.dispatch({
        method: "POST",
        path: `${base(b)}/${assetId}/${args.side}`,
        budgetId: b,
        body,
      });
      if (!r.ok) return fromDispatch(r);
      const effects = await addedEntries(c, b, assetId, before, r);
      return {
        result: { asset_id: assetId, ...(r.body as Record<string, unknown>) },
        effects,
        ...(ccy ? { currency: ccy } : {}),
      };
    },
  );

  writeTool(
    server,
    ctx,
    "update_holding_value",
    {
      description:
        "Set the current value of a hand-valued asset (savings, real estate, possession…) with " +
        "`value`, or the price per unit of a hand-priced quantity asset with `unit_price`, in the " +
        "asset's currency. " + SAME_AS_APP,
      inputSchema: z.object({
        budget_id: budgetId,
        asset_id: z.uuid(),
        value: decimal.optional(),
        unit_price: decimal.optional(),
      }),
      annotations: { destructiveHint: true, idempotentHint: true },
      entryCount: () => 1,
    },
    async ({ budget_id: b, asset_id, value, unit_price }, c) => {
      if (!value === !unit_price) return toolError("value_or_unit_price_required");
      const v = cents((value ?? unit_price)!, value ? "value" : "unit_price");
      if (!v.ok) return v.error;
      const before = await entries(c, b, asset_id);
      const r = await c.dispatch({
        method: "PATCH",
        path: `${base(b)}/${asset_id}`,
        budgetId: b,
        body: value ? { currentValueCents: v.value } : { currentPriceCents: v.value },
      });
      if (!r.ok) return fromDispatch(r);
      const effects = await addedEntries(c, b, asset_id, before, r);
      const holding = r.body as Record<string, unknown> & { currentPriceCurrency?: string };
      return { result: { holding }, effects, ...(holding.currentPriceCurrency ? { currency: holding.currentPriceCurrency } : {}) };
    },
  );

  writeTool(
    server,
    ctx,
    "delete_investment_entry",
    {
      description:
        "Delete an asset's newest entry, exactly like the app: only the newest entry can be " +
        "deleted, and a sale into a wallet takes the money back out of it.",
      inputSchema: z.object({ budget_id: budgetId, asset_id: z.uuid(), entry_id: z.uuid() }),
      annotations: { destructiveHint: true, idempotentHint: false },
      entryCount: () => 1,
    },
    async ({ budget_id: b, asset_id, entry_id }, c) => {
      const before = (await entries(c, b, asset_id)).find((e) => e.id === entry_id);
      if (!before) return toolError("not_found");
      const r = await c.dispatch({ method: "DELETE", path: `${base(b)}/entries/${entry_id}`, budgetId: b });
      if (!r.ok) return fromDispatch(r);
      return {
        result: { deleted: entry_id, ...(r.body as Record<string, unknown>) },
        effects: [
          {
            tenantId: b,
            entityType: "investment_entry",
            entityId: entry_id,
            op: "delete",
            before: { asset_id, ...before },
            after: null,
            entryCount: 1,
            replayed: r.replayed,
          },
        ],
      };
    },
  );
}
