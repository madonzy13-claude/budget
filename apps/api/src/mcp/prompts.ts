import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { MCP_LIMITS } from "./limits";

/**
 * prompts.ts — the guided flows a client can offer (MCP-09). Static,
 * server-authored text with the arguments filled in; they only steer the
 * agent through tools it already has (T-15-67).
 */
const budgetId = z.uuid().describe("A budget_id from list_budgets");

const say = (text: string) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text } }] });

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "monthly_review",
    {
      title: "Monthly review",
      description: "Go through one month of a budget and agree three things to do this week.",
      argsSchema: z.object({
        budget_id: budgetId,
        month: z.string().regex(/^\d{4}-\d{2}$/, "YYYY-MM"),
      }),
    },
    ({ budget_id, month }) =>
      say(
        `Review budget ${budget_id} for ${month}.\n` +
          `1. Call get_budget_overview for the budget, then spending_summary for ${month}.\n` +
          "2. Say plainly how the month went against plan: which categories went over, by how much, " +
          "and whether the reserve or the cushion had to cover it.\n" +
          "3. Call list_tasks and fold the open tasks into the picture.\n" +
          "4. End with exactly 3 concrete actions for this week, each with the amount and the " +
          "category or wallet it is about. Ask before changing anything.",
      ),
  );

  server.registerPrompt(
    "import_spreadsheet",
    {
      title: "Import an old spreadsheet",
      description: "Bring history from a spreadsheet or any file into a budget, checked before anything is saved.",
      argsSchema: z.object({ budget_id: budgetId }),
    },
    ({ budget_id }) =>
      say(
        `Import the file the user gives you into budget ${budget_id}.\n` +
          "1. Read the file whatever its format and turn it into strict JSON rows of ONE kind at a time " +
          "(transactions, category_limits, investment_entries, wallet_balances or scheduled_payments), " +
          `at most ${MCP_LIMITS.maxRowsPerCall} rows per call. Amounts are decimal strings, dates YYYY-MM-DD.\n` +
          "2. Call import_preview. Nothing is saved yet.\n" +
          "3. If it is clean, go on. If not, ask the user only once, in a single message, about every issue it " +
          "lists: duplicates, unknown categories (offer its suggestions), missing exchange rates, bad rows.\n" +
          "4. Never invent a category: map an unknown name to an existing one, or create it only when the " +
          "user says so.\n" +
          "5. Call import_commit with their answers. It saves all rows or none.\n" +
          "6. Tell the user what was added and that import_undo with the batch_id takes the whole import back.",
      ),
  );

  server.registerPrompt(
    "reconcile_wallets",
    {
      title: "Reconcile wallets",
      description: "Bring every wallet's balance in line with what the bank or app shows now.",
      argsSchema: z.object({ budget_id: budgetId }),
    },
    ({ budget_id }) =>
      say(
        `Reconcile the wallets of budget ${budget_id}.\n` +
          "1. Call list_wallets and show each wallet with its balance in the app.\n" +
          "2. Ask the user for the actual balance of each one, all in one message.\n" +
          "3. For every wallet whose balance differs, call sync_wallet_balance with the actual balance.\n" +
          "4. Report each change as old → new with the difference, and the total difference per currency.",
      ),
  );
}
