/**
 * write-tools-wallets-deposits.test.ts — 15-18 UAT:
 *  - a deposit keeps its rate, capitalization and end (it used to land with
 *    the rate in its note);
 *  - wallets are created, edited (name, currency, balance — never converted)
 *    and deleted through MCP, the way the app does it.
 * Real app, real tokens, real Postgres.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import {
  setupMcpTestEnv,
  testApp,
  baseUrl,
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
type Result = { isError?: boolean; structuredContent?: Record<string, any>; content: Array<{ text: string }> };

let app: App;
let a: TestUser;
let budgetId: string;
let client: Client;
const today = () => new Date().toISOString().slice(0, 10);

async function tool(name: string, args: Record<string, unknown>): Promise<Result> {
  clearRateLimits();
  return (await client.callTool({ name, arguments: args })) as Result;
}

async function get(path: string): Promise<any> {
  const res = await app.fetch(
    new Request(`${baseUrl()}${path}`, { headers: { cookie: a.cookie, "x-budget-id": budgetId } }),
  );
  return res.json();
}

beforeAll(async () => {
  app = await testApp();
  a = await signUpTestUser(app);
  budgetId = await seedBudget(a.userId, { currency: "PLN" });
  client = await createSdkClient(app, (await mintMcpToken(app, a, ["read", "write"])).accessToken);
});

describe("a deposit", () => {
  it("keeps its rate, capitalization and open end", async () => {
    const r = await tool("record_investment_transaction", {
      budget_id: budgetId,
      side: "buy",
      new_asset: { name: "Deposit at dad's", type: "deposit" },
      date: today(),
      amount: "250.00",
      currency: "PLN",
      deposit: { annual_rate_percent: "35", capitalization: "monthly", start_date: today() },
    });
    expect(r.isError).toBeFalsy();
    const id = r.structuredContent!.asset_id;
    const h = ((await get(`/budgets/${budgetId}/investments`)).holdings as any[]).find((x) => x.id === id);
    expect(h.depositRateBps).toBe(3500);
    expect(h.depositCapFrequency).toBe("monthly");
    expect(h.depositStartDate).toBe(today());
    expect(h.depositEndDate).toBeNull();
    expect(h.note ?? null).toBeNull();
  });

  it("refuses a deposit without its rate", async () => {
    const r = await tool("record_investment_transaction", {
      budget_id: budgetId,
      side: "buy",
      new_asset: { name: "No rate", type: "deposit" },
      date: today(),
      amount: "100.00",
      currency: "PLN",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content[0]!.text).error).toBe("deposit_details_required");
  });

  it("refuses a deposit without its start date", async () => {
    const r = await tool("record_investment_transaction", {
      budget_id: budgetId,
      side: "buy",
      new_asset: { name: "No start", type: "deposit" },
      date: today(),
      amount: "100.00",
      currency: "PLN",
      deposit: { annual_rate_percent: "5", capitalization: "monthly" },
    });
    expect(r.isError).toBe(true);
  });
});

describe("wallets", () => {
  let walletId: string;
  const wallet = async (id: string) => get(`/wallets/${id}`);

  it("creates a wallet with its balance in the currency said", async () => {
    const r = await tool("create_wallet", {
      budget_id: budgetId,
      name: "Erste",
      currency: "USD",
      balance: "150.00",
    });
    expect(r.isError).toBeFalsy();
    walletId = r.structuredContent!.wallet.id;
    const w = await wallet(walletId);
    expect(w.name).toBe("Erste");
    expect(w.currency).toBe("USD");
    expect(String(w.currentBalanceCents)).toBe("15000");
    expect(w.walletType).toBe("SPENDINGS");
  });

  it("changes name, currency and balance without converting, and undo restores them", async () => {
    const r = await tool("edit_wallet", {
      budget_id: budgetId,
      wallet_id: walletId,
      name: "Cash UAH",
      currency: "UAH",
      balance: "450.00",
    });
    expect(r.isError).toBeFalsy();
    let w = await wallet(walletId);
    expect([w.name, w.currency, String(w.currentBalanceCents)]).toEqual(["Cash UAH", "UAH", "45000"]);

    await tool("undo", { id: r.structuredContent!.call_id });
    w = await wallet(walletId);
    expect([w.name, w.currency, String(w.currentBalanceCents)]).toEqual(["Erste", "USD", "15000"]);
  });

  it("deletes it, as the app does", async () => {
    const r = await tool("delete_wallet", { budget_id: budgetId, wallet_id: walletId });
    expect(r.isError).toBeFalsy();
    const list = (await get("/wallets")).wallets as any[];
    expect(list.some((x) => x.id === walletId)).toBe(false);
  });
});
