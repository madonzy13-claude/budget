import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { toMinorUnits } from "../money";
import { MCP_LIMITS } from "../limits";
import { writeTool, toolError, type McpCtx, type WriteEffect } from "./define";

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

type Txn = { id: string; currency_converted?: string };

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
}
