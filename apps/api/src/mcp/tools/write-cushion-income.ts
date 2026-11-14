import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { dispatch, type DispatchOptions } from "../dispatch";
import { present } from "./present";
import {
  readTool,
  writeTool,
  toolOk,
  toolError,
  fromDispatch,
  untrusted,
  type McpCtx,
  type ToolResult,
  type WriteEffect,
} from "./define";
import type { DispatchResult } from "../dispatch";

/**
 * Cushion settings + incomes (15-18 UAT) — thin dispatches over the routes the
 * Settings screen uses. Cushion settings are owner-only there (403), so they
 * are here too; any member reads both.
 */
const budgetId = z.uuid().describe("A budget_id from list_budgets");
const amount = z.string().regex(/^\d+(\.\d{1,4})?$/).describe('Decimal string, e.g. "5000.00"');
const currency = z.string().regex(/^[A-Z0-9]{3,5}$/);
const SAME_AS_APP = "The change looks exactly like one the user made in the app.";

type Send = (opts: DispatchOptions) => Promise<DispatchResult>;

export interface CushionSettings {
  enabled: boolean;
  spend_from_cushion: boolean;
  target_months: number;
}

/** The three cushion settings as the Settings screen shows them. */
export async function cushionSettings(send: Send, b: string): Promise<CushionSettings | DispatchResult> {
  const [budget, summary] = await Promise.all([
    send({ method: "GET", path: `/budgets/${b}`, budgetId: b }),
    send({ method: "GET", path: `/budgets/${b}/cushion-summary`, budgetId: b }),
  ]);
  if (!budget.ok) return budget;
  if (!summary.ok) return summary;
  const bb = budget.body as { cushionEnabled?: boolean; cushionModeEnabled?: boolean };
  return {
    enabled: bb.cushionEnabled ?? true,
    spend_from_cushion: bb.cushionModeEnabled ?? false,
    target_months: Number((summary.body as { target_months?: number }).target_months ?? 6),
  };
}

/** The PATCH /budgets/:id body that sets `s`. */
export const cushionPatch = (s: Partial<CushionSettings>) => ({
  ...(s.enabled !== undefined ? { cushion_enabled: s.enabled } : {}),
  ...(s.spend_from_cushion !== undefined ? { cushion_mode_enabled: s.spend_from_cushion } : {}),
  ...(s.target_months !== undefined ? { cushion_target_months: s.target_months } : {}),
});

const isSettings = (v: CushionSettings | DispatchResult): v is CushionSettings => "enabled" in v;

export interface Income {
  id: string;
  name: string;
  amount: string;
  currency: string;
  cadence: "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  cadenceAnchor: number | null;
  weeklyDow: number | null;
  yearlyMonth: number | null;
  onceDate: string | null;
}

const incomesPath = (b: string) => `/budgets/${b}/incomes`;
// 261111 (user): incomes are the owner's to change, as in the app.
const OWNER_ONLY = " Only the budget's owner can change incomes.";
const incomeRefused = (r: DispatchResult) =>
  r.status === 403
    ? toolError("owner_only", { message: OWNER_ONLY.trim() })
    : fromDispatch(r);

export async function findIncome(send: Send, b: string, id: string): Promise<Income | null> {
  const r = await send({ method: "GET", path: incomesPath(b), budgetId: b });
  return r.ok ? ((r.body as { incomes: Income[] }).incomes.find((i) => i.id === id) ?? null) : null;
}

/** An income DTO as the route's create/update body (cadence fields only where they apply). */
export function incomeBody(i: Omit<Income, "id">): Record<string, unknown> {
  return {
    name: i.name,
    amount: i.amount,
    currency: i.currency,
    cadence: i.cadence,
    ...(i.cadence === "WEEKLY" ? { weekly_dow: i.weeklyDow } : {}),
    ...(i.cadence === "MONTHLY" || i.cadence === "YEARLY" ? { cadence_anchor: i.cadenceAnchor } : {}),
    ...(i.cadence === "YEARLY" ? { yearly_month: i.yearlyMonth } : {}),
    ...(i.cadence === "ONCE" ? { once_date: i.onceDate } : {}),
  };
}

// The column keeps 4 decimals; show "5000.00", not "5000.0000".
const shown = (i: Income) => ({
  ...i,
  name: untrusted(i.name),
  amount: i.amount.replace(/(\.\d{2}\d*?)0+$/, "$1"),
});

const cadenceFields = {
  cadence: z.enum(["ONCE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  weekly_dow: z.number().int().min(0).max(6).optional().describe("WEEKLY: 0 = Sunday"),
  cadence_anchor: z.number().int().min(1).max(31).optional().describe("MONTHLY/YEARLY: day of month"),
  yearly_month: z.number().int().min(1).max(12).optional().describe("YEARLY: month"),
  once_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("ONCE: the day it arrives"),
};

function effect(r: DispatchResult, e: Omit<WriteEffect, "entryCount" | "replayed">): WriteEffect {
  return { ...e, entryCount: 1, replayed: r.replayed };
}

export function registerCushionIncomeTools(server: McpServer, ctx: McpCtx): void {
  const read: Send = (opts) => dispatch(ctx.app, ctx.who, opts);

  readTool(
    server,
    ctx,
    "get_cushion",
    {
      description:
        "The budget's cushion: whether it is on, whether spending comes from it this month " +
        "(spend_from_cushion), the target in months of cushion limits, and how much is saved vs needed.",
      inputSchema: z.object({ budget_id: budgetId }),
    },
    async ({ budget_id: b }): Promise<ToolResult> => {
      const s = await cushionSettings(read, b);
      if (!isSettings(s)) return fromDispatch(s);
      const [summary, budget] = await Promise.all([
        read({ method: "GET", path: `/budgets/${b}/cushion-summary`, budgetId: b }),
        read({ method: "GET", path: `/budgets/${b}`, budgetId: b }),
      ]);
      const ccy = (budget.body as { defaultCurrency?: string }).defaultCurrency ?? "EUR";
      return toolOk({ ...s, summary: present(summary.body, { fallbackCurrency: ccy }) });
    },
  );

  readTool(
    server,
    ctx,
    "list_incomes",
    {
      description: "The budget's incomes (salary and other money coming in) with amount, currency and cadence.",
      inputSchema: z.object({ budget_id: budgetId }),
    },
    async ({ budget_id: b }): Promise<ToolResult> => {
      const r = await read({ method: "GET", path: incomesPath(b), budgetId: b });
      if (!r.ok) return fromDispatch(r);
      return toolOk({ incomes: (r.body as { incomes: Income[] }).incomes.map(shown) });
    },
  );

  writeTool(
    server,
    ctx,
    "set_cushion",
    {
      description:
        "Change the budget's cushion settings (owner only): enabled turns the cushion on or off; " +
        "target_months is how many months of cushion limits to keep saved; spend_from_cushion " +
        "switches the budget to spending from the cushion. Pass only what changes. " + SAME_AS_APP,
      inputSchema: z.object({
        budget_id: budgetId,
        enabled: z.boolean().optional(),
        target_months: z.number().min(1).max(60).optional(),
        spend_from_cushion: z.boolean().optional(),
      }),
      annotations: { destructiveHint: false, idempotentHint: true },
      entryCount: () => 1,
    },
    async ({ budget_id: b, ...change }, c) => {
      const body = cushionPatch(change);
      if (Object.keys(body).length === 0) return toolError("nothing_to_change");
      const before = await cushionSettings(c.dispatch, b);
      if (!isSettings(before)) return fromDispatch(before);
      const r = await c.dispatch({ method: "PATCH", path: `/budgets/${b}`, budgetId: b, body });
      if (r.status === 403)
        return toolError("owner_only", { message: "Only the budget's owner can change the cushion settings." });
      if (!r.ok) return fromDispatch(r);
      const after = await cushionSettings(c.dispatch, b);
      const now = isSettings(after) ? after : { ...before, ...change };
      return {
        result: { cushion: now },
        effects: [effect(r, { tenantId: b, entityType: "cushion_settings", entityId: b, op: "update", before: { ...before }, after: { ...now } })],
      };
    },
  );

  writeTool(
    server,
    ctx,
    "edit_budget",
    {
      description:
        "Rename a budget or change its currency. Any member can rename; the new name is the " +
        "caller's own label, as in the app. Only the owner can change the currency; totals are " +
        "then shown in it, while every amount keeps the currency it was entered in. " + SAME_AS_APP,
      inputSchema: z.object({
        budget_id: budgetId,
        name: z.string().min(1).max(80).optional(),
        currency: z.string().length(3).optional(),
      }),
      annotations: { destructiveHint: false, idempotentHint: true },
      entryCount: () => 1,
    },
    async ({ budget_id: b, name, currency: ccy }, c) => {
      if (name === undefined && ccy === undefined) return toolError("nothing_to_change");
      const now = async () => {
        const r = await c.dispatch({ method: "GET", path: `/budgets/${b}`, budgetId: b });
        const v = r.body as { name: string; defaultCurrency: string; currentUserRole?: string };
        return r.ok ? { name: v.name, currency: v.defaultCurrency, role: v.currentUserRole } : null;
      };
      const before = await now();
      if (!before) return toolError("not_found");
      // Refuse before the rename lands, so a half-done call never happens.
      if (ccy !== undefined && before.role !== "owner")
        return toolError("owner_only", { message: "Only the budget's owner can change its currency." });
      const r = await c.dispatch({
        method: "PATCH",
        path: `/budgets/${b}`,
        budgetId: b,
        body: { ...(name !== undefined ? { name } : {}), ...(ccy !== undefined ? { default_currency: ccy.toUpperCase() } : {}) },
      });
      if (!r.ok) return fromDispatch(r);
      const after = (await now()) ?? before;
      const snap = (v: typeof before) => ({ name: v.name, currency: v.currency });
      return {
        result: { budget: { name: untrusted(after.name), currency: after.currency } },
        effects: [effect(r, { tenantId: b, entityType: "budget_identity", entityId: b, op: "update", before: snap(before), after: snap(after) })],
      };
    },
  );

  writeTool(
    server,
    ctx,
    "add_income",
    {
      description:
        "Add an income (salary, rent received…), repeating or one-time. Pass the amount in the " +
        "currency the user said." + OWNER_ONLY + " " + SAME_AS_APP,
      inputSchema: z.object({ budget_id: budgetId, name: z.string().min(1).max(120), amount, currency, ...cadenceFields }),
      annotations: { destructiveHint: false, idempotentHint: false },
      entryCount: () => 1,
    },
    async ({ budget_id: b, ...i }, c) => {
      const r = await c.dispatch({ method: "POST", path: incomesPath(b), budgetId: b, body: i });
      if (!r.ok) return incomeRefused(r);
      const made = (await findIncome(c.dispatch, b, (r.body as Income).id)) ?? (r.body as Income);
      return {
        result: { income: shown(made) },
        effects: [effect(r, { tenantId: b, entityType: "income", entityId: made.id, op: "create", before: null, after: { ...made } })],
        currency: made.currency,
      };
    },
  );

  writeTool(
    server,
    ctx,
    "edit_income",
    {
      description: "Change an income; pass only what changes." + OWNER_ONLY + " " + SAME_AS_APP,
      inputSchema: z.object({
        budget_id: budgetId,
        income_id: z.uuid(),
        changes: z.object({
          name: z.string().min(1).max(120).optional(),
          amount: amount.optional(),
          currency: currency.optional(),
          cadence: cadenceFields.cadence.optional(),
          weekly_dow: cadenceFields.weekly_dow,
          cadence_anchor: cadenceFields.cadence_anchor,
          yearly_month: cadenceFields.yearly_month,
          once_date: cadenceFields.once_date,
        }),
      }),
      annotations: { destructiveHint: false, idempotentHint: true },
      entryCount: () => 1,
    },
    async ({ budget_id: b, income_id: id, changes: ch }, c) => {
      const before = await findIncome(c.dispatch, b, id);
      if (!before) return toolError("not_found");
      const merged: Income = {
        ...before,
        ...(ch.name !== undefined ? { name: ch.name } : {}),
        ...(ch.amount !== undefined ? { amount: ch.amount } : {}),
        ...(ch.currency !== undefined ? { currency: ch.currency } : {}),
        ...(ch.cadence !== undefined ? { cadence: ch.cadence } : {}),
        ...(ch.weekly_dow !== undefined ? { weeklyDow: ch.weekly_dow } : {}),
        ...(ch.cadence_anchor !== undefined ? { cadenceAnchor: ch.cadence_anchor } : {}),
        ...(ch.yearly_month !== undefined ? { yearlyMonth: ch.yearly_month } : {}),
        ...(ch.once_date !== undefined ? { onceDate: ch.once_date } : {}),
      };
      const r = await c.dispatch({ method: "PATCH", path: `${incomesPath(b)}/${id}`, budgetId: b, body: incomeBody(merged) });
      if (!r.ok) return incomeRefused(r);
      const after = (await findIncome(c.dispatch, b, id)) ?? merged;
      return {
        result: { income: shown(after) },
        effects: [effect(r, { tenantId: b, entityType: "income", entityId: id, op: "update", before: { ...before }, after: { ...after } })],
        currency: after.currency,
      };
    },
  );

  writeTool(
    server,
    ctx,
    "delete_income",
    {
      description: "Delete an income, the same way the app's delete does." + OWNER_ONLY + " " + SAME_AS_APP,
      inputSchema: z.object({ budget_id: budgetId, income_id: z.uuid() }),
      annotations: { destructiveHint: true, idempotentHint: true },
      entryCount: () => 1,
    },
    async ({ budget_id: b, income_id: id }, c) => {
      const before = await findIncome(c.dispatch, b, id);
      if (!before) return toolError("not_found");
      const r = await c.dispatch({ method: "DELETE", path: `${incomesPath(b)}/${id}`, budgetId: b });
      if (!r.ok) return incomeRefused(r);
      return {
        result: { deleted: id },
        effects: [effect(r, { tenantId: b, entityType: "income", entityId: id, op: "delete", before: { ...before }, after: null })],
      };
    },
  );
}
