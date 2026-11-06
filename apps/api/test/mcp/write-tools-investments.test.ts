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

describe("record_investment_transaction", () => {
  it("buys a new asset with crypto precision and logs the entry", async () => {
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
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ op: "create", entity_type: "investment_entry" });
    expect((await entries(btc)).map((e) => e.id)).toContain(log[0].entity_id);
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
