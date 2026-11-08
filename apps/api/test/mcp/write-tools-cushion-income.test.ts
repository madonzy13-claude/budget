/**
 * write-tools-cushion-income.test.ts — 15-18 UAT: the owner changes the
 * cushion (on/off, target months, spending from it) and the incomes through
 * MCP; every member reads them. Each write goes through the app's own route,
 * so the app's owner gate applies. Real app, real tokens, real Postgres.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";
import {
  setupMcpTestEnv,
  testApp,
  signUpTestUser,
  seedBudget,
  mintMcpToken,
  createSdkClient,
  type TestUser,
} from "./helpers";

await setupMcpTestEnv();
const { clearRateLimits } = await import("../../src/middleware/rate-limit");

type App = Awaited<ReturnType<typeof testApp>>;
type Client = Awaited<ReturnType<typeof createSdkClient>>;
type Result = {
  isError?: boolean;
  structuredContent?: Record<string, any>;
  content: Array<{ text: string }>;
};

let app: App;
let owner: TestUser;
let member: TestUser;
let budgetId: string;
let ownerClient: Client;
let memberClient: Client;

async function tool(c: Client, name: string, args: Record<string, unknown>): Promise<Result> {
  clearRateLimits();
  return (await c.callTool({ name, arguments: args })) as Result;
}
const errorOf = (r: Result) => JSON.parse(r.content[0]!.text).error as string;

beforeAll(async () => {
  app = await testApp();
  owner = await signUpTestUser(app);
  member = await signUpTestUser(app);
  budgetId = await seedBudget(owner.userId, { currency: "PLN" });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.tenant_ids', $1, true)`, [`{${budgetId}}`]);
    await c.query(`SELECT set_config('app.current_user_id', $1, true)`, [owner.userId]);
    await c.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'member', now())`,
      [budgetId, member.userId],
    );
    await c.query("COMMIT");
  } finally {
    c.release();
    await pool.end();
  }
  ownerClient = await createSdkClient(app, (await mintMcpToken(app, owner, ["read", "write"])).accessToken);
  memberClient = await createSdkClient(app, (await mintMcpToken(app, member, ["read", "write"])).accessToken);
});

describe("cushion", () => {
  it("the owner switches it on, sets the target and spends from it; a member reads it", async () => {
    const r = await tool(ownerClient, "set_cushion", {
      budget_id: budgetId,
      enabled: true,
      target_months: 4.5,
      spend_from_cushion: true,
    });
    expect(r.isError).toBeFalsy();

    const read = await tool(memberClient, "get_cushion", { budget_id: budgetId });
    expect(read.isError).toBeFalsy();
    expect(read.structuredContent!.enabled).toBe(true);
    expect(read.structuredContent!.spend_from_cushion).toBe(true);
    expect(read.structuredContent!.target_months).toBe(4.5);
  });

  it("a member cannot change it", async () => {
    const r = await tool(memberClient, "set_cushion", { budget_id: budgetId, target_months: 2 });
    expect(r.isError).toBe(true);
    expect(errorOf(r)).toBe("owner_only");
    const read = await tool(memberClient, "get_cushion", { budget_id: budgetId });
    expect(read.structuredContent!.target_months).toBe(4.5);
  });

  it("undo puts the previous settings back", async () => {
    const r = await tool(ownerClient, "set_cushion", { budget_id: budgetId, target_months: 9 });
    expect(r.isError).toBeFalsy();
    const u = await tool(ownerClient, "undo", { id: r.structuredContent!.call_id });
    expect(u.isError).toBeFalsy();
    const read = await tool(ownerClient, "get_cushion", { budget_id: budgetId });
    expect(read.structuredContent!.target_months).toBe(4.5);
  });
});

describe("incomes", () => {
  let incomeId: string;

  it("the owner adds an income in the currency said; a member lists it", async () => {
    const r = await tool(ownerClient, "add_income", {
      budget_id: budgetId,
      name: "Salary",
      amount: "5000.00",
      currency: "USD",
      cadence: "MONTHLY",
      cadence_anchor: 10,
    });
    expect(r.isError).toBeFalsy();
    incomeId = r.structuredContent!.income.id;

    const list = await tool(memberClient, "list_incomes", { budget_id: budgetId });
    expect(list.isError).toBeFalsy();
    const salary = (list.structuredContent!.incomes as any[]).find((i) => i.id === incomeId);
    expect(salary.amount).toBe("5000.00");
    expect(salary.currency).toBe("USD");
  });

  it("edits only what changed, and undo restores it", async () => {
    const r = await tool(ownerClient, "edit_income", {
      budget_id: budgetId,
      income_id: incomeId,
      changes: { amount: "5500.00" },
    });
    expect(r.isError).toBeFalsy();
    let list = await tool(ownerClient, "list_incomes", { budget_id: budgetId });
    let salary = (list.structuredContent!.incomes as any[]).find((i) => i.id === incomeId);
    expect(salary.amount).toBe("5500.00");
    expect(salary.cadence_anchor ?? salary.cadenceAnchor).toBe(10);

    await tool(ownerClient, "undo", { id: r.structuredContent!.call_id });
    list = await tool(ownerClient, "list_incomes", { budget_id: budgetId });
    salary = (list.structuredContent!.incomes as any[]).find((i) => i.id === incomeId);
    expect(salary.amount).toBe("5000.00");
  });

  it("deletes it", async () => {
    const r = await tool(ownerClient, "delete_income", { budget_id: budgetId, income_id: incomeId });
    expect(r.isError).toBeFalsy();
    const list = await tool(ownerClient, "list_incomes", { budget_id: budgetId });
    expect((list.structuredContent!.incomes as any[]).some((i) => i.id === incomeId)).toBe(false);
  });
});

// 15-18 UAT: any member renames (their own label, as in the app); only the
// owner changes the currency.
describe("edit_budget", () => {
  const listed = async (c: Client) =>
    ((await tool(c, "list_budgets", {})).structuredContent!.budgets as any[]).find((x) => x.budget_id === budgetId);

  it("a member renames the budget for themselves", async () => {
    const r = await tool(memberClient, "edit_budget", { budget_id: budgetId, name: "Our home" });
    expect(r.isError).toBeFalsy();
    expect((await listed(memberClient)).name.untrusted_user_text).toBe("Our home");
  });

  it("a member cannot change the currency, and nothing changes", async () => {
    const r = await tool(memberClient, "edit_budget", { budget_id: budgetId, name: "Nope", currency: "EUR" });
    expect(r.isError).toBe(true);
    expect(errorOf(r)).toBe("owner_only");
    const b = await listed(memberClient);
    expect(b.currency).toBe("PLN");
    expect(b.name.untrusted_user_text).toBe("Our home");
  });

  it("the owner changes the currency, and undo puts it back", async () => {
    const r = await tool(ownerClient, "edit_budget", { budget_id: budgetId, currency: "EUR" });
    expect(r.isError).toBeFalsy();
    expect((await listed(ownerClient)).currency).toBe("EUR");
    await tool(ownerClient, "undo", { id: r.structuredContent!.call_id });
    expect((await listed(ownerClient)).currency).toBe("PLN");
  });
});
