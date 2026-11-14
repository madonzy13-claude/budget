import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { dispatch, type DispatchOptions } from "../dispatch";
import { fromMinorUnits } from "../money";
import { MCP_LIMITS } from "../limits";
import { present } from "./present";
import {
  readTool,
  toolOk,
  toolError,
  fromDispatch,
  untrusted,
  type McpCtx,
  type ToolResult,
} from "./define";

/**
 * Read tools — each a thin dispatch over the route the web app uses, so the
 * agent sees the same numbers the user does (D-23), through one presentation
 * pass (money as decimal strings, user text labelled untrusted).
 */
const budgetId = z.uuid().describe("A budget_id from list_budgets");
const month = z.string().regex(/^\d{4}-\d{2}$/, "YYYY-MM");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const MAX_SUMMARY_MONTHS = 24;

interface ActiveBudget {
  id: string;
  name: string;
  default_currency: string;
  ownerUserId: string;
  investmentsEnabled?: boolean;
}

async function activeBudgets(c: McpCtx): Promise<ActiveBudget[]> {
  const r = await dispatch(c.app, c.who, { method: "GET", path: "/budgets/active" });
  return r.ok ? (r.body as { budgets: ActiveBudget[] }).budgets : [];
}

/** Dispatch one GET and present it; budget currency is the money fallback. */
async function getPresented(
  c: McpCtx,
  opts: Omit<DispatchOptions, "method">,
  currency: string,
): Promise<{ ok: true; data: unknown } | { ok: false; error: ToolResult }> {
  const r = await dispatch(c.app, c.who, { method: "GET", ...opts });
  if (!r.ok) return { ok: false, error: fromDispatch(r) };
  return { ok: true, data: present(r.body, { fallbackCurrency: currency }) };
}

async function currencyOf(c: McpCtx, id: string): Promise<string> {
  return (await activeBudgets(c)).find((b) => b.id === id)?.default_currency ?? "EUR";
}

/** One budget-scoped GET → tool result. */
async function simple(
  c: McpCtx,
  id: string,
  path: string,
  query?: Record<string, string>,
): Promise<ToolResult> {
  const r = await getPresented(
    c,
    { path, budgetId: id, ...(query ? { query } : {}) },
    await currencyOf(c, id),
  );
  if (!r.ok) return r.error;
  return toolOk(
    (r.data && typeof r.data === "object" && !Array.isArray(r.data)
      ? r.data
      : { result: r.data }) as Record<string, unknown>,
  );
}

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
    if (out.length > MAX_SUMMARY_MONTHS) break;
  }
  return out;
}

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
  return { from, to };
}

export function registerReadTools(server: McpServer, ctx: McpCtx): void {
  readTool(
    server,
    ctx,
    "list_budgets",
    {
      description:
        "List every budget the user can access, with its currency and the user's role. Call this first: every other tool takes a budget_id.",
      inputSchema: z.object({}),
    },
    async (_args, c) => {
      const r = await dispatch(c.app, c.who, { method: "GET", path: "/budgets/active" });
      if (!r.ok) return fromDispatch(r);
      return toolOk({
        budgets: (r.body as { budgets: ActiveBudget[] }).budgets.map((b) => ({
          budget_id: b.id,
          name: untrusted(b.name),
          currency: b.default_currency,
          role: b.ownerUserId === c.who.userId ? "owner" : "member",
          // Off: the app hides every investment, and investment writes are refused.
          investments_enabled: b.investmentsEnabled ?? false,
        })),
      });
    },
  );

  readTool(
    server,
    ctx,
    "get_budget_overview",
    {
      description:
        "The Overview tab's numbers for a date range (default: the last 12 months): summary cards, planned vs spent, wealth, cash-flow projection, overspending covered by reserves, and reserve fit.",
      inputSchema: z.object({ budget_id: budgetId, from: date.optional(), to: date.optional() }),
    },
    async (args, c) => {
      const range = { ...defaultRange(), ...(args.from ? { from: args.from } : {}), ...(args.to ? { to: args.to } : {}) };
      const currency = await currencyOf(c, args.budget_id);
      const base = `/budgets/${args.budget_id}/overview`;
      const parts = {
        cards: { path: `${base}/cards` },
        planned: { path: `${base}/planned`, query: range },
        wealth: { path: `${base}/wealth`, query: range },
        projection: { path: `${base}/projection` },
        overspent_reserves: { path: `${base}/overspent-reserves`, query: range },
        reserve_fit: { path: `${base}/reserve-fit`, query: range },
      } as const;
      const results = await Promise.all(
        Object.entries(parts).map(async ([k, o]) => [
          k,
          await getPresented(c, { ...o, budgetId: args.budget_id }, currency),
        ] as const),
      );
      const failed = results.find(([, r]) => !r.ok);
      if (failed && !failed[1].ok) return failed[1].error;
      return toolOk({
        from: range.from,
        to: range.to,
        ...Object.fromEntries(results.map(([k, r]) => [k, r.ok ? r.data : null])),
      });
    },
  );

  readTool(
    server,
    ctx,
    "list_categories",
    {
      description:
        "List the budget's spending categories (id, name, currency, archived). Use spending_summary for limits and spending per month.",
      inputSchema: z.object({ budget_id: budgetId }),
    },
    async (args, c) => simple(c, args.budget_id, `/budgets/${args.budget_id}/categories`),
  );

  readTool(
    server,
    ctx,
    "search_transactions",
    {
      description: `Search spendings and incomes over the budget's full history, newest first, ${MCP_LIMITS.searchPageSize} per page. Pass next_cursor back as cursor for the next page. Negative spending amounts are refunds; confirmed_at null means an unconfirmed scheduled payment.`,
      inputSchema: z.object({
        budget_id: budgetId,
        from: date.optional(),
        to: date.optional(),
        category_id: z.uuid().optional(),
        kind: z.enum(["SPENDING", "INCOME"]).optional(),
        q: z.string().max(200).optional().describe("Text to find in notes"),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(MCP_LIMITS.searchPageSize).optional(),
      }),
    },
    async (args, c) => {
      const { budget_id, limit, ...rest } = args;
      const query = Object.fromEntries(
        Object.entries({ ...rest, ...(limit ? { limit: String(limit) } : {}) }).filter(
          ([, v]) => v !== undefined,
        ),
      ) as Record<string, string>;
      return simple(c, budget_id, `/budgets/${budget_id}/transactions/search`, query);
    },
  );

  readTool(
    server,
    ctx,
    "spending_summary",
    {
      description: `Planned and spent totals between two months (inclusive, at most ${MAX_SUMMARY_MONTHS} months), grouped by category or by month, in the budget's currency.`,
      inputSchema: z.object({
        budget_id: budgetId,
        from_month: month,
        to_month: month,
        group_by: z.enum(["category", "month"]),
      }),
    },
    async (args, c) => {
      if (args.from_month > args.to_month) return toolError("from_after_to");
      const months = monthsBetween(args.from_month, args.to_month);
      if (months.length > MAX_SUMMARY_MONTHS)
        return toolError("range_too_large", { max_months: MAX_SUMMARY_MONTHS });

      type Cat = { categoryId: string; name: string; plannedCents: string; spentCents: string };
      type Summary = { budgetCurrency: string; categories: Cat[] };
      const byKey = new Map<string, { name?: string; planned: bigint; spent: bigint }>();
      let currency = "EUR";
      // ponytail: sequential per-month GETs, capped at 24; add a range route if agents find it slow.
      for (const m of months) {
        const r = await dispatch(c.app, c.who, {
          method: "GET",
          path: `/budgets/${args.budget_id}/spendings-summary`,
          budgetId: args.budget_id,
          query: { month: m },
        });
        if (!r.ok) return fromDispatch(r);
        const s = r.body as Summary;
        currency = s.budgetCurrency;
        for (const cat of s.categories) {
          const key = args.group_by === "category" ? cat.categoryId : m;
          const acc = byKey.get(key) ?? { name: cat.name, planned: 0n, spent: 0n };
          acc.planned += BigInt(cat.plannedCents);
          acc.spent += BigInt(cat.spentCents);
          byKey.set(key, acc);
        }
      }
      const rows = [...byKey.entries()].map(([key, v]) =>
        args.group_by === "category"
          ? {
              category_id: key,
              name: untrusted(v.name),
              planned: fromMinorUnits(v.planned.toString(), currency),
              spent: fromMinorUnits(v.spent.toString(), currency),
            }
          : {
              month: key,
              planned: fromMinorUnits(v.planned.toString(), currency),
              spent: fromMinorUnits(v.spent.toString(), currency),
            },
      );
      return toolOk({
        from_month: args.from_month,
        to_month: args.to_month,
        group_by: args.group_by,
        currency,
        rows,
      });
    },
  );

  readTool(
    server,
    ctx,
    "get_reserves",
    {
      description:
        "Each category's reserve: what was set aside, used and still available.",
      inputSchema: z.object({ budget_id: budgetId }),
    },
    async (args, c) => simple(c, args.budget_id, `/budgets/${args.budget_id}/reserves`),
  );

  readTool(
    server,
    ctx,
    "get_projection",
    {
      description:
        "The day-by-day cash-flow projection the Overview shows: expected balance, scheduled payments and when money runs short.",
      inputSchema: z.object({
        budget_id: budgetId,
        days: z.number().int().min(30).max(730).optional(),
      }),
    },
    async (args, c) =>
      simple(
        c,
        args.budget_id,
        `/budgets/${args.budget_id}/overview/projection`,
        args.days ? { days: String(args.days) } : undefined,
      ),
  );

  readTool(
    server,
    ctx,
    "list_tasks",
    {
      description:
        "The Tasks queue: what the family should do now to keep budget, reserve and cushion healthy.",
      inputSchema: z.object({ budget_id: budgetId }),
    },
    async (args, c) =>
      simple(c, args.budget_id, `/budgets/${args.budget_id}/tasks`, { status: "pending" }),
  );

  readTool(
    server,
    ctx,
    "list_wallets",
    {
      description: "Wallets (accounts) with their current balances.",
      inputSchema: z.object({ budget_id: budgetId }),
    },
    async (args, c) => simple(c, args.budget_id, "/wallets"),
  );

  readTool(
    server,
    ctx,
    "list_investments",
    {
      description:
        "Investment assets with value, cost and profit, plus per-type totals. Pass asset_id to get that asset's buy/sell/transfer history instead.",
      inputSchema: z.object({ budget_id: budgetId, asset_id: z.uuid().optional() }),
    },
    async (args, c) => {
      const base = `/budgets/${args.budget_id}/investments`;
      if (args.asset_id) return simple(c, args.budget_id, `${base}/${args.asset_id}/entries`);
      const currency = await currencyOf(c, args.budget_id);
      const [holdings, types] = await Promise.all([
        getPresented(c, { path: base, budgetId: args.budget_id }, currency),
        getPresented(c, { path: `${base}/type-summary`, budgetId: args.budget_id }, currency),
      ]);
      if (!holdings.ok) return holdings.error;
      if (!types.ok) return types.error;
      return toolOk({ holdings: holdings.data, type_summary: types.data });
    },
  );

  readTool(
    server,
    ctx,
    "list_scheduled_payments",
    {
      description:
        "Scheduled payments (bills and recurring incomes) with cadence and next due date. Each due payment shows up as an unconfirmed scheduled payment until the user confirms it.",
      inputSchema: z.object({ budget_id: budgetId }),
    },
    async (args, c) =>
      simple(c, args.budget_id, `/budgets/${args.budget_id}/scheduled-payments`),
  );
}
