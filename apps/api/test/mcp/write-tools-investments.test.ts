/**
 * write-tools-investments.test.ts — 15-14: investment writes go through the
 * app's own routes, so Phase 13.1's rules (newest-first delete, sell into a
 * wallet) stay single-sourced. Real app, real tokens, real Postgres.
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
const { withUserContext, insertWriteLog } = await import("@budget/platform");
const { UserId } = await import("@budget/shared-kernel");

type App = Awaited<ReturnType<typeof testApp>>;
type Client = Awaited<ReturnType<typeof createSdkClient>>;
type Result = {
  isError?: boolean;
  structuredContent?: Record<string, any>;
  content: Array<{ text: string }>;
};

let app: App;
let a: TestUser;
let budgetId: string;
let client: Client;
const today = () => new Date().toISOString().slice(0, 10);

async function cookie(method: string, path: string, body?: unknown) {
  const res = await app.fetch(
    new Request(`${baseUrl()}${path}`, {
      method,
      headers: { cookie: a.cookie, "x-budget-id": budgetId, "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
  return res;
}

async function tool(name: string, args: Record<string, unknown>, c = client): Promise<Result> {
  clearRateLimits();
  return (await c.callTool({ name, arguments: args })) as Result;
}
const errorOf = (r: Result) => JSON.parse(r.content[0]!.text).error as string;

type Holding = { id: string; name: string; quantity: string; currentPriceCents: string | null };
async function holdings(): Promise<Holding[]> {
  const all: Holding[] = [];
  for (const q of ["", "?hidden=1"]) {
    const r = await cookie("GET", `/budgets/${budgetId}/investments${q}`);
    all.push(...((await r.json()) as { holdings: Holding[] }).holdings);
  }
  return all;
}
const holding = async (id: string) => (await holdings()).find((h) => h.id === id);
const entries = async (id: string) =>
  ((await (await cookie("GET", `/budgets/${budgetId}/investments/${id}/entries`)).json()) as {
    entries: Array<{ id: string; kind: string }>;
  }).entries;
const entriesFull = async (id: string) =>
  ((await (await cookie("GET", `/budgets/${budgetId}/investments/${id}/entries`)).json()) as {
    entries: Array<{ effectiveDate: string; amountCents: string | null; amountCurrency: string | null }>;
  }).entries;

async function logOf(callId: string) {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.current_user_id', $1, true)`, [a.userId]);
    const r = await c.query(
      `SELECT * FROM shared_kernel.mcp_write_log WHERE call_id = $1 ORDER BY created_at`,
      [callId],
    );
    await c.query("COMMIT");
    return r.rows;
  } finally {
    c.release();
    await pool.end();
  }
}

let btc: string;
let walletId: string;

beforeAll(async () => {
  app = await testApp();
  a = await signUpTestUser(app);
  budgetId = await seedBudget(a.userId, { currency: "USD" });
  const t = await mintMcpToken(app, a, ["read", "write"]);
  client = await createSdkClient(app, t.accessToken);
  const w = await cookie("POST", "/wallets", { name: "Bank", walletType: "SPENDINGS", currency: "USD" });
  walletId = ((await w.json()) as { id: string }).id;
});

describe("a budget with investments switched off", () => {
  it("an investment write turns the switch on quietly, so the asset shows", async () => {
    const off = await seedBudget(a.userId, { currency: "USD", investments: false });
    const listed = (await tool("list_budgets", {})).structuredContent!.budgets as any[];
    expect(listed.find((x) => x.budget_id === off).investments_enabled).toBe(false);
    expect(listed.find((x) => x.budget_id === budgetId).investments_enabled).toBe(true);

    const r = await tool("record_investment_transaction", {
      budget_id: off,
      side: "buy",
      new_asset: { name: "Quiet coin", type: "crypto" },
      date: today(),
      quantity: "0.001",
      price: "70000.00",
      currency: "USD",
    });
    expect(r.isError).toBeFalsy();
    const after = (await tool("list_budgets", {})).structuredContent!.budgets as any[];
    expect(after.find((x) => x.budget_id === off).investments_enabled).toBe(true);
    const visible = await app.fetch(
      new Request(`${baseUrl()}/budgets/${off}/investments`, { headers: { cookie: a.cookie, "x-budget-id": off } }),
    );
    const names = ((await visible.json()) as { holdings: Holding[] }).holdings.map((h) => h.name);
    expect(names).toContain("Quiet coin");
  });
});

describe("record_investment_transaction", () => {
  it("buys a new asset with crypto precision and logs the asset and its entry", async () => {
    const r = await tool("record_investment_transaction", {
      budget_id: budgetId,
      side: "buy",
      new_asset: { name: "Bitcoin test", type: "crypto" },
      date: today(),
      quantity: "0.12345678",
      price: "50000.00",
      currency: "USD",
    });
    expect(r.isError).toBeFalsy();
    btc = r.structuredContent!.asset_id;
    expect((await holding(btc))!.quantity).toBe("0.12345678");
    const log = await logOf(r.structuredContent!.call_id);
    // 15-20: the new asset is logged too, so undo can tell it is gone.
    expect(log.map((l: any) => l.entity_type).sort()).toEqual(["investment_asset", "investment_entry"]);
    const entry = log.find((l: any) => l.entity_type === "investment_entry");
    expect(entry.op).toBe("create");
    expect((await entries(btc)).map((e) => e.id)).toContain(entry.entity_id);
  });

  it("buys more of an existing asset", async () => {
    const r = await tool("record_investment_transaction", {
      budget_id: budgetId,
      side: "buy",
      asset_id: btc,
      date: today(),
      quantity: "0.1",
      price: "60000.00",
      currency: "USD",
    });
    expect(r.isError).toBeFalsy();
    expect((await holding(btc))!.quantity).toBe("0.22345678");
  });

  it("sells into a wallet, crediting it like the app", async () => {
    const r = await tool("record_investment_transaction", {
      budget_id: budgetId,
      side: "sell",
      asset_id: btc,
      date: today(),
      quantity: "0.05",
      received: "2500.00",
      currency: "USD",
      destination: { wallet_id: walletId },
    });
    expect(r.isError).toBeFalsy();
    expect((await holding(btc))!.quantity).toBe("0.17345678");
    const w = (await (await cookie("GET", `/wallets/${walletId}`)).json()) as {
      currentBalanceCents: string;
    };
    expect(w.currentBalanceCents).toBe("250000");
  });

  it("transfers part of an asset to a new one of the same type", async () => {
    const r = await tool("record_investment_transaction", {
      budget_id: budgetId,
      side: "transfer",
      asset_id: btc,
      date: today(),
      quantity: "0.01",
      destination: { new_asset_name: "Cold wallet" },
    });
    expect(r.isError).toBeFalsy();
    expect((await holding(btc))!.quantity).toBe("0.16345678");
    expect((await holdings()).some((h) => h.name === "Cold wallet")).toBe(true);
  });
});

describe("delete_investment_entry", () => {
  it("refuses an entry that is not the newest (D-09)", async () => {
    const oldest = (await entries(btc)).at(-1)!;
    const r = await tool("delete_investment_entry", {
      budget_id: budgetId,
      asset_id: btc,
      entry_id: oldest.id,
    });
    expect(r.isError).toBe(true);
    expect(errorOf(r)).toMatch(/not_newest/);
  });

  it("deletes the newest and logs it", async () => {
    const qty = (await holding(btc))!.quantity;
    const newest = (await entries(btc))[0]!;
    const r = await tool("delete_investment_entry", {
      budget_id: budgetId,
      asset_id: btc,
      entry_id: newest.id,
    });
    expect(r.isError).toBeFalsy();
    expect((await holding(btc))!.quantity).not.toBe(qty);
    const [log] = await logOf(r.structuredContent!.call_id);
    expect(log).toMatchObject({ op: "delete", entity_id: newest.id });
    expect(log.before_jsonb.id).toBe(newest.id);
  });
});

// 15-18 UAT: "XTB broker, 3000 zł on 1 Jan 2024, +$2000 on 5 Apr 2024, worth
// 1 500 000 UAH on 15 Aug 2026" failed with shape_mismatch. Every amount stays
// in the currency the user said — nothing converted unasked.
describe("a broker account in three currencies", () => {
  it("opens, takes a deposit, and gets a dated value, each as the user said it", async () => {
    const made = await tool("record_investment_transaction", {
      budget_id: budgetId,
      side: "buy",
      new_asset: { name: "XTB", type: "broker" },
      date: "2024-01-01",
      amount: "3000.00",
      currency: "PLN",
    });
    expect(made.isError).toBeFalsy();
    const id = made.structuredContent!.asset_id;

    const add = await tool("record_investment_transaction", {
      budget_id: budgetId,
      side: "buy",
      asset_id: id,
      date: "2024-04-05",
      amount: "2000.00",
      currency: "USD",
    });
    expect(add.isError).toBeFalsy();
    const deposit = (await entriesFull(id)).find((e) => e.effectiveDate === "2024-04-05")!;
    expect(deposit.amountCents).toBe("200000");
    expect(deposit.amountCurrency).toBe("USD");

    const v = await tool("update_holding_value", {
      budget_id: budgetId,
      asset_id: id,
      value: "1500000.00",
      currency: "UAH",
      date: "2026-08-15",
    });
    expect(v.isError).toBeFalsy();
    const h = (await holdings()).find((x) => x.id === id) as Holding & { currentPriceCurrency: string };
    expect(h.currentPriceCents).toBe("150000000");
    expect(h.currentPriceCurrency).toBe("UAH");
    expect((await entriesFull(id)).some((e) => e.effectiveDate === "2026-08-15")).toBe(true);
  });
});

describe("update_holding_value", () => {
  it("sets a hand-valued asset's value and logs before and after", async () => {
    const made = await tool("record_investment_transaction", {
      budget_id: budgetId,
      side: "buy",
      new_asset: { name: "Savings pot", type: "savings" },
      date: today(),
      amount: "1000.00",
      currency: "USD",
    });
    expect(made.isError).toBeFalsy();
    const id = made.structuredContent!.asset_id;
    // Worth what was put in, as when the app creates it — never 0.
    expect((await holding(id))!.currentPriceCents).toBe("100000");
    const r = await tool("update_holding_value", {
      budget_id: budgetId,
      asset_id: id,
      value: "1200.00",
    });
    expect(r.isError).toBeFalsy();
    expect((await holding(id))!.currentPriceCents).toBe("120000");
    const [log] = await logOf(r.structuredContent!.call_id);
    expect(log).toMatchObject({ op: "create", entity_type: "investment_entry" });
  });
});

describe("daily cap on the investment tools", () => {
  it("refuses each one before it changes anything", async () => {
    const t = await mintMcpToken(app, a, ["read", "write"]);
    const capped = await createSdkClient(app, t.accessToken);
    await withUserContext(UserId(a.userId), (tx) =>
      insertWriteLog(tx, [
        {
          tenantId: budgetId,
          userId: a.userId,
          clientId: t.clientId,
          callId: crypto.randomUUID(),
          batchId: null,
          tool: "add_transactions",
          entityType: "transaction",
          entityId: "seed",
          op: "create",
          before: null,
          after: null,
          entryCount: 5000,
        },
      ]),
    );
    const qty = (await holding(btc))!.quantity;
    const newest = (await entries(btc))[0]!;
    const calls: Array<[string, Record<string, unknown>]> = [
      ["record_investment_transaction", { budget_id: budgetId, side: "buy", asset_id: btc, date: today(), quantity: "1", price: "1.00", currency: "USD" }],
      ["update_holding_value", { budget_id: budgetId, asset_id: btc, unit_price: "1.00" }],
      ["delete_investment_entry", { budget_id: budgetId, asset_id: btc, entry_id: newest.id }],
    ];
    for (const [name, args] of calls) {
      const r = await tool(name, args, capped);
      expect(`${name}:${r.isError ? errorOf(r) : "ok"}`).toBe(`${name}:daily_entry_limit`);
    }
    expect((await holding(btc))!.quantity).toBe(qty);
    expect((await entries(btc))[0]!.id).toBe(newest.id);
  });
});
