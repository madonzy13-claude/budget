import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { toMinorUnits } from "../money";
import type { DispatchResult } from "../dispatch";
import {
  writeTool,
  toolError,
  fromDispatch,
  type McpCtx,
  type WriteCtx,
  type WriteEffect,
  type WriteOutcome,
} from "./define";

/**
 * Scheduled payment + task write tools — thin dispatches over the routes the
 * app uses. The user calls a not-yet-confirmed occurrence an "unconfirmed
 * scheduled payment"; the route's draftId is never shown to the agent.
 */
const budgetId = z.uuid().describe("A budget_id from list_budgets");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const amount = z.string().regex(/^\d+(\.\d{1,4})?$/).describe('Decimal string, e.g. "29.99"');
const SAME_AS_APP = "The change looks exactly like one the user made in the app.";

type Rule = { id: string } & Record<string, unknown>;

const rulesPath = (b: string) => `/budgets/${b}/scheduled-payments`;

async function findRule(c: WriteCtx, b: string, id: string): Promise<Rule | null> {
  const r = await c.dispatch({ method: "GET", path: rulesPath(b), budgetId: b });
  return r.ok ? ((r.body as { rules: Rule[] }).rules.find((x) => x.id === id) ?? null) : null;
}

function effect(
  r: DispatchResult,
  e: Omit<WriteEffect, "entryCount" | "replayed">,
): WriteEffect {
  return { ...e, entryCount: 1, replayed: r.replayed };
}

const cadenceFields = {
  cadence: z.enum(["ONCE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  weekly_dow: z.number().int().min(0).max(6).optional().describe("WEEKLY: 0 = Sunday"),
  cadence_anchor: z.number().int().min(1).max(31).optional().describe("MONTHLY/YEARLY: day of month"),
  yearly_month: z.number().int().min(1).max(12).optional().describe("YEARLY: month"),
};

/** One scheduled payment — also an import_preview row (15-16). */
export const scheduledPaymentRow = z.object({
  category_id: z.uuid().nullable().optional(),
  amount,
  currency: z.string().regex(/^[A-Z0-9]{3,5}$/),
  note: z.string().max(500).nullable().optional(),
  first_due_date: date,
  end_date: date.nullable().optional(),
  ...cadenceFields,
});

/** create_scheduled_payment's write, also an import row (15-20). */
export async function createScheduledPayment(
  c: WriteCtx,
  b: string,
  body: z.infer<typeof scheduledPaymentRow>,
  idempotencyKey?: string,
): Promise<WriteOutcome> {
  const r = await c.dispatch({
    method: "POST",
    path: rulesPath(b),
    budgetId: b,
    body,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });
  if (!r.ok) return fromDispatch(r);
  const id = (r.body as { ruleId: string }).ruleId;
  const made = (await findRule(c, b, id)) ?? { id };
  return {
    result: { scheduled_payment: made },
    effects: [
      effect(r, { tenantId: b, entityType: "scheduled_payment", entityId: id, op: "create", before: null, after: made }),
    ],
    currency: body.currency,
  };
}

export function registerPlanningWriteTools(server: McpServer, ctx: McpCtx): void {
  writeTool(
    server,
    ctx,
    "create_scheduled_payment",
    {
      description:
        "Create a scheduled payment (a bill or subscription that repeats, or a one-time one). " +
        SAME_AS_APP,
      inputSchema: scheduledPaymentRow.extend({ budget_id: budgetId }),
      annotations: { destructiveHint: false, idempotentHint: false },
      entryCount: () => 1,
    },
    ({ budget_id: b, ...body }, c) => createScheduledPayment(c, b, body),
  );

  writeTool(
    server,
    ctx,
    "edit_scheduled_payment",
    {
      description:
        "Change a scheduled payment. By default the change applies from now on; set " +
        "apply_to_future false to change only the next one. " + SAME_AS_APP,
      inputSchema: z.object({
        budget_id: budgetId,
        scheduled_payment_id: z.uuid(),
        changes: z.object({
          amount: amount.optional(),
          currency: z.string().regex(/^[A-Z0-9]{3,5}$/).optional(),
          category_id: z.uuid().nullable().optional(),
          note: z.string().max(500).nullable().optional(),
          active: z.boolean().optional(),
          cadence: cadenceFields.cadence.optional(),
          weekly_dow: cadenceFields.weekly_dow,
          cadence_anchor: cadenceFields.cadence_anchor,
          yearly_month: cadenceFields.yearly_month,
          next_due_date: date.optional().describe("One-time payments only: its date"),
          end_date: date.nullable().optional(),
        }),
        apply_to_future: z.boolean().default(true),
      }),
      annotations: { destructiveHint: false, idempotentHint: true },
      entryCount: () => 1,
    },
    async ({ budget_id: b, scheduled_payment_id: id, changes: ch, apply_to_future }, c) => {
      const before = await findRule(c, b, id);
      if (!before) return toolError("not_found");
      const edits = Object.fromEntries(
        Object.entries({
          amount: ch.amount,
          currency: ch.currency,
          categoryId: ch.category_id,
          note: ch.note,
          active: ch.active,
          cadence: ch.cadence,
          weeklyDow: ch.weekly_dow,
          cadenceAnchor: ch.cadence_anchor,
          yearlyMonth: ch.yearly_month,
          nextDueDate: ch.next_due_date,
          endDate: ch.end_date,
        }).filter(([, v]) => v !== undefined),
      );
      if (Object.keys(edits).length === 0) return toolError("nothing_to_change");
      const r = await c.dispatch({
        method: "PATCH",
        path: `${rulesPath(b)}/${id}`,
        budgetId: b,
        body: { edits, applyToFuture: apply_to_future },
      });
      if (!r.ok) return fromDispatch(r);
      const after = (await findRule(c, b, id)) ?? (r.body as Rule);
      return {
        result: { scheduled_payment: after },
        effects: [effect(r, { tenantId: b, entityType: "scheduled_payment", entityId: id, op: "update", before, after })],
      };
    },
  );

  writeTool(
    server,
    ctx,
    "delete_scheduled_payment",
    {
      description: "Delete a scheduled payment, the same way the app's delete does. " + SAME_AS_APP,
      inputSchema: z.object({ budget_id: budgetId, scheduled_payment_id: z.uuid() }),
      annotations: { destructiveHint: true, idempotentHint: true },
      entryCount: () => 1,
    },
    async ({ budget_id: b, scheduled_payment_id: id }, c) => {
      const before = await findRule(c, b, id);
      if (!before) return toolError("not_found");
      const r = await c.dispatch({ method: "DELETE", path: `${rulesPath(b)}/${id}`, budgetId: b });
      if (!r.ok) return fromDispatch(r);
      return {
        result: { deleted: id },
        effects: [effect(r, { tenantId: b, entityType: "scheduled_payment", entityId: id, op: "delete", before, after: null })],
      };
    },
  );

  writeTool(
    server,
    ctx,
    "confirm_scheduled_payment",
    {
      description:
        "Confirm an unconfirmed scheduled payment (an occurrence waiting for the user's OK), " +
        "optionally with the amount actually paid. It then counts as a spending. " + SAME_AS_APP,
      inputSchema: z.object({
        budget_id: budgetId,
        occurrence_id: z.uuid().describe("The occurrence's id, as list tools return it"),
        amount: amount.optional().describe("What was actually paid, if different"),
      }),
      annotations: { destructiveHint: false, idempotentHint: false },
      entryCount: () => 1,
    },
    async ({ budget_id: b, occurrence_id: id, amount: paid }, c) => {
      const txnPath = `/budgets/${b}/transactions/${id}`;
      const read = async () => {
        const r = await c.dispatch({ method: "GET", path: txnPath, budgetId: b });
        return r.ok ? (r.body as { transaction: Record<string, unknown> }).transaction : null;
      };
      const before = await read();
      let body = {};
      if (paid) {
        const cents = toMinorUnits(paid, "EUR");
        if (cents.isErr()) return toolError(cents.error);
        body = { amount_override_cents: cents.value };
      }
      const r = await c.dispatch({
        method: "POST",
        path: `${rulesPath(b)}/drafts/${id}/confirm`,
        budgetId: b,
        body,
      });
      if (!r.ok) {
        const e = fromDispatch(r);
        // The route's codes say "draft"; the user never hears that word.
        e.content[0]!.text = e.content[0]!.text.replace(/draft/gi, "occurrence");
        return e;
      }
      const after = await read();
      return {
        result: { confirmed: id, transaction: after },
        effects: [effect(r, { tenantId: b, entityType: "transaction", entityId: id, op: "update", before, after })],
      };
    },
  );

  writeTool(
    server,
    ctx,
    "complete_task",
    {
      description: "Mark one of the user's tasks as done, like the app's task action. " + SAME_AS_APP,
      inputSchema: z.object({ budget_id: budgetId, task_id: z.uuid() }),
      annotations: { destructiveHint: false, idempotentHint: true },
      entryCount: () => 1,
    },
    async ({ budget_id: b, task_id: id }, c) => {
      const list = await c.dispatch({
        method: "GET",
        path: `/budgets/${b}/tasks`,
        budgetId: b,
        query: { status: "pending" },
      });
      const before = list.ok
        ? ((list.body as { tasks: Array<{ id: string }> }).tasks.find((t) => t.id === id) ?? null)
        : null;
      if (!before) return toolError("not_found");
      const r = await c.dispatch({ method: "POST", path: `/budgets/${b}/tasks/${id}/resolve`, budgetId: b });
      if (!r.ok) return fromDispatch(r);
      return {
        result: { completed: id },
        effects: [
          effect(r, {
            tenantId: b,
            entityType: "task",
            entityId: id,
            op: "update",
            before,
            after: { ...before, status: "RESOLVED" },
          }),
        ],
      };
    },
  );
}
