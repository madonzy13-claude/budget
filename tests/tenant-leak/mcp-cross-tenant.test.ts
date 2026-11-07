/**
 * mcp-cross-tenant.test.ts — Tenant-leak gate for the MCP server (15-17,
 * MCP-05, T-15-65/66).
 *
 * Every MCP tool dispatches into the app's own routes as the token's user, so
 * tenantGuard checks budget membership on EVERY call. This proves it end to
 * end with real OAuth tokens through the real app:
 *   - user A's token cannot read or write user B's budget through any tool
 *     (read, write, undo, import), and B's data is unchanged;
 *   - a budget A joins AFTER consenting is reachable with the same token (D-01);
 *   - once A is removed from it, the same token gets an error (D-03);
 *   - list_recent_writes never shows another user's writes, even on a shared budget.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";
import {
  setupMcpTestEnv,
  testApp,
  baseUrl,
  signUpTestUser,
  seedBudget,
  mintMcpToken,
  createSdkClient,
  type TestUser,
} from "../../apps/api/test/mcp/helpers";

await setupMcpTestEnv();
const { clearRateLimits } =
  await import("../../apps/api/src/middleware/rate-limit");

type App = Awaited<ReturnType<typeof testApp>>;
type Client = Awaited<ReturnType<typeof createSdkClient>>;
type Result = {
  isError?: boolean;
  structuredContent?: Record<string, any>;
  content: Array<{ text: string }>;
};

let app: App;
let a: TestUser;
let bUser: TestUser;
let budgetA: string;
let budgetB: string;
let shared: string;
let catB: string;
let txnB: string;
let clientA: Client;
let clientB: Client;

async function cookie(
  who: TestUser,
  budget: string,
  method: string,
  path: string,
  body?: unknown,
) {
  const res = await app.fetch(
    new Request(`${baseUrl()}${path}`, {
      method,
      headers: {
        cookie: who.cookie,
        "x-budget-id": budget,
        "content-type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
  if (!res.ok)
    throw new Error(`${method} ${path} ${res.status} ${await res.text()}`);
  return res.json() as Promise<any>;
}

async function tool(
  c: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<Result> {
  clearRateLimits();
  return (await c.callTool({ name, arguments: args })) as Result;
}

/** B's budget as B sees it: what must never change. */
const snapshotB = async () => {
  const t = await cookie(
    bUser,
    budgetB,
    "GET",
    `/budgets/${budgetB}/transactions/search?limit=200`,
  );
  return t.transactions
    .map(
      (x: any) =>
        `${x.id}|${x.amount_original_cents}|${x.category_id}|${x.note ?? ""}`,
    )
    .sort();
};

async function membership(budget: string, user: string, op: "add" | "remove") {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  try {
    if (op === "add")
      await pool.query(
        `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at) VALUES ($1, $2, $3, 'member', now())`,
        [crypto.randomUUID(), budget, user],
      );
    else {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        await c.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
          `{${budget}}`,
        ]);
        await c.query(
          `DELETE FROM tenancy.budget_members WHERE budget_id = $1 AND user_id = $2`,
          [budget, user],
        );
        await c.query("COMMIT");
      } finally {
        c.release();
      }
    }
  } finally {
    await pool.end();
  }
}

beforeAll(async () => {
  app = await testApp();
  a = await signUpTestUser(app);
  bUser = await signUpTestUser(app);
  budgetA = await seedBudget(a.userId, { currency: "PLN", name: "A" });
  budgetB = await seedBudget(bUser.userId, { currency: "PLN", name: "B" });
  shared = await seedBudget(bUser.userId, {
    currency: "PLN",
    name: "Shared later",
  });
  catB = (
    await cookie(bUser, budgetB, "POST", `/budgets/${budgetB}/categories`, {
      name: "B food",
    })
  ).category.id;
  txnB = (
    await cookie(bUser, budgetB, "POST", `/budgets/${budgetB}/transactions`, {
      date: "2026-10-01",
      category_id: catB,
      amount_original_cents: 1234,
      note: "B's own",
    })
  ).transaction.id;
  clientA = await createSdkClient(
    app,
    (await mintMcpToken(app, a, ["read", "write"])).accessToken,
  );
  clientB = await createSdkClient(
    app,
    (await mintMcpToken(app, bUser, ["read", "write"])).accessToken,
  );
}, 60_000);

describe("MCP: user A's token against user B's budget", () => {
  it("list_budgets never includes B's budget", async () => {
    const ids = (
      await tool(clientA, "list_budgets", {})
    ).structuredContent!.budgets.map((x: any) => x.budget_id);
    expect(ids).toContain(budgetA);
    expect(ids).not.toContain(budgetB);
    expect(ids).not.toContain(shared);
  });

  it("every read, write, undo and import tool refuses B's budget and B's ids; B's data is unchanged", async () => {
    const before = await snapshotB();
    // B makes an MCP write of its own, so A has a real foreign call_id to try.
    const bWrite = await tool(clientB, "add_transactions", {
      budget_id: budgetB,
      idempotency_key: crypto.randomUUID(),
      rows: [{ date: "2026-10-02", category_id: catB, amount: "5.00" }],
    });
    expect(bWrite.isError).toBeFalsy();
    const withB = await snapshotB();
    expect(withB.length).toBe(before.length + 1);

    const attempts: Array<[string, Record<string, unknown>]> = [
      ["search_transactions", { budget_id: budgetB }],
      ["get_budget_overview", { budget_id: budgetB }],
      ["list_wallets", { budget_id: budgetB }],
      [
        "add_transactions",
        {
          budget_id: budgetB,
          idempotency_key: crypto.randomUUID(),
          rows: [{ date: "2026-10-03", category_id: catB, amount: "9.99" }],
        },
      ],
      [
        "add_transactions",
        {
          budget_id: budgetA,
          idempotency_key: crypto.randomUUID(),
          rows: [{ date: "2026-10-03", category_id: catB, amount: "9.99" }],
        },
      ],
      [
        "edit_transaction",
        {
          budget_id: budgetB,
          transaction_id: txnB,
          changes: { note: "pwned" },
        },
      ],
      [
        "edit_transaction",
        {
          budget_id: budgetA,
          transaction_id: txnB,
          changes: { note: "pwned" },
        },
      ],
      ["undo", { id: bWrite.structuredContent!.call_id }],
      [
        "import_preview",
        {
          budget_id: budgetB,
          kind: "transactions",
          rows: [{ date: "2026-10-04", category: "B food", amount: "1" }],
        },
      ],
    ];
    for (const [name, args] of attempts) {
      const r = await tool(clientA, name, args);
      expect({ name, isError: r.isError }).toEqual({ name, isError: true });
    }
    expect(await snapshotB()).toEqual(withB);
  }, 60_000);
});

describe("MCP: membership is checked live on every call", () => {
  it("a budget A joins after consenting is reachable with the same token (D-01)", async () => {
    await membership(shared, a.userId, "add");
    const ids = (
      await tool(clientA, "list_budgets", {})
    ).structuredContent!.budgets.map((x: any) => x.budget_id);
    expect(ids).toContain(shared);
    const cat = (
      await cookie(bUser, shared, "POST", `/budgets/${shared}/categories`, {
        name: "Shared food",
      })
    ).category.id;
    expect(
      (await tool(clientA, "search_transactions", { budget_id: shared }))
        .isError,
    ).toBeFalsy();
    const w = await tool(clientA, "add_transactions", {
      budget_id: shared,
      idempotency_key: crypto.randomUUID(),
      rows: [{ date: "2026-10-05", category_id: cat, amount: "3.00" }],
    });
    expect(w.isError).toBeFalsy();
  }, 60_000);

  it("list_recent_writes never shows B's writes, even on the shared budget", async () => {
    const cat = (
      await cookie(bUser, shared, "GET", `/budgets/${shared}/categories`)
    ).categories[0].id;
    const bw = await tool(clientB, "add_transactions", {
      budget_id: shared,
      idempotency_key: crypto.randomUUID(),
      rows: [{ date: "2026-10-06", category_id: cat, amount: "4.00" }],
    });
    expect(bw.isError).toBeFalsy();
    const mine = (await tool(clientA, "list_recent_writes", { limit: 50 }))
      .structuredContent!.writes as any[];
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.map((w) => w.call_id)).not.toContain(
      bw.structuredContent!.call_id,
    );
    expect(mine.every((w) => w.tool !== undefined)).toBe(true);
  }, 60_000);

  it("once A is removed, the same token gets an error for that budget (D-03)", async () => {
    await membership(shared, a.userId, "remove");
    expect(
      (await tool(clientA, "search_transactions", { budget_id: shared }))
        .isError,
    ).toBe(true);
    const cat = (
      await cookie(bUser, shared, "GET", `/budgets/${shared}/categories`)
    ).categories[0].id;
    expect(
      (
        await tool(clientA, "add_transactions", {
          budget_id: shared,
          idempotency_key: crypto.randomUUID(),
          rows: [{ date: "2026-10-07", category_id: cat, amount: "1.00" }],
        })
      ).isError,
    ).toBe(true);
    const ids = (
      await tool(clientA, "list_budgets", {})
    ).structuredContent!.budgets.map((x: any) => x.budget_id);
    expect(ids).not.toContain(shared);
  }, 60_000);
});
