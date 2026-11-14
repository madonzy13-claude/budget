/**
 * prompts.test.ts — 15-17 (MCP-09): three guided flows a client can offer —
 * monthly review, import an old spreadsheet, reconcile wallets.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { setupMcpTestEnv, testApp, signUpTestUser, mintMcpToken, createSdkClient } from "./helpers";

await setupMcpTestEnv();

let client: Awaited<ReturnType<typeof createSdkClient>>;
const B = "7b0e0c4e-1111-4222-8333-944444444444";

beforeAll(async () => {
  const app = await testApp();
  const a = await signUpTestUser(app);
  client = await createSdkClient(app, (await mintMcpToken(app, a, ["read"])).accessToken);
}, 30_000);

const text = async (name: string, args: Record<string, string>) =>
  ((await client.getPrompt({ name, arguments: args })).messages as Array<{ content: { text: string } }>)
    .map((m) => m.content.text)
    .join("\n");

describe("prompts", () => {
  it("offers exactly the three flows", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual(["import_spreadsheet", "monthly_review", "reconcile_wallets"]);
  });

  it("monthly_review walks the month and ends in three actions for the week", async () => {
    const t = await text("monthly_review", { budget_id: B, month: "2026-10" });
    for (const s of [B, "2026-10", "get_budget_overview", "spending_summary", "list_tasks", "3"]) expect(t).toContain(s);
  });

  it("import_spreadsheet: strict rows, preview, one question, no invented categories, commit, undo", async () => {
    const t = await text("import_spreadsheet", { budget_id: B });
    for (const s of [B, "500", "import_preview", "import_commit", "import_undo", "once"]) expect(t).toContain(s);
    expect(t.toLowerCase()).toContain("never");
  });

  it("reconcile_wallets asks for real balances and reports old → new", async () => {
    const t = await text("reconcile_wallets", { budget_id: B });
    for (const s of [B, "list_wallets", "sync_wallet_balance", "difference"]) expect(t).toContain(s);
  });

  it("never says draft", async () => {
    for (const [n, args] of [
      ["monthly_review", { budget_id: B, month: "2026-10" }],
      ["import_spreadsheet", { budget_id: B }],
      ["reconcile_wallets", { budget_id: B }],
    ] as const)
      expect((await text(n, args)).toLowerCase()).not.toContain("draft");
  });
});
