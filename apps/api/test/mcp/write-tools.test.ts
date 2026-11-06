/**
 * write-tools.test.ts — 15-13: the agent writes through the app's own routes,
 * under the write scope, the per-connection limits and the hidden write log.
 * Real app, real OAuth tokens, real Postgres (`infisical run --env=dev --`).
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";
import {
  setupMcpTestEnv,
  testApp,
  testDeps,
  baseUrl,
  signUpTestUser,
  seedBudget,
  mintMcpToken,
  createSdkClient,
  type TestUser,
} from "./helpers";

await setupMcpTestEnv();
const { clearRateLimits } = await import("../../src/middleware/rate-limit");
const { checkRate } = await import("../../src/mcp/limits");
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
let foodId: string;
let client: Client;
let clientId: string;

async function q<T = any>(
  text: string,
  params: unknown[],
  ctx: { user: string; budget?: string },
): Promise<T[]> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    if (ctx.budget)
      await c.query(`SELECT set_config('app.tenant_ids', $1, true)`, [`{${ctx.budget}}`]);
    await c.query(`SELECT set_config('app.current_user_id', $1, true)`, [ctx.user]);
    const r = await c.query(text, params);
    await c.query("COMMIT");
    return r.rows as T[];
  } finally {
    c.release();
    await pool.end();
  }
}

const ledgerCount = async (budget = budgetId) =>
  (
    await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM budgeting.expense_ledger WHERE tenant_id = $1`,
      [budget],
      { user: a.userId, budget },
    )
  )[0]!.n;

const logRows = (where = "TRUE", params: unknown[] = []) =>
  q(
    `SELECT * FROM shared_kernel.mcp_write_log WHERE user_id = $1 AND ${where}
      ORDER BY created_at, id`,
    [a.userId, ...params],
    { user: a.userId },
  );

async function cookie(method: string, path: string, body?: unknown, budget = budgetId) {
  return app.fetch(
    new Request(`${baseUrl()}${path}`, {
      method,
      headers: {
        cookie: a.cookie,
        "x-budget-id": budget,
        "content-type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
}

async function tool(name: string, args: Record<string, unknown>, c = client): Promise<Result> {
  clearRateLimits();
  return (await c.callTool({ name, arguments: args })) as Result;
}

const errorOf = (r: Result) => JSON.parse(r.content[0]!.text).error as string;
const key = () => `k-${crypto.randomUUID()}`;
const today = () => new Date().toISOString().slice(0, 10);

async function newCategory(budget = budgetId, name = "Cat"): Promise<string> {
  const id = crypto.randomUUID();
  await q(
    `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
     VALUES ($1, $2, $3, now(), $4)`,
    [id, budget, name, a.userId],
    { user: a.userId, budget },
  );
  return id;
}

beforeAll(async () => {
  app = await testApp();
  a = await signUpTestUser(app);
  budgetId = await seedBudget(a.userId, { currency: "PLN" });
  foodId = await newCategory(budgetId, "Food");
  const t = await mintMcpToken(app, a, ["read", "write"]);
  clientId = t.clientId;
  client = await createSdkClient(app, t.accessToken);
});

describe("add_transactions", () => {
  it("refuses a read-only token and writes nothing", async () => {
    const { accessToken } = await mintMcpToken(app, a, ["read"]);
    const ro = await createSdkClient(app, accessToken);
    const before = await ledgerCount();
    const call = tool(
      "add_transactions",
      {
        budget_id: budgetId,
        idempotency_key: key(),
        rows: [{ date: today(), category_id: foodId, amount: "1.00" }],
      },
      ro,
    ).then(
      (r) => errorOf(r),
      (e: Error) => String(e),
    );
    // The SDK answers with a 403 write-scope challenge before the tool runs.
    expect(await call).toMatch(/insufficient_scope|403/);
    expect(await ledgerCount()).toBe(before);
  });

  it("adds rows exactly like the app does, and logs each one", async () => {
    const idem = key();
    const r = await tool("add_transactions", {
      budget_id: budgetId,
      idempotency_key: idem,
      rows: [
        { date: today(), category_id: foodId, amount: "12.50" },
        { date: today(), category_id: foodId, amount: "-3.00", note: "refund" },
        { date: "2026-10-01", category_id: foodId, amount: "10.00", currency: "EUR" },
      ],
    });
    expect(r.isError).toBeFalsy();
    const created = r.structuredContent!.created as Array<{ id: string }>;
    expect(created).toHaveLength(3);
    const callId = r.structuredContent!.call_id as string;

    // D-07: the same shape the app's own route answers with — no extra keys.
    const direct = await cookie("POST", `/budgets/${budgetId}/transactions`, {
      date: today(),
      category_id: foodId,
      amount_original_cents: 100,
    });
    expect(direct.status).toBe(201);
    const directRow = ((await direct.json()) as { transaction: Record<string, unknown> })
      .transaction;
    const viaTool = (await (
      await cookie("GET", `/budgets/${budgetId}/transactions/${created[0]!.id}`)
    ).json()) as { transaction: Record<string, unknown> };
    expect(Object.keys(viaTool.transaction).sort()).toEqual(Object.keys(directRow).sort());
    expect(viaTool.transaction.amount_original_cents).toBe("1250");

    // EUR in a PLN budget: converted at that date's rate (Phase 14).
    const eur = (await (
      await cookie("GET", `/budgets/${budgetId}/transactions/${created[2]!.id}`)
    ).json()) as { transaction: Record<string, string> };
    expect(eur.transaction.currency_original).toBe("EUR");
    expect(Number(eur.transaction.fx_rate)).toBeGreaterThan(1);

    const log = await logRows("call_id = $2", [callId]);
    expect(log).toHaveLength(3);
    for (const row of log) {
      expect(row).toMatchObject({
        op: "create",
        entity_type: "transaction",
        tool: "add_transactions",
        client_id: clientId,
        tenant_id: budgetId,
        entry_count: 1,
      });
    }
    expect(log.map((l) => l.entity_id).sort()).toEqual(created.map((c) => c.id).sort());
    expect(log[0]!.after_jsonb.id).toBe(log[0]!.entity_id);
  });

  it("refreshes the reserve task like the app's own route", async () => {
    const budget = await seedBudget(a.userId, { currency: "USD" });
    await q(
      `UPDATE tenancy.budgets SET reserves_enabled = true WHERE id = $1`,
      [budget],
      { user: a.userId, budget },
    );
    await q(
      `INSERT INTO budgeting.wallets
         (id, tenant_id, name, currency, current_balance, wallet_type, created_at, actor_user_id)
       VALUES (gen_random_uuid(), $1, 'Reserve', 'USD', 500, 'RESERVE', now(), $2)`,
      [budget, a.userId],
      { user: a.userId, budget },
    );
    const cat = await newCategory(budget);
    const r = await tool("add_transactions", {
      budget_id: budget,
      idempotency_key: key(),
      rows: [{ date: today(), category_id: cat, amount: "5.00" }],
    });
    expect(r.isError).toBeFalsy();
    const tasks = await q(
      `SELECT payload_json->>'direction' AS direction FROM budgeting.tasks
        WHERE tenant_id = $1 AND kind = 'RESERVE_TOPUP' AND status = 'PENDING'`,
      [budget],
      { user: a.userId, budget },
    );
    expect(tasks).toHaveLength(1);
  });

  it("replaying the same key creates and logs nothing", async () => {
    const args = {
      budget_id: budgetId,
      idempotency_key: key(),
      rows: [
        { date: today(), category_id: foodId, amount: "1.00" },
        { date: today(), category_id: foodId, amount: "2.00" },
      ],
    };
    const first = await tool("add_transactions", args);
    const rows = await ledgerCount();
    const logged = (await logRows()).length;

    const again = await tool("add_transactions", args);
    expect(again.isError).toBeFalsy();
    expect(again.structuredContent!.created.map((c: { id: string }) => c.id)).toEqual(
      first.structuredContent!.created.map((c: { id: string }) => c.id),
    );
    expect(await ledgerCount()).toBe(rows);
    expect((await logRows()).length).toBe(logged);

    const swapped = await tool("add_transactions", {
      ...args,
      rows: [{ date: today(), category_id: foodId, amount: "9.00" }],
    });
    expect(swapped.isError).toBe(true);
    expect(errorOf(swapped)).toBe("idempotency_key_reused_with_different_body");
  });

  it("a retry after a mid-batch failure logs only the rows it wrote", async () => {
    const later = crypto.randomUUID(); // a category that does not exist yet
    const args = {
      budget_id: budgetId,
      idempotency_key: key(),
      rows: [
        { date: today(), category_id: foodId, amount: "1.00" },
        { date: today(), category_id: later, amount: "2.00" },
        { date: today(), category_id: foodId, amount: "3.00" },
      ],
    };
    const first = await tool("add_transactions", args);
    expect(first.isError).toBeFalsy();
    expect(first.structuredContent!.created).toHaveLength(1);
    expect(first.structuredContent!.failed.index).toBe(1);

    await q(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, 'Later', now(), $3)`,
      [later, budgetId, a.userId],
      { user: a.userId, budget: budgetId },
    );
    const retry = await tool("add_transactions", args);
    expect(retry.isError).toBeFalsy();
    expect(retry.structuredContent!.created).toHaveLength(3);
    expect(retry.structuredContent!.failed).toBeUndefined();

    const calls = [first, retry].map((r) => r.structuredContent!.call_id);
    const log = await logRows("call_id = ANY($2::uuid[])", [calls]);
    expect(log).toHaveLength(3);
    expect(log.filter((l) => l.call_id === calls[1])).toHaveLength(2);
  });

  it("refuses more than 500 rows and writes nothing", async () => {
    const before = await ledgerCount();
    const r = await tool("add_transactions", {
      budget_id: budgetId,
      idempotency_key: key(),
      rows: Array.from({ length: 501 }, () => ({
        date: today(),
        category_id: foodId,
        amount: "1.00",
      })),
    });
    expect(r.isError).toBe(true);
    expect(errorOf(r)).toBe("too_many_rows");
    expect(await ledgerCount()).toBe(before);
  });

  it.each([
    ["12.345", undefined, "too_many_decimals"],
    ["12.00", "XYZ", "unsupported_currency"],
  ])("rejects amount %s %s before writing anything", async (amount, currency, code) => {
    const before = await ledgerCount();
    const r = await tool("add_transactions", {
      budget_id: budgetId,
      idempotency_key: key(),
      rows: [
        { date: today(), category_id: foodId, amount: "1.00" },
        { date: today(), category_id: foodId, amount, ...(currency ? { currency } : {}) },
      ],
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content[0]!.text)).toMatchObject({ error: code, index: 1 });
    expect(await ledgerCount()).toBe(before);
  });

  it("accepts a row dated two years ago (D-12)", async () => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - 2);
    const r = await tool("add_transactions", {
      budget_id: budgetId,
      idempotency_key: key(),
      rows: [{ date: d.toISOString().slice(0, 10), category_id: foodId, amount: "4.00" }],
    });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent!.created).toHaveLength(1);
  });
});

describe("write limits", () => {
  it("the 21st write in a minute is rate limited", async () => {
    clearRateLimits();
    for (let i = 0; i < 20; i++) checkRate({ clientId, userId: a.userId }, "write");
    const r = (await client.callTool({
      name: "add_transactions",
      arguments: {
        budget_id: budgetId,
        idempotency_key: key(),
        rows: [{ date: today(), category_id: foodId, amount: "1.00" }],
      },
    })) as Result;
    expect(r.isError).toBe(true);
    expect(errorOf(r)).toBe("rate_limited");
  });

  it("the daily entry cap is checked before anything is written", async () => {
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
          entryCount: 4999,
        },
      ]),
    );
    const before = await ledgerCount();
    const r = await tool(
      "add_transactions",
      {
        budget_id: budgetId,
        idempotency_key: key(),
        rows: [
          { date: today(), category_id: foodId, amount: "1.00" },
          { date: today(), category_id: foodId, amount: "1.00" },
        ],
      },
      capped,
    );
    expect(r.isError).toBe(true);
    expect(errorOf(r)).toBe("daily_entry_limit");
    expect(await ledgerCount()).toBe(before);
  });
});

describe("writeTool wrapper", () => {
  it("refuses a mutating dispatch that skipped the daily-cap preflight", async () => {
    const { McpServer } = await import("@modelcontextprotocol/server");
    const { z } = await import("zod");
    const { writeTool } = await import("../../src/mcp/tools/define");
    let reached = 0;
    const stub = { fetch: () => (reached++, new Response("{}", { status: 201 })) };
    const server = new McpServer({ name: "t", version: "1" });
    const handler = writeTool(
      server,
      {
        who: { userId: a.userId, clientId: "preflight-test", email: a.email, locale: "en" },
        scopes: ["read", "write"],
        deps: await testDeps(),
        app: stub,
      },
      "sneaky_write",
      { description: "test only", inputSchema: z.object({}) },
      async (_args, ctx) => {
        await ctx.dispatch({ method: "POST", path: "/anything", body: {} });
        return { result: {}, effects: [] };
      },
    );
    const r = (await handler({})) as Result;
    expect(r.isError).toBe(true);
    expect(errorOf(r)).toBe("preflight_required");
    expect(reached).toBe(0);
  });
});
