/**
 * registry.test.ts — 15-07 safety net for the MCP tool surface.
 *
 * Every tool must be on the allowlist below, read tools must say so, and no
 * tool may open an outbound channel or touch excluded-by-design areas
 * (email/push/share/members/sessions/raw SQL). Later plans append to
 * TOOL_ALLOWLIST and READ_TOOLS here, in the same place.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import {
  setupMcpTestEnv,
  testApp,
  signUpTestUser,
  mintMcpToken,
  createSdkClient,
} from "./helpers";

export const READ_TOOLS = [
  "list_budgets",
  "get_budget_overview",
  "list_categories",
  "search_transactions",
  "spending_summary",
  "get_reserves",
  "get_projection",
  "list_tasks",
  "list_wallets",
  "list_investments",
  "list_scheduled_payments",
  "list_recent_writes",
  "get_cushion",
  "list_incomes",
];
export const WRITE_TOOLS = [
  "add_transactions",
  "edit_transaction",
  "delete_transaction",
  "sync_wallet_balance",
  "set_category_limit",
  "create_category",
  "rename_category",
  "archive_category",
  "budget_create",
  "record_investment_transaction",
  "update_holding_value",
  "delete_investment_entry",
  "create_scheduled_payment",
  "edit_scheduled_payment",
  "delete_scheduled_payment",
  "confirm_scheduled_payment",
  "complete_task",
  "undo",
  "import_preview",
  "import_commit",
  "import_undo",
  "set_cushion",
  "add_income",
  "edit_income",
  "delete_income",
  "edit_budget",
];
const DESTRUCTIVE = [
  "delete_transaction",
  "sync_wallet_balance",
  "archive_category",
  "update_holding_value",
  "delete_investment_entry",
  "delete_scheduled_payment",
  "delete_income",
  "undo",
  "import_commit",
  "import_undo",
];
export const TOOL_ALLOWLIST = [...READ_TOOLS, ...WRITE_TOOLS];

const FORBIDDEN =
  /email|push|notify|share|webhook|url|fetch|http|sql|query|export|invite|member|password|session|delete_account/i;
const FORBIDDEN_EXCEPTIONS = new Set(["search_transactions"]);

await setupMcpTestEnv();

let instructions: string | undefined;
let tools: Array<{
  name: string;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
}>;
beforeAll(async () => {
  const app = await testApp();
  const user = await signUpTestUser(app);
  const { accessToken } = await mintMcpToken(app, user, ["read", "write"]);
  const client = await createSdkClient(app, accessToken);
  tools = (await client.listTools()).tools;
  instructions = client.getInstructions();
});

describe("MCP tool registry", () => {
  it("registers exactly the allowlisted tools", () => {
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_ALLOWLIST].sort());
  });

  it("exposes no outbound or excluded-by-design tool", () => {
    const bad = tools
      .map((t) => t.name)
      .filter((n) => FORBIDDEN.test(n) && !FORBIDDEN_EXCEPTIONS.has(n));
    expect(bad).toEqual([]);
  });

  it("marks read tools read-only and nothing else", () => {
    for (const t of tools) {
      expect(`${t.name}:${t.annotations?.readOnlyHint === true}`).toBe(
        `${t.name}:${READ_TOOLS.includes(t.name)}`,
      );
    }
  });

  it("marks the destructive writes destructive", () => {
    const flagged = tools
      .filter((t) => t.annotations?.destructiveHint === true)
      .map((t) => t.name)
      .sort();
    expect(flagged).toEqual([...DESTRUCTIVE].sort());
  });

  // 15-18 UAT: Claude turned "1 500 000 UAH" into zł on its own. Amounts go in
  // the currency the user said; converting is the user's call, not Claude's.
  it("tells the assistant never to convert an amount on its own", () => {
    expect(instructions).toContain("Never convert an amount to another currency yourself");
  });
});
